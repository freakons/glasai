export const runtime = 'nodejs';

/**
 * Omterminal — Canonical Pipeline Orchestration Route
 *
 * POST /api/pipeline/run   (GET aliased for cron compatibility)
 *
 * This is the single authoritative entrypoint for the complete intelligence
 * pipeline. All automated (cron) and manual pipeline triggers should use
 * this route.
 *
 * Pipeline stages (in order):
 *   1. ingest      — fetch fresh articles from GNews, write to events table
 *   2. signals     — generate signals from recent events, write to signals table
 *   3. snapshots   — generate precomputed read-model snapshots for public pages
 *   4. cache       — invalidate Redis hot-feed keys + revalidate Next.js routes
 *
 * Concurrency:
 *   Acquires a distributed lock (Redis NX or DB pipeline_locks fallback).
 *   A second run while one is active returns status=skipped_active_run (HTTP 409).
 *   Lock TTL = PIPELINE_LOCK_TTL_SECONDS env (default 300 s).
 *
 * Timeout:
 *   Each stage has an independent timeout (configurable via env).
 *   The whole pipeline has an overall timeout guard (PIPELINE_TIMEOUT_MS).
 *   Stale stages produce error entries but do not crash the process.
 *
 * Dry-run:
 *   Add ?dry_run=true to validate auth + env without executing anything.
 *
 * Auth:
 *   - x-vercel-cron-secret header == CRON_SECRET env (Vercel cron scheduler)
 *   - ?secret= query param == CRON_SECRET env (manual trigger)
 *   - x-admin-secret header == ADMIN_SECRET env (marks trigger_type=admin)
 *   - No CRON_SECRET configured → open in local dev only (NODE_ENV !== production)
 *
 * Observability:
 *   Every run (including skipped/dry-run) is recorded in pipeline_runs.
 *   Check /api/health for last-run status, lock state, and stale-data warnings.
 */

import { NextRequest, NextResponse }           from 'next/server';
import { validateEnvironment }                  from '@/lib/env';
import { createRequestId, logWithRequestId }    from '@/lib/requestId';
import { ingestGNews }                          from '@/services/ingestion/gnewsFetcher';
import { ingestRss }                            from '@/services/ingestion/rssIngester';
import { getRecentEvents }                      from '@/services/storage/eventStore';
import { generateSignalsFromEvents }            from '@/services/signals/signalEngine';
import { saveSignals }                          from '@/services/storage/signalStore';
import { withPipelineLock, pipelineLockedResponse } from '@/lib/pipelineLock';
import { generatePageSnapshots }               from '@/lib/pipeline/snapshot';
import { refreshCaches }                        from '@/lib/pipeline/cacheRefresh';
import { dbQuery }                              from '@/db/client';
import type { TriggerType, RunStatus, PipelineStageResult } from '@/lib/pipeline/types';
import { toDbStatus }                           from '@/lib/pipeline/types';

// Vercel function timeout (seconds). Increase to 300 on Pro plan.
// https://vercel.com/docs/functions/runtimes#max-duration
export const maxDuration = 60;

// ── Stage timeout defaults (ms) ───────────────────────────────────────────────
const TIMEOUT = {
  INGEST:   parseInt(process.env.PIPELINE_INGEST_TIMEOUT_MS   ?? '30000', 10),
  SIGNALS:  parseInt(process.env.PIPELINE_SIGNALS_TIMEOUT_MS  ?? '10000', 10),
  SNAPSHOT: parseInt(process.env.PIPELINE_SNAPSHOT_TIMEOUT_MS ?? '15000', 10),
  CACHE:    parseInt(process.env.PIPELINE_CACHE_TIMEOUT_MS    ?? '5000',  10),
  OVERALL:  parseInt(process.env.PIPELINE_TIMEOUT_MS          ?? '55000', 10),
} as const;

// ── Auth ──────────────────────────────────────────────────────────────────────

function detectTriggerType(req: NextRequest): TriggerType {
  // Admin secret header → admin trigger
  const adminHeader = req.headers.get('x-admin-secret') ?? '';
  if (adminHeader && adminHeader === (process.env.ADMIN_SECRET ?? '')) return 'admin';

  // Vercel cron secret header → cron trigger
  const cronSecret = process.env.CRON_SECRET ?? '';
  const cronHeader = req.headers.get('x-vercel-cron-secret') ?? '';
  if (cronSecret && cronHeader === cronSecret) return 'cron';

  return 'manual';
}

