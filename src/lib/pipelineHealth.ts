/**
 * Omterminal — Pipeline Health Tracking
 *
 * Provides two complementary health data sources:
 *
 * 1. In-process module state (fast, zero-latency)
 *    - Updated by recordPipelineRun() on every pipeline completion
 *    - Survives within a single serverless function instance lifetime
 *    - Used by legacy callers and /api/health/pipeline
 *
 * 2. DB-backed last-run query (durable, cross-instance)
 *    - Reads from the pipeline_runs table
 *    - Works across multiple serverless instances and restarts
 *    - Used by the extended /api/health endpoint
 */

import { dbQuery } from '@/db/client';

// ── In-process state ──────────────────────────────────────────────────────────

let lastRun: number | null = null;
let lastIngestCount = 0;

/**
 * Record a pipeline run completion in module-level state.
 * Called by the canonical pipeline route and pipelineTrigger.
 */
export function recordPipelineRun(count: number): void {
  lastRun = Date.now();
  lastIngestCount = count;
}

/**
 * Return in-process pipeline health (fast, no DB query).
 * Use this for the /api/health/pipeline lightweight endpoint.
 */
export function getPipelineHealth() {
  return {
    last_run:          lastRun,
    signals_ingested:  lastIngestCount,
    status:            lastRun ? 'ok' : 'unknown',
  };
}

// ── DB-backed health (durable) ────────────────────────────────────────────────

export interface DbPipelineHealth {
  /** Most recent run regardless of status */
  lastRun: {
    id: number;
    runAt: string;
    stage: string;
    status: string;
    ingested: number | null;
    signalsGenerated: number | null;
    durationMs: number | null;
    triggerType: string | null;
    correlationId: string | null;
  } | null;

  /** Most recent successful run (status = 'ok' or 'completed') */
  lastSuccessfulRun: {
    id: number;
    runAt: string;
    status: string;
    durationMs: number | null;
  } | null;

  /** Total runs recorded */
  totalRuns: number;

  /** True when no successful run exists or last success > staleThresholdHours ago */
  isStale: boolean;
}

/**
 * Query the pipeline_runs table for durable health metrics.
 * Returns null values gracefully when the table is empty or absent.
 */
export async function getDbPipelineHealth(
  staleThresholdHours = 24,
): Promise<DbPipelineHealth> {
  const zero: DbPipelineHealth = {
    lastRun: null,
    lastSuccessfulRun: null,
    totalRuns: 0,
    isStale: true,
  };

  try {
    // Last run (any status)
    let lastRunRow: DbPipelineHealth['lastRun'] = null;
    try {
      const rows = await dbQuery<{
        id: number; run_at: string; stage: string; status: string;
        ingested: number | null; signals_generated: number | null; duration_ms: number | null;
        trigger_type: string | null; correlation_id: string | null;
      }>`
        SELECT id, run_at, stage, status, ingested, signals_generated, duration_ms,
               trigger_type, correlation_id
        FROM pipeline_runs
        ORDER BY run_at DESC
        LIMIT 1
      `;
      if (rows.length > 0) {
        const r = rows[0];
        lastRunRow = {
          id:               r.id,
          runAt:            r.run_at,
          stage:            r.stage,
          status:           r.status,
          ingested:         r.ingested,
          signalsGenerated: r.signals_generated,
          durationMs:       r.duration_ms,
          triggerType:      r.trigger_type,
          correlationId:    r.correlation_id,
        };
      }
    } catch {
      // Extended columns absent — try base schema
      const rows = await dbQuery<{
        id: number; run_at: string; stage: string; status: string;
        ingested: number | null; signals_generated: number | null; duration_ms: number | null;
      }>`
        SELECT id, run_at, stage, status, ingested, signals_generated, duration_ms
        FROM pipeline_runs
        ORDER BY run_at DESC
        LIMIT 1
      `;
      if (rows.length > 0) {
        const r = rows[0];
        lastRunRow = {
          id:               r.id,
          runAt:            r.run_at,
          stage:            r.stage,
          status:           r.status,
          ingested:         r.ingested,
          signalsGenerated: r.signals_generated,
          durationMs:       r.duration_ms,
          triggerType:      null,
          correlationId:    null,
        };
      }
    }

    // Last successful run
    let lastSuccessRow: DbPipelineHealth['lastSuccessfulRun'] = null;
    let isStale = true;

    const successRows = await dbQuery<{
      id: number; run_at: string; status: string; duration_ms: number | null;
    }>`
      SELECT id, run_at, status, duration_ms
      FROM pipeline_runs
      WHERE status IN ('ok', 'completed')
      ORDER BY run_at DESC
      LIMIT 1
    `;
    if (successRows.length > 0) {
      const r = successRows[0];
      lastSuccessRow = {
        id:        r.id,
        runAt:     r.run_at,
        status:    r.status,
        durationMs: r.duration_ms,
      };
      const hoursSinceSuccess = (Date.now() - new Date(r.run_at).getTime()) / 3_600_000;
      isStale = hoursSinceSuccess > staleThresholdHours;
    }

    // Total run count
    const countRows = await dbQuery<{ count: string }>`
      SELECT COUNT(*)::text AS count FROM pipeline_runs
    `;
    const totalRuns = parseInt(countRows[0]?.count ?? '0', 10) || 0;

    return { lastRun: lastRunRow, lastSuccessfulRun: lastSuccessRow, totalRuns, isStale };
  } catch {
    return zero;
  }
}
