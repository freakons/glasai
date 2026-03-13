export const runtime = 'nodejs';

/**
 * Omterminal — Production Health & Diagnostics Endpoint
 *
 * GET /api/health
 *
 * Public (no auth):
 *   Returns a minimal liveness/readiness response safe for uptime monitors
 *   and deployment checks.
 *   { status, grade, timestamp, requestId }
 *
 * Authenticated (x-admin-secret: <ADMIN_SECRET>):
 *   Returns full operational diagnostics for operator use:
 *   - Per-subsystem health grades (healthy / degraded / failing / unavailable)
 *   - Database connectivity, timeout state, schema readiness
 *   - Redis/cache layer readiness
 *   - Pipeline lock state, last run, last ingest, last signals run
 *   - LLM provider visibility
 *   - Environment/config safety diagnostics (no secret values)
 *   - Cron/scheduler readiness inference
 *   - Actionable warnings
 *
 * Health Grading Model:
 *   healthy  — all critical subsystems operational, data fresh
 *   degraded — operational but with warnings (stale data, missing optional
 *              config, redis down, optional tables absent)
 *   failing  — not operational (DB down, critical env missing, critical
 *              tables missing)
 */

import { NextRequest, NextResponse }            from 'next/server';
import { dbQuery, tableExists, withDbContext, getDbQueryTimeoutMs } from '@/db/client';
import { TimeoutError }                         from '@/lib/withTimeout';
import { pingRedis, isRedisConfigured }         from '@/lib/cache/redis';
import { getPipelineLockStatus }                from '@/lib/pipeline/lock';
import { getProvider, getActiveProviderName }   from '@/lib/ai';
import { getOrCreateRequestId, logWithRequestId } from '@/lib/requestId';
import { getCache, setCache, MEM_TTL }          from '@/lib/memoryCache';
import { runAllConsistencyChecks }              from '@/db/consistencyChecks';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Tables that must exist for the platform to function. */
const CRITICAL_TABLES = [
  'articles',
  'events',
  'signals',
  'entities',
  'pipeline_runs',
] as const;

/** Tables added by optional migrations. */
const OPTIONAL_TABLES = [
  'regulations',
  'ai_models',
  'funding_rounds',
  'pipeline_locks',
  'page_snapshots',
  'signal_contexts',
] as const;

const CRITICAL_ENV_VARS = ['DATABASE_URL', 'CRON_SECRET', 'ADMIN_SECRET', 'GNEWS_API_KEY'] as const;
const OPTIONAL_ENV_VARS = [
  'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN',
  'GROQ_API_KEY', 'GROK_API_KEY', 'OPENAI_API_KEY',
  'RESEND_KEY',
] as const;

const STALE_THRESHOLD_HOURS = parseInt(process.env.PIPELINE_STALE_HOURS ?? '24', 10);

// ── Types ─────────────────────────────────────────────────────────────────────

type SubsystemGrade = 'healthy' | 'degraded' | 'failing' | 'unavailable';
type OverallGrade   = 'healthy' | 'degraded' | 'failing';

