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
 *   - Authorization: Bearer <CRON_SECRET> header (Vercel cron scheduler)
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
import { getOrCreateRequestId, logWithRequestId } from '@/lib/requestId';
import { ingestGNews }                          from '@/services/ingestion/gnewsFetcher';
import { ingestRss }                            from '@/services/ingestion/rssIngester';
import { getRecentEvents }                      from '@/services/storage/eventStore';
import { generateSignalsFromEvents }            from '@/services/signals/signalEngine';
import { saveSignals, updateSignalInsight, markInsightGenerationError } from '@/services/storage/signalStore';
import { generateSignalInsightWithMeta }        from '@/lib/intelligence/generateSignalInsight';
import { corroborateSignals }                    from '@/lib/signals/clusterSignals';
import { withPipelineLock, pipelineLockedResponse } from '@/lib/pipelineLock';
import { generatePageSnapshots }               from '@/lib/pipeline/snapshot';
import { refreshCaches }                        from '@/lib/pipeline/cacheRefresh';
import { dbQuery }                              from '@/db/client';
import { TimeoutError }                         from '@/lib/withTimeout';
import type { TriggerType, RunStatus, PipelineStageResult } from '@/lib/pipeline/types';
import { toDbStatus }                           from '@/lib/pipeline/types';

// Vercel function timeout (seconds). 300 = max for Pro plan.
// https://vercel.com/docs/functions/runtimes#max-duration
export const maxDuration = 300;

// ── Stage timeout defaults (ms) ───────────────────────────────────────────────
// With maxDuration=300 (Vercel Pro), we can afford generous per-stage timeouts.
// Overall timeout is 290s (leaving 10s for response serialization).
const TIMEOUT = {
  INGEST:   parseInt(process.env.PIPELINE_INGEST_TIMEOUT_MS   ?? '120000', 10),
  SIGNALS:  parseInt(process.env.PIPELINE_SIGNALS_TIMEOUT_MS  ?? '30000',  10),
  SNAPSHOT: parseInt(process.env.PIPELINE_SNAPSHOT_TIMEOUT_MS ?? '60000',  10),
  CACHE:    parseInt(process.env.PIPELINE_CACHE_TIMEOUT_MS    ?? '10000',  10),
  OVERALL:  parseInt(process.env.PIPELINE_TIMEOUT_MS          ?? '290000', 10),
} as const;

// ── Auth ──────────────────────────────────────────────────────────────────────

/**
 * Extract the bearer token from the Authorization header, if present.
 * Vercel cron sends `Authorization: Bearer <CRON_SECRET>`.
 * Always trims to handle copy-paste whitespace issues.
 */
function extractBearerToken(req: NextRequest): string {
  const auth = req.headers.get('authorization') ?? '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return '';
}

function detectTriggerType(req: NextRequest): TriggerType {
  // Admin secret header → admin trigger
  const adminHeader = (req.headers.get('x-admin-secret') ?? '').trim();
  const adminSecret = (process.env.ADMIN_SECRET ?? '').trim();
  if (adminHeader && adminHeader === adminSecret) return 'admin';

  // Vercel cron: Authorization: Bearer <CRON_SECRET>
  const cronSecret = (process.env.CRON_SECRET ?? '').trim();
  const bearer = extractBearerToken(req);
  if (cronSecret && bearer === cronSecret) return 'cron';

  return 'manual';
}

/** Safe auth diagnostics — never includes actual secret values. */
interface AuthDiagnostics {
  cronSecretConfigured: boolean;
  cronSecretLength: number;
  adminSecretConfigured: boolean;
  bearerProvided: boolean;
  bearerLength: number;
  querySecretProvided: boolean;
  querySecretLength: number;
  adminHeaderProvided: boolean;
  nodeEnv: string;
  failReason: string;
}

