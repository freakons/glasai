import { NextRequest, NextResponse } from 'next/server';
import { dbQuery, tableExists, getDbQueryTimeoutMs } from '@/db/client';
import { TimeoutError }                              from '@/lib/withTimeout';
import { createRequestId }                           from '@/lib/requestId';

export const runtime = 'nodejs';

/**
 * GET /api/health/db
 *
 * Requires x-admin-secret header for access.
 * Returns DB connectivity, latency, timeout state, connection path, schema
 * status, and env presence with a structured grade.
 */

/** Derive the connection path type from the DATABASE_URL value. */
function detectConnectionPath(): 'neon-http' | 'pg-pool' | 'unconfigured' {
  const url = process.env.DATABASE_URL;
  if (!url) return 'unconfigured';
  if (url.includes('.neon.tech') || url.includes('neon.tech')) return 'neon-http';
  return 'pg-pool';
}

const OPTIONAL_ENV_VARS = [
  'DB_PROVIDER',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'AI_PROVIDER',
  'GROQ_API_KEY',
  'GROK_API_KEY',
  'OPENAI_API_KEY',
  'RESEND_KEY',
  'RESEND_AUDIENCE',
  'DIGEST_FROM',
] as const;

export async function GET(req: NextRequest) {
  const adminSecret = process.env.ADMIN_SECRET ?? '';
  const provided    = req.headers.get('x-admin-secret') ?? '';

  if (!adminSecret || provided !== adminSecret) {
    return NextResponse.json({ ok: false, status: 'unauthorized' }, { status: 401 });
  }

  const requestId = req.headers.get('x-request-id') ?? createRequestId();
  const timestamp = new Date().toISOString();

  // ── DB connectivity ───────────────────────────────────────────────────────
  let dbConnected = false;
  let dbError: string | undefined;
  let dbTimedOut = false;
  let dbLatencyMs: number | undefined;
  try {
    const t0 = Date.now();
    const rows = await dbQuery<{ now: string }>`SELECT NOW() AS now`;
    dbLatencyMs = Date.now() - t0;
    dbConnected = rows.length > 0;
    if (!dbConnected) dbError = 'SELECT NOW() returned no rows';
  } catch (err) {
    dbTimedOut = err instanceof TimeoutError;
    dbError = err instanceof Error ? err.message : String(err);
  }

  // ── Schema existence ──────────────────────────────────────────────────────
  let schemaStatus: Record<string, boolean> = {
    regulations:    false,
    ai_models:      false,
    funding_rounds: false,
  };

  if (dbConnected) {
    const [regsExist, modelsExist, fundingExist] = await Promise.all([
      tableExists('regulations'),
      tableExists('ai_models'),
      tableExists('funding_rounds'),
    ]);
    schemaStatus = {
      regulations:    regsExist,
      ai_models:      modelsExist,
      funding_rounds: fundingExist,
    };
  }

  const allTablesPresent = Object.values(schemaStatus).every(Boolean);
  const connectionPath   = detectConnectionPath();
  const dbProvider       = process.env.DB_PROVIDER || (connectionPath === 'neon-http' ? 'neon' : 'postgres');
  const missingOptionalEnv = OPTIONAL_ENV_VARS.filter(v => !process.env[v]);

  // ── Grade ─────────────────────────────────────────────────────────────────
  type Grade = 'healthy' | 'degraded' | 'failing';
  let grade: Grade;
  if (!dbConnected) {
    grade = dbTimedOut ? 'degraded' : 'failing';
  } else if (!allTablesPresent) {
    grade = 'degraded';
  } else {
    grade = 'healthy';
  }

  const ok = dbConnected;

  const body = {
    status:    grade,
    ok,
    timestamp,
    requestId,
    database: {
      connected:      dbConnected,
      connectionPath,
      provider:       dbProvider,
      latencyMs:      dbLatencyMs ?? null,
      queryTimeoutMs: getDbQueryTimeoutMs(),
      ...(dbTimedOut ? { timedOut: true } : {}),
      ...(dbError    ? { error: dbError } : {}),
    },
    schema: {
      allTablesPresent,
      tables:        schemaStatus,
      migrationHint: allTablesPresent
        ? null
        : 'Run POST /api/migrate?key=<ADMIN_SECRET> to create missing tables',
    },
    env: {
      hasDatabaseUrl:      Boolean(process.env.DATABASE_URL),
      hasAdminSecret:      Boolean(process.env.ADMIN_SECRET),
      hasCronSecret:       Boolean(process.env.CRON_SECRET),
      missingOptionalEnvs: missingOptionalEnv,
    },
  };

  return NextResponse.json(body, {
    status:  ok ? 200 : 503,
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  });
}