interface SubsystemStatus {
  status: SubsystemGrade;
  message?: string;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

function isAdminAuthenticated(req: NextRequest): boolean {
  const adminSecret = process.env.ADMIN_SECRET ?? '';
  if (!adminSecret) return false;
  const provided = req.headers.get('x-admin-secret') ?? '';
  return provided === adminSecret;
}

// ── Grade computation ─────────────────────────────────────────────────────────

function computeOverallGrade(subsystems: Record<string, SubsystemStatus>): OverallGrade {
  const grades = Object.values(subsystems).map(s => s.status);
  if (grades.some(g => g === 'failing')) return 'failing';
  if (grades.some(g => g === 'degraded')) return 'degraded';
  return 'healthy';
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const requestId = getOrCreateRequestId(req);
  const timestamp = new Date().toISOString();

  const isAdmin = isAdminAuthenticated(req);

  // ── Public minimal response (unauthenticated) ────────────────────────────
  // For uptime-monitor traffic, serve a 5 s in-memory cached result so
  // repeated probes within the same instance don't each trigger a DB ping.
  // timestamp and requestId are always regenerated fresh for correlation.
  // Admin diagnostics are never cached — operators need live subsystem data.
  if (!isAdmin) {
    const memHit = getCache<{ status: OverallGrade; ok: boolean }>('health:public', MEM_TTL.HEALTH_PUBLIC);
    if (memHit) {
      return NextResponse.json(
        { status: memHit.status, ok: memHit.ok, timestamp, requestId },
        {
          status:  memHit.ok ? 200 : 503,
          headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', 'x-request-id': requestId },
        },
      );
    }

    // Cache miss — perform live DB connectivity check.
    let dbConnected = false;
    let dbTimedOut  = false;
    try {
      const db   = withDbContext({ operation: 'health:ping', requestId });
      const rows = await db.queryStrict<{ now: string }>`SELECT NOW() AS now`;
      dbConnected = rows.length > 0;
    } catch (err) {
      dbTimedOut = err instanceof TimeoutError;
    }

    const publicGrade: OverallGrade = dbConnected
      ? 'healthy'
      : (dbTimedOut ? 'degraded' : 'failing');

    // Populate cache so next probe in this instance skips the DB ping.
    setCache('health:public', { status: publicGrade, ok: dbConnected }, MEM_TTL.HEALTH_PUBLIC);

    logWithRequestId(requestId, 'health', `public status=${publicGrade}`);
    return NextResponse.json(
      { status: publicGrade, ok: dbConnected, timestamp, requestId },
      {
        status:  dbConnected ? 200 : 503,
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', 'x-request-id': requestId },
      },
    );
  }

  // ── Authenticated full diagnostics — always live, never cached ───────────

  // ── 1. Database connectivity ──────────────────────────────────────────────
  let dbConnected = false;
  let dbError: string | undefined;
  let dbTimedOut = false;
  let dbLatencyMs: number | undefined;
  try {
    const t0 = Date.now();
    const db = withDbContext({ operation: 'health:ping', requestId });
    const rows = await db.queryStrict<{ now: string }>`SELECT NOW() AS now`;
    dbLatencyMs = Date.now() - t0;
    dbConnected = rows.length > 0;
    if (!dbConnected) dbError = 'SELECT NOW() returned no rows';
  } catch (err) {
    dbTimedOut = err instanceof TimeoutError;
    dbError = err instanceof Error ? err.message : String(err);
  }

  const subsystems: Record<string, SubsystemStatus> = {};
  const warnings: string[] = [];

  // ── 2. Database subsystem ─────────────────────────────────────────────────
  if (!dbConnected) {
    subsystems.database = {
      status: dbTimedOut ? 'degraded' : 'failing',
      message: dbError ?? 'Connection failed',
    };
  } else {
    subsystems.database = { status: 'healthy' };
  }

  // ── 3. Schema readiness ───────────────────────────────────────────────────
  const criticalTableStatus: Record<string, boolean> = {};
  const optionalTableStatus: Record<string, boolean> = {};

  if (dbConnected) {
    const [criticalChecks, optionalChecks] = await Promise.all([
      Promise.all(CRITICAL_TABLES.map(t => tableExists(t).then(exists => [t, exists] as const))),
      Promise.all(OPTIONAL_TABLES.map(t => tableExists(t).then(exists => [t, exists] as const))),
    ]);
    for (const [t, e] of criticalChecks) criticalTableStatus[t] = e;
    for (const [t, e] of optionalChecks) optionalTableStatus[t] = e;
  }

  const allCriticalTablesPresent = dbConnected && Object.values(criticalTableStatus).every(Boolean);
  const missingCriticalTables = Object.entries(criticalTableStatus).filter(([, v]) => !v).map(([k]) => k);
  const missingOptionalTables = Object.entries(optionalTableStatus).filter(([, v]) => !v).map(([k]) => k);

  if (!dbConnected) {
    subsystems.schema = { status: 'unavailable', message: 'Database not connected' };
  } else if (missingCriticalTables.length > 0) {
    subsystems.schema = {
      status: 'failing',
      message: `Missing critical tables: ${missingCriticalTables.join(', ')}`,
    };
  } else if (missingOptionalTables.length > 0) {
    subsystems.schema = {
      status: 'degraded',
      message: `Missing optional tables: ${missingOptionalTables.join(', ')}`,
    };
    warnings.push(`Optional tables absent: ${missingOptionalTables.join(', ')} — run POST /api/migrate`);
  } else {
    subsystems.schema = { status: 'healthy' };
  }

  // ── 4. Redis / Cache ──────────────────────────────────────────────────────
  const redisEnabled = isRedisConfigured();
  let redisStatus: 'connected' | 'disconnected' | 'not_configured' = 'not_configured';
  if (redisEnabled) {
    redisStatus = await pingRedis();
  }

  if (!redisEnabled) {
    subsystems.cache = { status: 'degraded', message: 'Redis not configured — using in-memory fallback' };
    warnings.push('Redis not configured — cache layer is in-memory only');
  } else if (redisStatus === 'disconnected') {
    subsystems.cache = { status: 'degraded', message: 'Redis configured but unreachable' };
    warnings.push('Redis configured but unreachable');
  } else {
    subsystems.cache = { status: 'healthy' };
  }

  // ── 5. Pipeline lock ──────────────────────────────────────────────────────
  let lockStatus: { locked: boolean; lockedBy?: string; lockedAt?: string; strategy?: string } = { locked: false };
  try {
    lockStatus = await getPipelineLockStatus();
  } catch {
    // Non-critical
  }

  if (lockStatus.locked) {
    warnings.push(`Pipeline lock is held by: ${lockStatus.lockedBy ?? 'unknown'}`);
  }

  // ── 6. Pipeline runs — last run, last ingest, last signals ────────────────
  let lastRun:             Record<string, unknown> | null = null;
  let lastSuccessfulRun:   Record<string, unknown> | null = null;
  let lastIngestRun:       Record<string, unknown> | null = null;
  let lastSignalsRun:      Record<string, unknown> | null = null;
  let totalRuns    = 0;
  let isDataStale  = true;

  if (dbConnected && criticalTableStatus['pipeline_runs']) {
    const db = withDbContext({ operation: 'health:pipeline_runs', requestId });

    // Last run (any stage/status)
    try {
      const rows = await db.query<{
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
      if (rows.length > 0) lastRun = rows[0] as Record<string, unknown>;
    } catch {
      // Extended columns absent — try base schema
      try {
        const rows = await db.query<{
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

    // Last successful run
    try {
      const rows = await db.query<{
        id: number; run_at: string; status: string; duration_ms: number | null;
      }>`
        SELECT id, run_at, status, duration_ms
        FROM pipeline_runs
        WHERE status IN ('ok', 'completed')
        ORDER BY run_at DESC
        LIMIT 1
      `;
      if (rows.length > 0) {
        lastSuccessfulRun = rows[0] as Record<string, unknown>;
        const hoursSince = (Date.now() - new Date(rows[0].run_at).getTime()) / 3_600_000;
        isDataStale = hoursSince > STALE_THRESHOLD_HOURS;
      }
    } catch { /* no-op */ }

    // Last ingest-stage run
    try {
      const rows = await db.query<{
        id: number; run_at: string; status: string; ingested: number | null; duration_ms: number | null;
      }>`
        SELECT id, run_at, status, ingested, duration_ms
        FROM pipeline_runs
        WHERE stage = 'ingest'
        ORDER BY run_at DESC
        LIMIT 1
      `;
      if (rows.length > 0) lastIngestRun = rows[0] as Record<string, unknown>;
    } catch { /* no-op */ }

    // Last signals-stage run
    try {
      const rows = await db.query<{
        id: number; run_at: string; status: string; signals_generated: number | null; duration_ms: number | null;
      }>`
        SELECT id, run_at, status, signals_generated, duration_ms
        FROM pipeline_runs
        WHERE stage = 'signals'
        ORDER BY run_at DESC
        LIMIT 1
      `;
      if (rows.length > 0) lastSignalsRun = rows[0] as Record<string, unknown>;
    } catch { /* no-op */ }

    // Total runs
    try {
      const rows = await db.query<{ count: string }>`
        SELECT COUNT(*)::text AS count FROM pipeline_runs
      `;
      totalRuns = parseInt(rows[0]?.count ?? '0', 10) || 0;
    } catch { /* no-op */ }
  }

  // Pipeline subsystem status
  if (!dbConnected || !criticalTableStatus['pipeline_runs']) {
    subsystems.pipeline = { status: 'unavailable', message: 'Pipeline runs table not available' };
  } else if (!lastSuccessfulRun) {
    subsystems.pipeline = { status: 'degraded', message: 'No successful pipeline run recorded' };
  } else if (isDataStale) {
    subsystems.pipeline = {
      status: 'degraded',
      message: `No successful pipeline run in the last ${STALE_THRESHOLD_HOURS}h`,
    };
    warnings.push(`No successful pipeline run in the last ${STALE_THRESHOLD_HOURS}h`);
  } else {
    subsystems.pipeline = { status: 'healthy' };
  }

  // ── 7. LLM provider ──────────────────────────────────────────────────────
  let llmError: string | undefined;
  try {
    await getProvider();
  } catch (err) {
    llmError = err instanceof Error ? err.message : String(err);
  }

  const activeProvider = getActiveProviderName();
  if (llmError) {
    subsystems.llm = { status: 'degraded', message: llmError };
    warnings.push(`LLM provider unavailable: ${llmError}`);
  } else {
    subsystems.llm = { status: 'healthy' };
  }

  // ── 8. Environment readiness ──────────────────────────────────────────────
  const missingCriticalEnv = CRITICAL_ENV_VARS.filter(v => !process.env[v]);
  const missingOptionalEnv = OPTIONAL_ENV_VARS.filter(v => !process.env[v]);

  if (missingCriticalEnv.length > 0) {
    subsystems.environment = {
      status: 'failing',
      message: `Missing critical env vars: ${missingCriticalEnv.join(', ')}`,
    };
  } else if (missingOptionalEnv.length > 0) {
    subsystems.environment = {
      status: 'degraded',
      message: `Missing optional env vars: ${missingOptionalEnv.join(', ')}`,
    };
    warnings.push(`Optional env vars not set: ${missingOptionalEnv.join(', ')}`);
  } else {
    subsystems.environment = { status: 'healthy' };
  }

  // ── 9. Cron/scheduler readiness (inferred) ────────────────────────────────
  const hasCronSecret = Boolean(process.env.CRON_SECRET);
  if (!hasCronSecret) {
    subsystems.cron = { status: 'degraded', message: 'CRON_SECRET not set — automated scheduling may not be active' };
  } else if (isDataStale && lastSuccessfulRun) {
    subsystems.cron = {
      status: 'degraded',
      message: `Cron configured but last successful run is stale (>${STALE_THRESHOLD_HOURS}h ago)`,
    };
  } else if (!lastSuccessfulRun && dbConnected && criticalTableStatus['pipeline_runs']) {
    subsystems.cron = { status: 'degraded', message: 'Cron configured but no successful runs recorded' };
  } else if (!dbConnected) {
    subsystems.cron = { status: 'unavailable', message: 'Cannot verify — database not connected' };
  } else {
    subsystems.cron = { status: 'healthy' };
  }

  // ── 10. Data consistency (lightweight summary) ──────────────────────────
  let consistencySummary: {
    overallSeverity: string;
    checksRun: number;
    issuesFound: number;
    summary: { critical: number; warning: number; info: number };
    durationMs: number;
  } | null = null;

  if (dbConnected && allCriticalTablesPresent) {
    try {
      const report = await runAllConsistencyChecks();
      consistencySummary = {
        overallSeverity: report.overallSeverity,
        checksRun:       report.checksRun,
        issuesFound:     report.issuesFound,
        summary:         report.summary,
        durationMs:      report.durationMs,
      };

      if (report.summary.critical > 0) {
        subsystems.dataConsistency = {
          status: 'degraded',
          message: `${report.summary.critical} critical consistency issue(s) found`,
        };
        warnings.push(`Data consistency: ${report.summary.critical} critical issue(s) — see GET /api/admin/consistency`);
      } else if (report.summary.warning > 0) {
        subsystems.dataConsistency = {
          status: 'degraded',
          message: `${report.summary.warning} consistency warning(s) found`,
        };
      } else {
        subsystems.dataConsistency = { status: 'healthy' };
      }
    } catch {
      subsystems.dataConsistency = { status: 'degraded', message: 'Consistency checks failed to run' };
    }
  }

  // ── 11. Compute overall grade ─────────────────────────────────────────────
  const grade = computeOverallGrade(subsystems);

  logWithRequestId(requestId, 'health', `admin grade=${grade} db=${dbConnected}`);
  const health = {
    status:    grade,
    ok:        grade !== 'failing',
    timestamp,
    requestId,
    environment: process.env.NODE_ENV ?? 'unknown',
    version:     '1.0.0',

    subsystems,

    database: {
      connected:      dbConnected,
      latencyMs:      dbLatencyMs ?? null,
      provider:       process.env.DB_PROVIDER ?? 'neon',
      queryTimeoutMs: getDbQueryTimeoutMs(),
      ...(dbTimedOut ? { timedOut: true } : {}),
      ...(dbError    ? { error: dbError } : {}),
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

    cache: {
      configured: redisEnabled,
      status:     redisStatus,
    },

    pipeline: {
      canonical:           'POST /api/pipeline/run',
      lock:                lockStatus,
      lastRun,
      lastSuccessfulRun,
      lastIngestRun,
      lastSignalsRun,
      totalRuns,
      dataStale:           isDataStale,
      staleThresholdHours: STALE_THRESHOLD_HOURS,
    },

    llm: {
      provider:      activeProvider ?? 'not_resolved',
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

    cron: {
      configured:        hasCronSecret,
      staleThresholdHours: STALE_THRESHOLD_HOURS,
    },

    dataConsistency: consistencySummary
      ? {
          ...consistencySummary,
          detailEndpoint: 'GET /api/admin/consistency',
        }
      : { status: 'skipped', reason: 'Database or critical tables not available' },

    warnings: warnings.length > 0 ? warnings : undefined,
  };

  return NextResponse.json(health, {
    status:  grade === 'failing' ? 503 : 200,
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', 'x-request-id': requestId },
  });
}
