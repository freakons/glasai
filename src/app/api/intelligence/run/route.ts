export const runtime = 'nodejs';
/**
 * Omterminal — Intelligence Analysis Pipeline Route
 *
 * POST /api/intelligence/run   (GET aliased for cron compatibility)
 *
 * This is the scheduled entrypoint for the intelligence analysis pipeline:
 * harvester → trend analysis → insight generation.
 *
 * It is a SECONDARY scheduled route, running on a slower cadence than the
 * primary ingestion pipeline (/api/pipeline/run).  Both routes are independent
 * and use separate pipeline lock scopes so they never block each other.
 *
 * Schedule (vercel.json):
 *   /api/pipeline/run     → primary   — every hour      (data ingestion)
 *   /api/intelligence/run → secondary — every two hours (intelligence analysis)
 *
 * Auth:
 *   - Authorization: Bearer <CRON_SECRET> header        (Vercel scheduler → trigger=cron)
 *   - ?secret= query param         == CRON_SECRET env   (manual test   → trigger=manual)
 *   - x-admin-secret header        == ADMIN_SECRET env  (admin call    → trigger=admin)
 *   - No secrets configured → open in local dev only (NODE_ENV !== production)
 *   - Production with both secrets missing → 401 (fail closed)
 *   NOTE: User-Agent is NOT trusted for auth — it is trivially spoofable.
 *
 * Dry-run:
 *   Add ?dry_run=true to validate auth + env without running any stage.
 *
 * Concurrency:
 *   Uses withPipelineLock with scope='intelligence/run'.  A second request while
 *   one is active returns HTTP 409 skipped_active_run.
 *
 * Observability:
 *   Every run (including skipped/dry-run) emits structured log lines and is
 *   recorded in pipeline_runs with requestId, trigger_type, and outcome.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateEnvironment, checkLLMProvider } from '@/lib/env';
import { createRequestId, logWithRequestId } from '@/lib/requestId';
import { withPipelineLock, pipelineLockedResponse } from '@/lib/pipelineLock';
import { runHarvester } from '@/harvester/runner';
import { runTrendAnalysis } from '@/trends/runner';
import { runInsightGeneration } from '@/insights/runner';
import { dbQuery } from '@/db/client';
import type { TriggerType } from '@/lib/pipeline/types';

// Vercel function timeout (seconds). Upgrade to Pro plan for longer runs.
// https://vercel.com/docs/functions/runtimes#max-duration
export const maxDuration = 10;

// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract the bearer token from the Authorization header, if present.
 * Vercel cron sends `Authorization: Bearer <CRON_SECRET>`.
 */
function extractBearerToken(req: NextRequest): string {
  const auth = req.headers.get('authorization') ?? '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return '';
}

/**
 * Detect whether this request was made by the Vercel cron scheduler, an admin,
 * or an unauthenticated manual caller.  Matches the pattern used in
 * /api/pipeline/run for consistency.
 *
 * NOTE: User-Agent is intentionally NOT checked here — it is trivially
 * spoofable and must never be used as a security boundary.
 */