function isAuthorized(req: NextRequest): { authorized: boolean; diagnostics: AuthDiagnostics } {
  const cronSecret  = (process.env.CRON_SECRET  ?? '').trim();
  const adminSecret = (process.env.ADMIN_SECRET ?? '').trim();
  const isProd      = process.env.NODE_ENV === 'production';

  const bearer      = extractBearerToken(req);
  const querySecret = (new URL(req.url).searchParams.get('secret') ?? '').trim();
  const adminHeader = (req.headers.get('x-admin-secret') ?? '').trim();

  const diag: AuthDiagnostics = {
    cronSecretConfigured:  cronSecret.length > 0,
    cronSecretLength:      cronSecret.length,
    adminSecretConfigured: adminSecret.length > 0,
    bearerProvided:        bearer.length > 0,
    bearerLength:          bearer.length,
    querySecretProvided:   querySecret.length > 0,
    querySecretLength:     querySecret.length,
    adminHeaderProvided:   adminHeader.length > 0,
    nodeEnv:               process.env.NODE_ENV ?? 'undefined',
    failReason:            '',
  };

  // In production, missing secrets must fail closed — never open the endpoint.
  if (isProd && !cronSecret && !adminSecret) {
    diag.failReason = 'production_no_secrets_configured';
    return { authorized: false, diagnostics: diag };
  }

  // In development with no secrets configured, allow for ergonomics.
  if (!cronSecret && !adminSecret) {
    return { authorized: true, diagnostics: diag };
  }

  // Do NOT trust User-Agent for authentication — it is trivially spoofable.
  // Check: Authorization: Bearer <secret> (Vercel cron), query param, admin header
  if (cronSecret  && (bearer === cronSecret || querySecret === cronSecret)) {
    return { authorized: true, diagnostics: diag };
  }
  if (adminSecret && adminHeader === adminSecret) {
    return { authorized: true, diagnostics: diag };
  }

  // Build specific fail reason for debugging
  if (bearer && cronSecret && bearer !== cronSecret) {
    diag.failReason = `bearer_mismatch (bearer_len=${bearer.length} expected_len=${cronSecret.length})`;
  } else if (querySecret && cronSecret && querySecret !== cronSecret) {
    diag.failReason = `query_secret_mismatch (query_len=${querySecret.length} expected_len=${cronSecret.length})`;
  } else if (!bearer && !querySecret && !adminHeader) {
    diag.failReason = 'no_credentials_provided';
  } else {
    diag.failReason = 'credentials_provided_but_no_match';
  }

  return { authorized: false, diagnostics: diag };
}

// ── Stage runner with timeout ─────────────────────────────────────────────────

/**
 * Runs `fn` with a hard deadline of `timeoutMs`.
 *
 * On timeout, rejects with a {@link TimeoutError} so callers can distinguish
 * a timeout from other failures in stage results and structured logs.
 * The `timedOut` flag is always set in the return value for easy inspection.
 *
 * @param name       Stage name — included in error messages and log lines.
 * @param fn         Async stage work.
 * @param timeoutMs  Maximum allowed duration for this stage.
 * @param requestId  Correlation ID from the originating request (for logs).
 */
