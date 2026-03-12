export const runtime = 'nodejs';

/**
 * Omterminal — Health Endpoint
 *
 * GET /api/health
 *
 * Public (no auth):
 *   Returns a minimal liveness/readiness response safe for uptime monitors.
 *   { ok, status, timestamp }
 *
 * Authenticated (x-admin-secret: <ADMIN_SECRET>):
 *   Returns full operational diagnostics for operator use:
 *   - Database connectivity and schema readiness
 *   - Redis connectivity and pipeline lock state
 *   - Environment variable completeness
 *   - LLM provider availability
 *   - Last pipeline run / last successful run / stale-data warning
 *
 * Detailed internals (table names, lock state, env var presence, subsystem
 * errors, provider details) are only returned to authenticated callers.
 */

import { NextRequest, NextResponse }            from 'next/server';
import { dbQuery, tableExists }                 from '@/db/client';
import { pingRedis, isRedisConfigured }         from '@/lib/cache/redis';
import { getPipelineLockStatus }                from '@/lib/pipeline/lock';
import { getProvider, getActiveProviderName }   from '@/lib/ai';
import { getOrCreateRequestId, logWithRequestId } from '@/lib/requestId';

// Tables that must exist for the platform to function
const CRITICAL_TABLES = [
  'articles',
  'events',
  'signals',
  'entities',
  'pipeline_runs',
] as const;

// Tables added by optional migrations
const OPTIONAL_TABLES = [
  'regulations',
  'ai_models',
  'funding_rounds',
  'pipeline_locks',
  'page_snapshots',
  'signal_contexts',   // migration 006 — intelligence context layer
] as const;

const CRITICAL_ENV_VARS = ['DATABASE_URL', 'CRON_SECRET', 'ADMIN_SECRET', 'GNEWS_API_KEY'] as const;
const OPTIONAL_ENV_VARS = [
  'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN',
  'GROQ_API_KEY', 'GROK_API_KEY', 'OPENAI_API_KEY',
  'RESEND_KEY',
] as const;

const STALE_THRESHOLD_HOURS = parseInt(process.env.PIPELINE_STALE_HOURS ?? '24', 10);

function isAdminAuthenticated(req: NextRequest): boolean {
  const adminSecret = process.env.ADMIN_SECRET ?? '';
  if (!adminSecret) return false;
  const provided = req.headers.get('x-admin-secret') ?? '';
  return provided === adminSecret;
}

