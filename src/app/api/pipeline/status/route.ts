export const runtime = 'nodejs';

/**
 * Omterminal — Pipeline Freshness Status & Recovery Endpoint
 *
 * GET  /api/pipeline/status   — authenticated freshness diagnostics
 * POST /api/pipeline/status   — force-clear stale lock (recovery action)
 *
 * Auth: x-admin-secret header OR ?secret= query param matching ADMIN_SECRET.
 *
 * This endpoint lets a founder quickly answer:
 *   "Did the pipeline run? Where did it fail? Is a lock stuck?"
 * And take recovery action (force-clear lock) if needed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbQuery }                   from '@/db/client';
import { createRequestId }           from '@/lib/requestId';
import {
  getPipelineLockStatus,
  forceReleasePipelineLock,
} from '@/lib/pipelineLock';

// ── Auth ──────────────────────────────────────────────────────────────────────

function isAuthenticated(req: NextRequest): boolean {
  const adminSecret = process.env.ADMIN_SECRET ?? '';
  if (!adminSecret) return false;
  const header = req.headers.get('x-admin-secret') ?? '';
  if (header === adminSecret) return true;
  const query = new URL(req.url).searchParams.get('secret') ?? '';
  if (query === adminSecret) return true;
  return false;
}

// ── GET: Freshness diagnostics ────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!isAuthenticated(req)) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  }

  const requestId = createRequestId();
  const now = new Date();

  // Collect diagnostics in parallel where possible
  const [
    pipelineLock,
    intelligenceLock,
    recentRuns,
    articleStats,
    signalStats,
    eventStats,
  ] = await Promise.all([
    getPipelineLockStatus('pipeline/run').catch(() => ({ locked: false } as { locked: boolean })),
    getPipelineLockStatus('intelligence/run').catch(() => ({ locked: false } as { locked: boolean })),
    safeDbQuery<{
      id: number; run_at: string; stage: string; status: string;
      ingested: number | null; signals_generated: number | null;
      duration_ms: number | null; trigger_type: string | null;
      correlation_id: string | null; error_summary: string | null;
    }>(dbQuery`
      SELECT id, run_at, stage, status, ingested, signals_generated,
             duration_ms, trigger_type, correlation_id, error_summary
      FROM pipeline_runs
      ORDER BY run_at DESC
      LIMIT 10
    `),
    safeDbQuery<{ total: string; last_24h: string; latest_at: string | null }>(dbQuery`
      SELECT
        COUNT(*)::text AS total,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::text AS last_24h,
        MAX(created_at)::text AS latest_at
      FROM articles
    `),
    safeDbQuery<{ total: string; last_24h: string; latest_at: string | null }>(dbQuery`
      SELECT
        COUNT(*)::text AS total,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::text AS last_24h,
        MAX(created_at)::text AS latest_at
      FROM signals
    `),
    safeDbQuery<{ total: string; last_24h: string; latest_at: string | null }>(dbQuery`
      SELECT
        COUNT(*)::text AS total,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::text AS last_24h,
        MAX(created_at)::text AS latest_at
      FROM events
    `),
  ]);

  // Compute freshness assessment
  const lastSuccessfulRun = recentRuns?.find(r => r.status === 'ok' || r.status === 'completed');
  const lastFailedRun = recentRuns?.find(r => r.status === 'error');
  const hoursSinceSuccess = lastSuccessfulRun
    ? (now.getTime() - new Date(lastSuccessfulRun.run_at).getTime()) / 3_600_000
    : null;

  let freshness: 'fresh' | 'stale' | 'critical' | 'unknown' = 'unknown';
  if (hoursSinceSuccess !== null) {
    if (hoursSinceSuccess <= 2) freshness = 'fresh';
    else if (hoursSinceSuccess <= 24) freshness = 'stale';
    else freshness = 'critical';
  }

  const anyLockStale = (pipelineLock as { isStale?: boolean }).isStale ||
                       (intelligenceLock as { isStale?: boolean }).isStale;

  return NextResponse.json({
    ok: true,
    requestId,
    timestamp: now.toISOString(),

    freshness: {
      grade: freshness,
      hoursSinceLastSuccess: hoursSinceSuccess !== null ? Math.round(hoursSinceSuccess * 10) / 10 : null,
      lastSuccessfulRun: lastSuccessfulRun ?? null,
      lastFailedRun: lastFailedRun ?? null,
    },

    locks: {
      pipeline: pipelineLock,
      intelligence: intelligenceLock,
      anyStale: anyLockStale,
      hint: anyLockStale
        ? 'Stale lock detected. POST to this endpoint with ?action=force_unlock to clear it.'
        : null,
    },

    recentRuns: recentRuns ?? [],

    dataCounts: {
      articles: articleStats?.[0] ?? null,
      signals: signalStats?.[0] ?? null,
      events: eventStats?.[0] ?? null,
    },

    config: {
      maxDuration: {
        pipelineRun: 300,
        intelligenceRun: 60,
      },
      cronSchedule: {
        pipelineRun: '0 * * * * (hourly)',
        intelligenceRun: '0 */2 * * * (every 2 hours)',
        alertsDigest: '0 7 * * * (daily 7am UTC)',
      },
      envPresent: {
        DATABASE_URL: Boolean(process.env.DATABASE_URL),
        CRON_SECRET: Boolean(process.env.CRON_SECRET),
        ADMIN_SECRET: Boolean(process.env.ADMIN_SECRET),
        GNEWS_API_KEY: Boolean(process.env.GNEWS_API_KEY),
        UPSTASH_REDIS_REST_URL: Boolean(process.env.UPSTASH_REDIS_REST_URL),
      },
    },
  }, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  });
}

// ── POST: Recovery actions ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!isAuthenticated(req)) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  }

  const requestId = createRequestId();
  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  if (action === 'force_unlock') {
    const scope = url.searchParams.get('scope') ?? undefined;

    // Clear both scopes if no specific scope requested
    const scopes = scope ? [scope] : ['pipeline/run', 'intelligence/run'];
    const results: Record<string, unknown> = {};

    for (const s of scopes) {
      results[s] = await forceReleasePipelineLock(s);
    }

    return NextResponse.json({
      ok: true,
      requestId,
      action: 'force_unlock',
      timestamp: new Date().toISOString(),
      results,
      hint: 'Lock(s) cleared. You can now POST /api/pipeline/run to trigger a fresh run.',
    });
  }

  return NextResponse.json({
    ok: false,
    requestId,
    message: 'Unknown action. Supported: ?action=force_unlock',
    supportedActions: [
      { action: 'force_unlock', method: 'POST', description: 'Force-clear stale pipeline locks' },
    ],
  }, { status: 400 });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function safeDbQuery<T>(promise: Promise<T[]>): Promise<T[] | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}
