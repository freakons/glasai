export const runtime = 'nodejs';
/**
 * Omterminal — Snapshots API Route
 *
 * Exposes intelligence snapshots generated from the signals pipeline.
 * Snapshots are stored exclusively in PostgreSQL; no filesystem reads/writes.
 *
 * GET  /api/snapshots
 *   Returns the most recent stored snapshots from the DB.
 *   Query params:
 *     limit  — number of snapshots to return (default 10, max 100)
 *     latest — if "true", return only the single latest snapshot
 *   Cache: s-maxage=30, stale-while-revalidate=120 (Vercel Edge CDN)
 *
 * POST /api/snapshots
 *   Generates a new snapshot from recently stored signals and persists it.
 *   Requires: Authorization: Bearer <CRON_SECRET> header or ?secret= query param.
 *   Body (optional JSON):
 *     { signalLimit?: number }  — how many recent signals to include (default 50)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCache as redisGet, setCache as redisSet, TTL } from '@/lib/cache/redis';
import { getRecentSignals }            from '@/services/storage/signalStore';
import { generateSnapshotFromSignals } from '@/services/snapshots/snapshotGenerator';
import {
  saveSnapshot,
  getLatestSnapshot,
  getSnapshots,
} from '@/services/storage/snapshotStore';

export const maxDuration = 10; // Vercel Hobby plan limit; upgrade to Pro for bulk snapshot operations

// Snapshots change infrequently — cache aggressively at the edge
const CACHE_HEADERS = { 'Cache-Control': 's-maxage=30, stale-while-revalidate=120' };

// ─────────────────────────────────────────────────────────────────────────────
// Auth helper
// ─────────────────────────────────────────────────────────────────────────────

function isAuthorised(req: NextRequest): boolean {
  const expected    = process.env.CRON_SECRET || '';
  if (!expected) return true; // local dev: no secret configured
  // Vercel cron sends Authorization: Bearer <CRON_SECRET>
  const authHeader  = req.headers.get('authorization') || '';
  const bearer      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const querySecret = new URL(req.url).searchParams.get('secret') || '';
  return bearer === expected || querySecret === expected;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — return stored snapshots (DB-only, edge-cached)
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const latestOnly       = searchParams.get('latest') === 'true';
    const redisKey         = latestOnly ? 'snapshots:latest' : 'snapshots:list';

    // Redis cache check
    const redisCached = await redisGet(redisKey);
    if (redisCached) {
      return NextResponse.json(redisCached, { headers: { ...CACHE_HEADERS, 'x-source': 'cache' } });
    }

    if (latestOnly) {
      const snapshot = await getLatestSnapshot();
      if (!snapshot) {
        return NextResponse.json(
          { ok: true, snapshot: null, message: 'No snapshot generated yet. POST to /api/snapshots to create one.' },
          { headers: { ...CACHE_HEADERS, 'x-source': 'empty' } },
        );
      }
      const payload = { ok: true, snapshot };
      await redisSet(redisKey, payload, TTL.SNAPSHOTS);
      return NextResponse.json(payload, { headers: { ...CACHE_HEADERS, 'x-source': 'db' } });
    }

    const limit     = Math.min(parseInt(searchParams.get('limit') ?? '10', 10), 100);
    const snapshots = await getSnapshots(limit);
    const payload   = { ok: true, count: snapshots.length, snapshots };
    await redisSet(redisKey, payload, TTL.SNAPSHOTS);

    return NextResponse.json(payload, { headers: { ...CACHE_HEADERS, 'x-source': 'db' } });
  } catch (err) {
    console.error('[api/snapshots] GET error:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to fetch snapshots from database', snapshots: [] },
      { status: 503, headers: { 'x-source': 'error' } },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — generate and persist a new snapshot from recent signals (DB-only)
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!isAuthorised(req)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    // Parse optional body
    let signalLimit = 50;
    try {
      const body = await req.json() as { signalLimit?: number };
      if (typeof body.signalLimit === 'number') {
        signalLimit = Math.min(Math.max(1, body.signalLimit), 200);
      }
    } catch {
      // No body or invalid JSON — use defaults
    }

    // 1. Fetch recent signals from DB signal store
    const signals = await getRecentSignals(signalLimit);

    // 2. Generate snapshot from signals
    const snapshot = generateSnapshotFromSignals(signals);

    // 3. Persist to DB (idempotent via ON CONFLICT DO NOTHING)
    const inserted = await saveSnapshot(snapshot);

    console.log(`[api/snapshots] POST: generated snapshotId=${snapshot.id} signals=${signals.length} inserted=${inserted}`);

    return NextResponse.json({
      ok:          true,
      inserted,
      signalsUsed: signals.length,
      snapshot,
      timestamp:   new Date().toISOString(),
    });
  } catch (err) {
    console.error('[api/snapshots] POST error:', err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}