function detectTriggerType(req: NextRequest): TriggerType {
  const adminSecret = process.env.ADMIN_SECRET ?? '';
  const adminHeader = req.headers.get('x-admin-secret') ?? '';
  if (adminSecret && adminHeader === adminSecret) return 'admin';

  // Vercel cron: Authorization: Bearer <CRON_SECRET>
  const cronSecret = process.env.CRON_SECRET ?? '';
  const bearer = extractBearerToken(req);
  if (cronSecret && bearer === cronSecret) return 'cron';

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
  // Check: Authorization: Bearer <secret> (Vercel cron), query param, admin header
  const bearer      = extractBearerToken(req);
  const querySecret = new URL(req.url).searchParams.get('secret') ?? '';
  const adminHeader = req.headers.get('x-admin-secret') ?? '';

  if (cronSecret  && (bearer === cronSecret || querySecret === cronSecret)) return true;
  if (adminSecret && adminHeader === adminSecret) return true;

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage result type
// ─────────────────────────────────────────────────────────────────────────────

interface StageResult {
  stage: string;
  status: 'ok' | 'error';
  durationMs: number;
  error?: string;
  [key: string]: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline run logger
// ─────────────────────────────────────────────────────────────────────────────

/** Persist a pipeline run record for health monitoring. */
async function logPipelineRun(
  correlationId: string,
  triggerType: TriggerType,
  stage: string,
  status: 'ok' | 'error' | 'partial' | 'skipped',
  durationMs: number,
  extra: { ingested?: number; signals_generated?: number; error_msg?: string } = {},
): Promise<void> {
  // Try extended schema (migration 005) first, fall back to base schema.
  try {
    await dbQuery`
      INSERT INTO pipeline_runs (
        stage, status, trigger_type, started_at, completed_at, correlation_id,
        duration_ms, ingested, signals_generated, error_summary
      )
      VALUES (
        ${stage},
        ${status},
        ${triggerType},
        NOW(), NOW(),
        ${correlationId},
        ${durationMs},
        ${extra.ingested ?? null},
        ${extra.signals_generated ?? null},
        ${extra.error_msg ?? null}
      )
    `;
    return;
  } catch {
    // Extended columns not available — fall back to base schema
  }
  try {
    await dbQuery`
      INSERT INTO pipeline_runs (stage, status, duration_ms, ingested, signals_generated, error_msg)
      VALUES (
        ${stage},
        ${status === 'skipped' ? 'partial' : status},
        ${durationMs},
        ${extra.ingested ?? null},
        ${extra.signals_generated ?? null},
        ${extra.error_msg ?? null}
      )
    `;
  } catch {
    // Non-critical — pipeline run logging should never abort the actual pipeline
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const t0    = Date.now();
  const reqId = createRequestId();
  const url   = new URL(req.url);
  const isDryRun = url.searchParams.get('dry_run') === 'true';

  // Validate critical env vars (throws HTTP 500 in production if missing).
  // NOTE: GNEWS_API_KEY is NOT required here — the harvester also uses RSS,
  // GitHub, and Arxiv sources that work without it.
  validateEnvironment(['DATABASE_URL', 'CRON_SECRET']);

  // Warn (not throw) if no LLM provider is configured.
  checkLLMProvider();

  if (!isAuthorized(req)) {
    logWithRequestId(reqId, 'intelligence/run', 'unauthorized');
    return NextResponse.json(
      { ok: false, status: 'error', message: 'Unauthorized' },
      { status: 401 },
    );
  }

  const triggerType = detectTriggerType(req);
  logWithRequestId(reqId, 'intelligence/run', `trigger=${triggerType} dry_run=${isDryRun} route=intelligence/run`);

  // ── Dry-run ───────────────────────────────────────────────────────────────
  if (isDryRun) {
    return NextResponse.json({
      ok:          true,
      status:      'dry_run',
      runId:       reqId,
      triggerType,
      dryRun:      true,
      startedAt:   new Date(t0).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs:  Date.now() - t0,
      message:     'Dry-run: auth and env validated. No pipeline execution performed.',
    });
  }

  // ── Concurrency lock ──────────────────────────────────────────────────────
  const guard = await withPipelineLock('intelligence', reqId, 'intelligence/run', async () => {
    const stages: StageResult[] = [];
    let anyError = false;

    // ── Stage 1: Harvester ────────────────────────────────────────────────
    const t1 = Date.now();
    logWithRequestId(reqId, 'intelligence/run', 'stage=harvester status=started');
    try {
      await runHarvester();
      const d = Date.now() - t1;
      stages.push({ stage: 'harvester', status: 'ok', durationMs: d });
      logWithRequestId(reqId, 'intelligence/run', `stage=harvester status=ok ms=${d}`);
    } catch (err) {
      const d = Date.now() - t1;
      const msg = err instanceof Error ? err.message : String(err);
      stages.push({ stage: 'harvester', status: 'error', durationMs: d, error: msg });
      logWithRequestId(reqId, 'intelligence/run', `stage=harvester status=error ms=${d} error=${msg}`);
      anyError = true;
    }

    // ── Stage 2: Trend Analysis ───────────────────────────────────────────
    const t2 = Date.now();
    logWithRequestId(reqId, 'intelligence/run', 'stage=trends status=started');
    try {
      await runTrendAnalysis();
      const d = Date.now() - t2;
      stages.push({ stage: 'trends', status: 'ok', durationMs: d });
      logWithRequestId(reqId, 'intelligence/run', `stage=trends status=ok ms=${d}`);
    } catch (err) {
      const d = Date.now() - t2;
      const msg = err instanceof Error ? err.message : String(err);
      stages.push({ stage: 'trends', status: 'error', durationMs: d, error: msg });
      logWithRequestId(reqId, 'intelligence/run', `stage=trends status=error ms=${d} error=${msg}`);
      anyError = true;
    }

    // ── Stage 3: Insight Generation ───────────────────────────────────────
    const t3 = Date.now();
    logWithRequestId(reqId, 'intelligence/run', 'stage=insights status=started');
    try {
      await runInsightGeneration();
      const d = Date.now() - t3;
      stages.push({ stage: 'insights', status: 'ok', durationMs: d });
      logWithRequestId(reqId, 'intelligence/run', `stage=insights status=ok ms=${d}`);
    } catch (err) {
      const d = Date.now() - t3;
      const msg = err instanceof Error ? err.message : String(err);
      stages.push({ stage: 'insights', status: 'error', durationMs: d, error: msg });
      logWithRequestId(reqId, 'intelligence/run', `stage=insights status=error ms=${d} error=${msg}`);
      anyError = true;
    }

    // ── Finalise ──────────────────────────────────────────────────────────
    const totalMs = Date.now() - t0;
    const overallStatus: 'ok' | 'partial' = anyError ? 'partial' : 'ok';

    logWithRequestId(
      reqId,
      'intelligence/run',
      `status=${overallStatus} trigger=${triggerType} ms=${totalMs} route=intelligence/run`,
    );

    await logPipelineRun(reqId, triggerType, 'intelligence', overallStatus, totalMs, {
      error_msg: anyError
        ? stages.filter(s => s.error).map(s => s.stage).join(',')
        : undefined,
    });

    // ── Post-run diagnostics ──────────────────────────────────────────────
    let pipelineDiagnostics: Record<string, unknown> = {};
    try {
      const [signalCount, trendCount, insightCount, eventCount] = await Promise.all([
        dbQuery<{ count: string }>`SELECT COUNT(*) AS count FROM signals`,
        dbQuery<{ count: string }>`SELECT COUNT(*) AS count FROM trends`,
        dbQuery<{ count: string }>`SELECT COUNT(*) AS count FROM insights`,
        dbQuery<{ count: string }>`SELECT COUNT(*) AS count FROM events`,
      ]);
      const latestSignal = await dbQuery<Record<string, unknown>>`
        SELECT id, title, status, category, confidence, trust_score, created_at
        FROM signals ORDER BY created_at DESC LIMIT 1
      `;
      const latestTrend = await dbQuery<Record<string, unknown>>`
        SELECT topic, category, signal_count, confidence, created_at
        FROM trends ORDER BY created_at DESC LIMIT 1
      `;
      const latestInsight = await dbQuery<Record<string, unknown>>`
        SELECT title, category, confidence, created_at
        FROM insights ORDER BY created_at DESC LIMIT 1
      `;
      pipelineDiagnostics = {
        totalEvents:   parseInt(eventCount[0]?.count  ?? '0', 10),
        totalSignals:  parseInt(signalCount[0]?.count ?? '0', 10),
        totalTrends:   parseInt(trendCount[0]?.count  ?? '0', 10),
        totalInsights: parseInt(insightCount[0]?.count ?? '0', 10),
        latestSignal:  latestSignal[0]  ?? null,
        latestTrend:   latestTrend[0]   ?? null,
        latestInsight: latestInsight[0] ?? null,
      };
      logWithRequestId(
        reqId,
        'intelligence/run',
        `diagnostics events=${pipelineDiagnostics.totalEvents} signals=${pipelineDiagnostics.totalSignals}` +
        ` trends=${pipelineDiagnostics.totalTrends} insights=${pipelineDiagnostics.totalInsights}`,
      );
    } catch (err) {
      logWithRequestId(reqId, 'intelligence/run', `diagnostics-query-failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    return { stages, anyError, totalMs, overallStatus, pipelineDiagnostics };
  });

  if (guard.locked) {
    logWithRequestId(reqId, 'intelligence/run', `skipped — ${guard.reason} trigger=${triggerType} route=intelligence/run`);
    await logPipelineRun(reqId, triggerType, 'intelligence', 'skipped', Date.now() - t0, {
      error_msg: guard.reason,
    });
    return pipelineLockedResponse(reqId, guard);
  }

  const { stages, anyError, totalMs, overallStatus, pipelineDiagnostics } = guard.result;

  return NextResponse.json({
    ok:          !anyError,
    status:      overallStatus,
    runId:       reqId,
    triggerType,
    dryRun:      false,
    startedAt:   new Date(t0).toISOString(),
    completedAt: new Date().toISOString(),
    durationMs:  totalMs,
    stages,
    diagnostics: pipelineDiagnostics,
  }, {
    status: anyError ? 207 : 200,
  });
}

// Cron can also trigger via GET
export const GET = POST;
