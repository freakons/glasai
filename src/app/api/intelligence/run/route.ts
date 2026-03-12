export const runtime = 'nodejs';
/**
 * Omterminal — Full Intelligence Pipeline Route
 *
 * POST /api/intelligence/run
 *   Triggers the full pipeline: harvester → trend analysis → insight generation.
 *   Requires CRON_SECRET (x-vercel-cron-secret header or ?secret= param).
 *   Returns a structured status report for each stage, including errors.
 *
 * Each stage runs independently; a failure in one stage does not abort the
 * others.  The overall status is 'partial' if any stage failed, 'ok' if all
 * stages succeeded.
 *
 * Pipeline run metadata is logged to the `pipeline_runs` table so that
 * health endpoints can report last-run timestamps and status.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateEnvironment, checkLLMProvider } from '@/lib/env';
import { createRequestId, logWithRequestId } from '@/lib/requestId';
import { withPipelineLock, pipelineLockedResponse } from '@/lib/pipelineLock';
import { runHarvester } from '@/harvester/runner';
import { runTrendAnalysis } from '@/trends/runner';
import { runInsightGeneration } from '@/insights/runner';
import { dbQuery } from '@/db/client';

export const maxDuration = 10; // Vercel Hobby plan limit; upgrade to Pro for full pipeline runs

// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) return true; // Local dev: no secret configured

  // Vercel cron scheduler — always trusted
  const userAgent = req.headers.get('user-agent') || '';
  if (userAgent.includes('vercel-cron')) return true;

  const cronHeader  = req.headers.get('x-vercel-cron-secret') || '';
  const querySecret = new URL(req.url).searchParams.get('secret') || '';
  return cronHeader === expected || querySecret === expected;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline run logger
// ─────────────────────────────────────────────────────────────────────────────

interface StageResult {
  stage: string;
  status: 'ok' | 'error';
  durationMs: number;
  error?: string;
  [key: string]: unknown;
}

/** Persist a pipeline run record for health monitoring. */
async function logPipelineRun(
  stage: string,
  status: 'ok' | 'error' | 'partial',
  durationMs: number,
  extra: { ingested?: number; signals_generated?: number; error_msg?: string } = {},
): Promise<void> {
  try {
    await dbQuery`
      INSERT INTO pipeline_runs (stage, status, duration_ms, ingested, signals_generated, error_msg)
      VALUES (
        ${stage},
        ${status},
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

  // Validate critical env vars (throws HTTP 500 in production if missing)
  // NOTE: GNEWS_API_KEY is NOT required here — the harvester also uses RSS, GitHub,
  // and Arxiv sources that work without it. Missing GNews is handled gracefully inside runHarvester.
  validateEnvironment(['DATABASE_URL', 'CRON_SECRET']);

  // Warn (not throw) if no LLM provider is configured
  checkLLMProvider();

  if (!isAuthorized(req)) {
    console.warn(`[intelligence/run] Unauthorized attempt reqId=${reqId}`);
    return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 });
  }

  logWithRequestId(reqId, 'intelligence/run', 'pipeline started');

  // ── Concurrency lock ──────────────────────────────────────────────────────
  const guard = await withPipelineLock('intelligence', reqId, 'intelligence/run', async () => {
    const stages: StageResult[] = [];
    let anyError = false;

    // ── Stage 1: Harvester ──────────────────────────────────────────────────
    const t1 = Date.now();
    console.log('pipeline stage: harvester started');
    try {
      await runHarvester();
      const d = Date.now() - t1;
      stages.push({ stage: 'harvester', status: 'ok', durationMs: d });
      logWithRequestId(reqId, 'intelligence/run', `stage=harvester status=ok ms=${d}`);
      console.log('pipeline stage: harvester completed');
    } catch (err) {
      const d = Date.now() - t1;
      const msg = String(err);
      stages.push({ stage: 'harvester', status: 'error', durationMs: d, error: msg });
      console.error(`pipeline stage: harvester failed reqId=${reqId}:`, err);
      anyError = true;
    }

    // ── Stage 2: Trend Analysis ─────────────────────────────────────────────
    const t2 = Date.now();
    console.log('pipeline stage: trend analysis started');
    try {
      await runTrendAnalysis();
      const d = Date.now() - t2;
      stages.push({ stage: 'trends', status: 'ok', durationMs: d });
      logWithRequestId(reqId, 'intelligence/run', `stage=trends status=ok ms=${d}`);
      console.log('pipeline stage: trend analysis completed');
    } catch (err) {
      const d = Date.now() - t2;
      const msg = String(err);
      stages.push({ stage: 'trends', status: 'error', durationMs: d, error: msg });
      console.error(`pipeline stage: trend analysis failed reqId=${reqId}:`, err);
      anyError = true;
    }

    // ── Stage 3: Insight Generation ─────────────────────────────────────────
    const t3 = Date.now();
    console.log('pipeline stage: insight generation started');
    try {
      await runInsightGeneration();
      const d = Date.now() - t3;
      stages.push({ stage: 'insights', status: 'ok', durationMs: d });
      logWithRequestId(reqId, 'intelligence/run', `stage=insights status=ok ms=${d}`);
      console.log('pipeline stage: insight generation completed');
    } catch (err) {
      const d = Date.now() - t3;
      const msg = String(err);
      stages.push({ stage: 'insights', status: 'error', durationMs: d, error: msg });
      console.error(`pipeline stage: insight generation failed reqId=${reqId}:`, err);
      anyError = true;
    }

    // ── Finalise ────────────────────────────────────────────────────────────
    const totalMs = Date.now() - t0;
    const overallStatus = anyError ? 'partial' : 'ok';

    logWithRequestId(
      reqId,
      'intelligence/run',
      `pipeline complete status=${overallStatus} ms=${totalMs}`,
    );

    await logPipelineRun('full', overallStatus, totalMs, {
      error_msg: anyError ? stages.filter((s) => s.error).map((s) => s.stage).join(',') : undefined,
    });

    // ── Post-run diagnostics ────────────────────────────────────────────────
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
        totalEvents:   parseInt(eventCount[0]?.count ?? '0', 10),
        totalSignals:  parseInt(signalCount[0]?.count ?? '0', 10),
        totalTrends:   parseInt(trendCount[0]?.count ?? '0', 10),
        totalInsights: parseInt(insightCount[0]?.count ?? '0', 10),
        latestSignal:  latestSignal[0] ?? null,
        latestTrend:   latestTrend[0] ?? null,
        latestInsight: latestInsight[0] ?? null,
      };
      console.log(`[intelligence/run] post-run diagnostics: events=${pipelineDiagnostics.totalEvents} signals=${pipelineDiagnostics.totalSignals} trends=${pipelineDiagnostics.totalTrends} insights=${pipelineDiagnostics.totalInsights}`);
    } catch (err) {
      console.warn('[intelligence/run] diagnostics query failed:', err);
    }

    return { stages, anyError, totalMs, overallStatus, pipelineDiagnostics };
  });

  if (guard.locked) {
    return pipelineLockedResponse(reqId, guard);
  }

  const { stages, anyError, totalMs, overallStatus, pipelineDiagnostics } = guard.result;

  return NextResponse.json({
    ok:      !anyError,
    status:  overallStatus,
    stages,
    totalMs,
    timestamp: new Date().toISOString(),
    diagnostics: pipelineDiagnostics,
  }, {
    status: anyError ? 207 : 200,
  });
}

// Cron can also trigger via GET
export const GET = POST;