async function runStage<T>(
  name: string,
  fn: () => Promise<T>,
  timeoutMs: number,
  requestId?: string,
): Promise<{ result?: T; error?: string; durationMs: number; timedOut: boolean }> {
  const t0 = Date.now();
  let handle: ReturnType<typeof setTimeout> | undefined;

  const timer = new Promise<never>((_, reject) => {
    handle = setTimeout(
      () => reject(new TimeoutError(name, timeoutMs, requestId)),
      timeoutMs,
    );
  });

  try {
    const result = await Promise.race([fn(), timer]);
    return { result, durationMs: Date.now() - t0, timedOut: false };
  } catch (err) {
    const durationMs = Date.now() - t0;
    const timedOut = err instanceof TimeoutError;

    if (timedOut) {
      console.warn(
        `[pipeline] timeout requestId=${requestId ?? 'n/a'} stage=${name}` +
        ` elapsed=${durationMs}ms timeout=${timeoutMs}ms partial=true aborted=false`,
      );
    }

    return {
      error:     err instanceof Error ? err.message : String(err),
      durationMs,
      timedOut,
    };
  } finally {
    if (handle !== undefined) clearTimeout(handle);
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
  const correlationId = getOrCreateRequestId(req);
  const url = new URL(req.url);
  const isDryRun = url.searchParams.get('dry_run') === 'true';

  // Validate environment — catch and return structured error instead of raw 500
  try {
    validateEnvironment(['DATABASE_URL', 'CRON_SECRET']);
  } catch (envErr) {
    logWithRequestId(correlationId, 'pipeline/run', `env_error: ${envErr instanceof Error ? envErr.message : String(envErr)}`);
    return NextResponse.json(
      {
        ok: false,
        status: 'error',
        message: 'Server configuration error',
        detail: envErr instanceof Error ? envErr.message : String(envErr),
        requestId: correlationId,
      },
      { status: 500, headers: { 'x-request-id': correlationId } },
    );
  }

  const { authorized, diagnostics: authDiag } = isAuthorized(req);
  if (!authorized) {
    logWithRequestId(correlationId, 'pipeline/run', `unauthorized: ${authDiag.failReason}`);
    return NextResponse.json(
      {
        ok: false,
        status: 'error',
        message: 'Unauthorized',
        requestId: correlationId,
        // Safe diagnostics — no secret values exposed
        authDebug: {
          cronSecretConfigured: authDiag.cronSecretConfigured,
          cronSecretLength:     authDiag.cronSecretLength,
          adminSecretConfigured: authDiag.adminSecretConfigured,
          bearerProvided:       authDiag.bearerProvided,
          bearerLength:         authDiag.bearerLength,
          querySecretProvided:  authDiag.querySecretProvided,
          querySecretLength:    authDiag.querySecretLength,
          adminHeaderProvided:  authDiag.adminHeaderProvided,
          nodeEnv:              authDiag.nodeEnv,
          failReason:           authDiag.failReason,
        },
      },
      { status: 401, headers: { 'x-request-id': correlationId } },
    );
  }

  const triggerType = detectTriggerType(req);
  logWithRequestId(correlationId, 'pipeline/run', `trigger=${triggerType} dry_run=${isDryRun}`);

  // ── Dry-run ───────────────────────────────────────────────────────────────
  if (isDryRun) {
    return NextResponse.json(
      {
        ok:           true,
        status:       'dry_run' as RunStatus,
        runId:        correlationId,
        requestId:    correlationId,
        triggerType,
        dryRun:       true,
        startedAt:    new Date(t0).toISOString(),
        completedAt:  new Date().toISOString(),
        durationMs:   Date.now() - t0,
        message:      'Dry-run: auth and env validated. No pipeline execution performed.',
      },
      { headers: { 'x-request-id': correlationId } },
    );
  }

  // ── Concurrency lock ──────────────────────────────────────────────────────
  const guard = await withPipelineLock(triggerType, correlationId, 'pipeline/run', async () => {
    const stages: PipelineStageResult[] = [];
    let errorsCount = 0;
    let articlesFetched = 0, articlesInserted = 0, articlesDeduped = 0;
    let signalsGenerated = 0;

    const overallTimer = new Promise<never>((_, reject) =>
      setTimeout(
        () => {
          console.warn(
            `[pipeline] timeout requestId=${correlationId} stage=overall` +
            ` timeout=${TIMEOUT.OVERALL}ms partial=true aborted=true`,
          );
          reject(new TimeoutError('overall', TIMEOUT.OVERALL, correlationId));
        },
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
      }, TIMEOUT.INGEST, correlationId);

      if (ingest.error) {
        stages.push({ stage: 'ingest', status: 'error', durationMs: ingest.durationMs, error: ingest.error, timedOut: ingest.timedOut });
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
      let generatedSigs: Awaited<ReturnType<typeof generateSignalsFromEvents>> = [];
      const signals = await runStage(
        'signals',
        async () => {
          const events  = await getRecentEvents(500);
          const sigs    = generateSignalsFromEvents(events);
          generatedSigs = sigs;
          const saved   = await saveSignals(sigs);
          return { eventsLoaded: events.length, signalsSaved: saved };
        },
        TIMEOUT.SIGNALS,
        correlationId,
      );
      if (signals.error) {
        stages.push({ stage: 'signals', status: 'error', durationMs: signals.durationMs, error: signals.error, timedOut: signals.timedOut });
        errorsCount++;
      } else {
        signalsGenerated = signals.result!.signalsSaved;
        stages.push({
          stage: 'signals', status: 'ok', durationMs: signals.durationMs,
          eventsLoaded: signals.result!.eventsLoaded, signalsGenerated,
        });
      }

      // Stage 2b — Intelligence layer ("Why This Matters") — non-blocking
      // Only process newly generated signals; failures are swallowed.
      // Signals with existing insight (insight_generated=true) are skipped.
      // Dedup/reuse is handled inside generateSignalInsightWithMeta.
      if (generatedSigs.length > 0) {
        const intel = await runStage(
          'intelligence',
          async () => {
            let insightsGenerated = 0;
            let insightsReused = 0;
            let insightsFailed = 0;
            for (const sig of generatedSigs) {
              try {
                const result = await generateSignalInsightWithMeta({
                  title: sig.title,
                  summary: sig.description,
                  entities: sig.affectedEntities ?? [],
                  signalType: sig.type,
                  direction: sig.direction,
                });

                if (result.error) {
                  // Generation failed — record error for monitoring
                  await markInsightGenerationError(sig.id, result.error);
                  insightsFailed++;
                  continue;
                }

                const insight = result.insight;
                // Only persist if at least one field was generated
                if (insight.why_this_matters || insight.strategic_impact || insight.who_should_care) {
                  await updateSignalInsight(sig.id, insight);
                  insightsGenerated++;
                  if (result.reused) insightsReused++;
                }
              } catch {
                // Per-signal failure is non-fatal
                insightsFailed++;
              }
            }
            return {
              insightsGenerated,
              insightsReused,
              insightsFailed,
              signalsProcessed: generatedSigs.length,
            };
          },
          TIMEOUT.SIGNALS,
          correlationId,
        );
        if (intel.error) {
          // Intelligence failure is non-fatal — log but don't increment errorsCount
          stages.push({ stage: 'intelligence', status: 'error', durationMs: intel.durationMs, error: intel.error, timedOut: intel.timedOut });
        } else {
          stages.push({
            stage: 'intelligence', status: 'ok', durationMs: intel.durationMs,
            ...intel.result!,
          });
        }
      }

      // Stage 2c — Signal corroboration clustering — non-blocking
      // Detects emerging developments when multiple signals reference the same entity.
      // Runs after signal generation; failures are non-fatal.
      const clustering = await runStage(
        'clustering',
        () => corroborateSignals(),
        TIMEOUT.SIGNALS,
        correlationId,
      );
      if (clustering.error) {
        stages.push({ stage: 'clustering', status: 'error', durationMs: clustering.durationMs, error: clustering.error, timedOut: clustering.timedOut });
      } else {
        stages.push({
          stage: 'clustering', status: 'ok', durationMs: clustering.durationMs,
          clustersDetected: clustering.result!.length,
        });
      }

      // Stage 3 — Snapshot generation
      const snapshot = await runStage('snapshots', () => generatePageSnapshots(), TIMEOUT.SNAPSHOT, correlationId);
      if (snapshot.error) {
        stages.push({ stage: 'snapshots', status: 'error', durationMs: snapshot.durationMs, error: snapshot.error, timedOut: snapshot.timedOut });
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
      const cache = await runStage('cache', () => refreshCaches(), TIMEOUT.CACHE, correlationId);
      if (cache.error) {
        stages.push({ stage: 'cache', status: 'error', durationMs: cache.durationMs, error: cache.error, timedOut: cache.timedOut });
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

  return NextResponse.json(
    {
      ok:          overallStatus === 'completed',
      status:      overallStatus,
      runId:       correlationId,
      requestId:   correlationId,
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
    },
    { status: overallStatus === 'completed' ? 200 : 207, headers: { 'x-request-id': correlationId } },
  );
}

// Cron triggers can also use GET
export const GET = POST;