function isAuthorized(req: NextRequest): boolean {
  const cronSecret  = process.env.CRON_SECRET  ?? '';
  const adminSecret = process.env.ADMIN_SECRET ?? '';
  const isProd      = process.env.NODE_ENV === 'production';

  // In production, missing secrets must fail closed — never open the endpoint.
  if (isProd && !cronSecret && !adminSecret) return false;

  // In development with no secrets configured, allow for ergonomics.
  if (!cronSecret && !adminSecret) return true;

  // Do NOT trust User-Agent for authentication — it is trivially spoofable.
  const cronHeader  = req.headers.get('x-vercel-cron-secret') ?? '';
  const querySecret = new URL(req.url).searchParams.get('secret') ?? '';
  const adminHeader = req.headers.get('x-admin-secret') ?? '';

  if (cronSecret  && (cronHeader === cronSecret || querySecret === cronSecret)) return true;
  if (adminSecret && adminHeader === adminSecret) return true;

  return false;
}

// ── Stage runner with timeout ─────────────────────────────────────────────────

async function runStage<T>(
  name: string,
  fn: () => Promise<T>,
  timeoutMs: number,
): Promise<{ result?: T; error?: string; durationMs: number }> {
  const t0 = Date.now();
  const timer = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`stage "${name}" timed out after ${timeoutMs}ms`)),
      timeoutMs,
    ),
  );
  try {
    const result = await Promise.race([fn(), timer]);
    return { result, durationMs: Date.now() - t0 };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err), durationMs: Date.now() - t0 };
  }
}

// ── DB run record ─────────────────────────────────────────────────────────────

interface RunRecord {
  correlationId: string;
  triggerType: TriggerType;
  status: string;
  durationMs: number;
  articlesInserted: number;
  articlesFetched: number;
  articlesDeduped: number;
  signalsGenerated: number;
  errorsCount: number;
  errorSummary?: string;
}

async function persistRunRecord(r: RunRecord): Promise<void> {
  // Try with extended columns (migration 005)
  try {
    await dbQuery`
      INSERT INTO pipeline_runs (
        stage, status, trigger_type, started_at, completed_at, correlation_id,
        ingested, signals_generated, duration_ms,
        articles_fetched, articles_inserted, articles_deduped,
        errors_count, error_summary
      )
      VALUES (
        'full', ${r.status}, ${r.triggerType}, NOW(), NOW(), ${r.correlationId},
        ${r.articlesInserted}, ${r.signalsGenerated}, ${r.durationMs},
        ${r.articlesFetched}, ${r.articlesInserted}, ${r.articlesDeduped},
        ${r.errorsCount}, ${r.errorSummary ?? null}
      )
    `;
    return;
  } catch {
    // Extended columns not available — fall back to base schema
  }

  // Fallback: base columns only (pre-migration 005)
  const baseStatus =
    r.status === 'completed' || r.status === 'ok' ? 'ok' :
    r.status === 'failed'    || r.status === 'error' ? 'error' :
    r.status === 'partial' ? 'partial' :
    'ok';

  try {
    await dbQuery`
      INSERT INTO pipeline_runs (stage, status, ingested, signals_generated, duration_ms, error_msg)
      VALUES ('full', ${baseStatus}, ${r.articlesInserted}, ${r.signalsGenerated}, ${r.durationMs}, ${r.errorSummary ?? null})
    `;
  } catch {
    // Non-critical — run logging must never abort the pipeline response
  }
}