export async function GET(req: NextRequest) {
  const now = Date.now();
  const reqId = getOrCreateRequestId(req);

  // ── 1. Database connectivity (needed for public status too) ───────────────
  let dbConnected = false;
  let dbError: string | undefined;
  try {
    const rows = await dbQuery<{ now: string }>`SELECT NOW() AS now`;
    dbConnected = rows.length > 0;
    if (!dbConnected) dbError = 'SELECT NOW() returned no rows';
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  const isAdmin = isAdminAuthenticated(req);

  // ── Public minimal response (unauthenticated) ─────────────────────────────
  if (!isAdmin) {
    logWithRequestId(reqId, 'health', `public status=${dbConnected ? 'ok' : 'degraded'}`);
    return NextResponse.json(
      {
        ok:        dbConnected,
        status:    dbConnected ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        requestId: reqId,
      },
      {
        status:  dbConnected ? 200 : 503,
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', 'x-request-id': reqId },
      },
    );
  }

  // ── Authenticated full diagnostics ────────────────────────────────────────

  // 2. Redis connectivity + lock status
  const redisStatus  = await pingRedis();
  const redisEnabled = isRedisConfigured();

  let lockStatus: { locked: boolean; lockedBy?: string; strategy?: string } = { locked: false };
  try {
    lockStatus = await getPipelineLockStatus();
  } catch {
    // Non-critical
  }

  // 3. Schema readiness
  const criticalTableStatus: Record<string, boolean> = {};
  const optionalTableStatus: Record<string, boolean> = {};

  if (dbConnected) {
    const criticalChecks = await Promise.all(
      CRITICAL_TABLES.map(t => tableExists(t).then(exists => [t, exists] as const)),
    );
    const optionalChecks = await Promise.all(
      OPTIONAL_TABLES.map(t => tableExists(t).then(exists => [t, exists] as const)),
    );
    for (const [t, e] of criticalChecks) criticalTableStatus[t] = e;
    for (const [t, e] of optionalChecks)  optionalTableStatus[t] = e;
  }

  const allCriticalTablesPresent = Object.values(criticalTableStatus).every(Boolean);
  const missingCriticalTables    = Object.entries(criticalTableStatus)
    .filter(([, v]) => !v).map(([k]) => k);
  const missingOptionalTables    = Object.entries(optionalTableStatus)
    .filter(([, v]) => !v).map(([k]) => k);

  // 4. LLM provider
  let llmError: string | undefined;
  try {
    await getProvider();
  } catch (err) {
    llmError = err instanceof Error ? err.message : String(err);
  }

  // 5. Environment readiness
  const missingCriticalEnv = CRITICAL_ENV_VARS.filter(v => !process.env[v]);
  const missingOptionalEnv = OPTIONAL_ENV_VARS.filter(v => !process.env[v]);

  // 6. Last pipeline run
  let lastRun:           Record<string, unknown> | null = null;
  let lastSuccessfulRun: Record<string, unknown> | null = null;
  let isDataStale = false;

  if (dbConnected && criticalTableStatus['pipeline_runs']) {
    try {
      const lastRows = await dbQuery<{
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
      if (lastRows.length > 0) lastRun = lastRows[0] as Record<string, unknown>;
    } catch {
      try {
        const rows = await dbQuery<{
          id: number; run_at: string; stage: string; status: string;
          ingested: number | null; signals_generated: number | null; duration_ms: number | null;
        }>`
          SELECT id, run_at, stage, status, ingested, signals_generated, duration_ms
          FROM pipeline_runs
          ORDER BY run_at DESC
          LIMIT 1
        `;
        if (rows.length > 0) lastRun = rows[0] as Record<string, unknown>;
      } catch { /* no-op */ }
    }

    try {
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
        lastSuccessfulRun = successRows[0] as Record<string, unknown>;
        const lastSuccessMs   = new Date(successRows[0].run_at).getTime();
        const hoursSinceLast  = (now - lastSuccessMs) / 3_600_000;
        isDataStale           = hoursSinceLast > STALE_THRESHOLD_HOURS;
      } else {
        isDataStale = true;
      }
    } catch { /* no-op */ }
  }

  // 7. Overall readiness
  const ready = dbConnected && allCriticalTablesPresent && missingCriticalEnv.length === 0;

  const warnings: string[] = [];
  if (isDataStale)                    warnings.push(`No successful pipeline run in the last ${STALE_THRESHOLD_HOURS}h`);
  if (missingOptionalTables.length > 0) warnings.push(`Optional tables absent: ${missingOptionalTables.join(', ')} — run POST /api/migrate`);
  if (missingOptionalEnv.length > 0)  warnings.push(`Optional env vars not set: ${missingOptionalEnv.join(', ')}`);
  if (lockStatus.locked)              warnings.push(`Pipeline lock is held by: ${lockStatus.lockedBy}`);

  logWithRequestId(reqId, 'health', `admin ready=${ready} db=${dbConnected}`);
  const health = {
    ok:      ready,
    status:  ready ? 'ok' : 'degraded',
    ready,
    requestId:   reqId,
    timestamp:   new Date().toISOString(),
    environment: process.env.NODE_ENV ?? 'unknown',
    version:     '1.0.0',

    database: {
      connected: dbConnected,
      provider:  process.env.DB_PROVIDER ?? 'neon',
      ...(dbError ? { error: dbError } : {}),
    },

    schema: {
      ready:                 allCriticalTablesPresent,
      criticalTables:        criticalTableStatus,
      optionalTables:        optionalTableStatus,
      missingCriticalTables,
      missingOptionalTables,
      migrationHint: missingCriticalTables.length > 0
        ? 'Run POST /api/migrate?key=<ADMIN_SECRET> to create missing tables'
        : null,
    },

    redis: {
      configured: redisEnabled,
      status:     redisStatus,
    },

    pipeline: {
      canonical:           'POST /api/pipeline/run',
      lock:                lockStatus,
      lastRun,
      lastSuccessfulRun,
      dataStale:           isDataStale,
      staleThresholdHours: STALE_THRESHOLD_HOURS,
    },

    llm: {
      provider:      getActiveProviderName() ?? 'not_resolved',
      hasGroq:       Boolean(process.env.GROQ_API_KEY),
      hasGrok:       Boolean(process.env.GROK_API_KEY),
      hasOpenAI:     Boolean(process.env.OPENAI_API_KEY),
      aiProviderEnv: process.env.AI_PROVIDER ?? '(auto)',
      ...(llmError ? { error: llmError } : {}),
    },

    env: {
      missingCritical: missingCriticalEnv,
      missingOptional: missingOptionalEnv,
    },

    warnings: warnings.length > 0 ? warnings : undefined,
  };

  return NextResponse.json(health, {
    status:  ready ? 200 : 503,
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', 'x-request-id': reqId },
  });
}
