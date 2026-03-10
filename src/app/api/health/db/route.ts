import { NextResponse } from 'next/server';
import { dbQuery, tableExists } from '@/db/client';

export const runtime = 'nodejs';

/** Optional env vars relevant to DB and setup — checked but not required. */
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

/** Derive the connection path type from the DATABASE_URL value. */
function detectConnectionPath(): 'neon-http' | 'pg-pool' | 'unconfigured' {
  const url = process.env.DATABASE_URL;
  if (!url) return 'unconfigured';
  if (url.includes('.neon.tech') || url.includes('neon.tech')) return 'neon-http';
  return 'pg-pool';
}

export async function GET() {
  // ── DB connectivity ───────────────────────────────────────────────────────
  let dbConnected = false;
  let dbError: string | undefined;
  try {
    const rows = await dbQuery<{ now: string }>`SELECT NOW() AS now`;
    dbConnected = rows.length > 0;
    if (!dbConnected) dbError = 'SELECT NOW() returned no rows';
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  // ── Schema existence (optional tables from migration 003) ─────────────────
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

  // ── Connection path + provider ────────────────────────────────────────────
  const connectionPath = detectConnectionPath();
  const dbProvider     = process.env.DB_PROVIDER || (connectionPath === 'neon-http' ? 'neon' : 'postgres');

  // ── Missing optional env vars ─────────────────────────────────────────────
  const missingOptionalEnv = OPTIONAL_ENV_VARS.filter(v => !process.env[v]);

  // ── Response ──────────────────────────────────────────────────────────────
  const ok = dbConnected;

  const body = {
    ok,
    status:         ok ? 'ok' : 'error',
    timestamp:      new Date().toISOString(),
    database: {
      connected:      dbConnected,
      connectionPath,
      provider:       dbProvider,
      ...(dbError ? { error: dbError } : {}),
    },
    schema: {
      allTablesPresent,
      tables: schemaStatus,
      migrationHint: allTablesPresent
        ? null
        : 'Run POST /api/migrate?key=<ADMIN_SECRET> to create missing tables',
    },
    env: {
      hasDatabaseUrl:       Boolean(process.env.DATABASE_URL),
      hasAdminSecret:       Boolean(process.env.ADMIN_SECRET),
      hasCronSecret:        Boolean(process.env.CRON_SECRET),
      missingOptionalEnvs:  missingOptionalEnv,
    },
  };

  return NextResponse.json(body, {
    status: ok ? 200 : 503,
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  });
}