async function persistSkippedRun(
  correlationId: string,
  triggerType: TriggerType,
  reason: string,
): Promise<void> {
  try {
    await dbQuery`
      INSERT INTO pipeline_runs (
        stage, status, trigger_type, started_at, completed_at, correlation_id,
        duration_ms, ingested, signals_generated, error_summary
      )
      VALUES (
        'full', 'skipped', ${triggerType}, NOW(), NOW(), ${correlationId},
        0, 0, 0, ${reason}
      )
    `;
  } catch {
    // Fallback for pre-migration 005
    try {
      await dbQuery`
        INSERT INTO pipeline_runs (stage, status, ingested, signals_generated, duration_ms, error_msg)
        VALUES ('full', 'partial', 0, 0, 0, ${reason})
      `;
    } catch {
      // Non-critical
    }
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const correlationId = createRequestId();
  const url = new URL(req.url);
  const isDryRun = url.searchParams.get('dry_run') === 'true';

  validateEnvironment(['DATABASE_URL', 'CRON_SECRET']);

  if (!isAuthorized(req)) {
    logWithRequestId(correlationId, 'pipeline/run', 'unauthorized');
    return NextResponse.json(
      { ok: false, status: 'error', message: 'Unauthorized' },
      { status: 401 },
    );
  }

  const triggerType = detectTriggerType(req);
  logWithRequestId(correlationId, 'pipeline/run', `trigger=${triggerType} dry_run=${isDryRun}`);

  // ── Dry-run ───────────────────────────────────────────────────────────────
  if (isDryRun) {
    return NextResponse.json({
      ok:           true,
      status:       'dry_run' as RunStatus,
      runId:        correlationId,
      triggerType,
      dryRun:       true,
      startedAt:    new Date(t0).toISOString(),
      completedAt:  new Date().toISOString(),
      durationMs:   Date.now() - t0,
      message:      'Dry-run: auth and env validated. No pipeline execution performed.',
    });
  }

  // ── Concurrency lock ──────────────────────────────────────────────────────
  const guard = await withPipelineLock(triggerType, correlationId, 'pipeline/run', async () => {
    const stages: PipelineStageResult[] = [];
    let errorsCount = 0;
    let articlesFetched = 0, articlesInserted = 0, articlesDeduped = 0;
    let signalsGenerated = 0;

    const overallTimer = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`overall pipeline timed out after ${TIMEOUT.OVERALL}ms`)),
        TIMEOUT.OVERALL,
      ),
    );

    async function executeStages(): Promise<void> {
      // Stage 1 — Ingestion (RSS primary + GNews secondary)
      const ingest = await runStage('ingest', async () => {
        let rssResult = {
          sourcesAttempted: 0, sourcesFailed: 0, sourcesRateLimited: 0, sourcesEmpty: 0,
          articlesNew: 0, articlesDeduped: 0, eventsNew: 0, eventsDeduped: 0,
        };
        try {
          rssResult = await ingestRss();
        } catch (rssErr) {
          console.error('[pipeline] RSS ingestion threw unexpectedly:', rssErr instanceof Error ? rssErr.message : String(rssErr));
        }

        const gnewsResult = await ingestGNews();

        if (gnewsResult.rateLimited) {
          console.warn('[pipeline] GNews rate-limited — relying on RSS sources this run');
        }

        const totalFetched   = rssResult.articlesNew + rssResult.articlesDeduped + gnewsResult.total;
        const totalInserted  = rssResult.articlesNew + gnewsResult.ingested;
        const totalDeduped   = rssResult.articlesDeduped + gnewsResult.skipped;

        if (totalInserted === 0 && totalFetched === 0) {
          console.warn('[pipeline] ingest stage: zero articles from all sources — possible source starvation');
        } else if (totalInserted === 0) {
          console.log(`[pipeline] ingest stage: ${totalFetched} fetched but all deduped (pipeline already up-to-date)`);
        }

        return {
          total: totalFetched,
          ingested: totalInserted,
          skipped: totalDeduped,
          sources: {
            rss: {
              sourcesAttempted: rssResult.sourcesAttempted,
              sourcesFailed: rssResult.sourcesFailed,
              sourcesRateLimited: rssResult.sourcesRateLimited,
              sourcesEmpty: rssResult.sourcesEmpty,
              articlesNew: rssResult.articlesNew,
              eventsNew: rssResult.eventsNew,
            },
            gnews: {
              queriesAttempted: gnewsResult.queriesAttempted,
              total: gnewsResult.total,
              ingested: gnewsResult.ingested,
              rateLimited: gnewsResult.rateLimited,
            },
          },
        };
      }, TIMEOUT.INGEST);

      if (ingest.error) {
        stages.push({ stage: 'ingest', status: 'error', durationMs: ingest.durationMs, error: ingest.error });
        errorsCount++;
      } else {
        const r = ingest.result!;
        articlesFetched  = r.total;
        articlesInserted = r.ingested;
        articlesDeduped  = r.skipped;
        stages.push({
          stage: 'ingest', status: 'ok', durationMs: ingest.durationMs,
          articlesFetched, articlesInserted, articlesDeduped,
          sources: r.sources,
        });
      }

      // Stage 2 — Signal generation
      const signals = await runStage(
        'signals',
        async () => {
          const events  = await getRecentEvents(500);
          const sigs    = generateSignalsFromEvents(events);
          const saved   = await saveSignals(sigs);
          return { eventsLoaded: events.length, signalsSaved: saved };
        },
        TIMEOUT.SIGNALS,
      );
      if (signals.error) {
        stages.push({ stage: 'signals', status: 'error', durationMs: signals.durationMs, error: signals.error });
        errorsCount++;
      } else {
        signalsGenerated = signals.result!.signalsSaved;
        stages.push({
          stage: 'signals', status: 'ok', durationMs: signals.durationMs,
          eventsLoaded: signals.result!.eventsLoaded, signalsGenerated,
        });
      }

      // Stage 3 — Snapshot generation
      const snapshot = await runStage('snapshots', () => generatePageSnapshots(), TIMEOUT.SNAPSHOT);
      if (snapshot.error) {
        stages.push({ stage: 'snapshots', status: 'error', durationMs: snapshot.durationMs, error: snapshot.error });
        errorsCount++;
      } else {
        const sr = snapshot.result!;
        stages.push({
          stage: 'snapshots', status: 'ok', durationMs: snapshot.durationMs,
          snapshotsGenerated: sr.snapshotsGenerated,
          snapshotKeys: sr.snapshots,
          ...(sr.errors.length > 0 ? { snapshotErrors: sr.errors } : {}),
        });
      }

      // Stage 4 — Cache refresh
      const cache = await runStage('cache', () => refreshCaches(), TIMEOUT.CACHE);
      if (cache.error) {
        stages.push({ stage: 'cache', status: 'error', durationMs: cache.durationMs, error: cache.error });
      } else {
        const cr = cache.result!;
        stages.push({
          stage: 'cache', status: 'ok', durationMs: cache.durationMs,
          redisKeysInvalidated: cr.redisKeysInvalidated,
          routesRevalidated:    cr.routesRevalidated,
          ...(cr.errors.length > 0 ? { cacheErrors: cr.errors } : {}),
        });
      }
    }

    try {
      await Promise.race([executeStages(), overallTimer]);
    } catch (err) {
      stages.push({
        stage:      'overall',
        status:     'error',
        durationMs: Date.now() - t0,
        error:      err instanceof Error ? err.message : String(err),
      });
      errorsCount++;
    }

    return { stages, errorsCount, articlesFetched, articlesInserted, articlesDeduped, signalsGenerated };
  });

  if (guard.locked) {
    logWithRequestId(correlationId, 'pipeline/run', `skipped — ${guard.reason}`);
    await persistSkippedRun(correlationId, triggerType, guard.reason);
    return pipelineLockedResponse(correlationId, guard);
  }

  const { stages, errorsCount, articlesFetched, articlesInserted, articlesDeduped, signalsGenerated } = guard.result;
  const durationMs = Date.now() - t0;

  const overallStatus: RunStatus =
    errorsCount === 0                  ? 'completed' :
    errorsCount >= stages.length       ? 'failed'    :
    /* some stages ok, some failed */    'partial';

  const errorSummary = errorsCount > 0
    ? stages.filter(s => s.status === 'error').map(s => `${s.stage}: ${s.error}`).join('; ')
    : undefined;

  await persistRunRecord({
    correlationId,
    triggerType,
    status: toDbStatus(overallStatus),
    durationMs,
    articlesFetched,
    articlesInserted,
    articlesDeduped,
    signalsGenerated,
    errorsCount,
    errorSummary,
  });

  logWithRequestId(
    correlationId,
    'pipeline/run',
    `status=${overallStatus} ingested=${articlesInserted} signals=${signalsGenerated} ms=${durationMs}`,
  );

  return NextResponse.json({
    ok:          overallStatus === 'completed',
    status:      overallStatus,
    runId:       correlationId,
    triggerType,
    dryRun:      false,
    startedAt:   new Date(t0).toISOString(),
    completedAt: new Date().toISOString(),
    durationMs,
    stages,
    diagnostics: {
      articlesFetched,
      articlesInserted,
      articlesDeduped,
      signalsGenerated,
      errorsCount,
    },
  }, { status: overallStatus === 'completed' ? 200 : 207 });
}

// Cron triggers can also use GET
export const GET = POST;
