export const runtime = 'nodejs';
/**
 * Omterminal — Snapshots API Route
 *
 * Exposes intelligence snapshots generated from the signals pipeline.
 *
 * GET  /api/snapshots
 *   Returns the most recent stored snapshots.
 *   Query params:
 *     limit  — number of snapshots to return (default 10, max 100)
 *     latest — if "true", return only the single latest snapshot
 *
 * POST /api/snapshots
 *   Generates a new snapshot from recently stored signals and persists it.
 *   Requires: secret via query param or x-vercel-cron-secret header.
 *   Body (optional JSON):
 *     { signalLimit?: number }  — how many recent signals to include (default 50)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRecentSignals }          from '@/services/storage/signalStore';
import { generateSnapshotFromSignals } from '@/services/snapshots/snapshotGenerator';
import {
  saveSnapshot,
  getLatestSnapshot,
  getSnapshots,
} from '@/services/storage/snapshotStore';

export const maxDuration = 10; // Vercel Hobby plan limit; upgrade to Pro for bulk snapshot operations

// ─────────────────────────────────────────────────────────────────────────────
// Auth helper
// ─────────────────────────────────────────────────────────────────────────────

function isAuthorised(req: NextRequest): boolean {
  const expected    = process.env.CRON_SECRET || '';
  if (!expected) return true; // local dev: no secret configured
  const cronHeader  = req.headers.get('x-vercel-cron-secret') || '';
  const querySecret = new URL(req.url).searchParams.get('secret') || '';
  return cronHeader === expected || querySecret === expected;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — return stored snapshots
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const latestOnly       = searchParams.get('latest') === 'true';

    if (latestOnly) {
      const snapshot = await getLatestSnapshot();
      if (!snapshot) {
        return NextResponse.json({ ok: true, snapshot: null });
      }
      return NextResponse.json({ ok: true, snapshot });
    }

    const limit     = Math.min(parseInt(searchParams.get('limit') ?? '10', 10), 100);
    const snapshots = await getSnapshots(limit);

    return NextResponse.json({
      ok:        true,
      count:     snapshots.length,
      snapshots,
    });
  } catch (err) {
    console.error('[api/snapshots] GET error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — generate and persist a new snapshot from recent signals
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

    // 1. Fetch recent signals from signal store
    const signals = await getRecentSignals(signalLimit);

    // 2. Generate snapshot
    const snapshot = generateSnapshotFromSignals(signals);

    // 3. Persist (idempotent)
    const inserted = await saveSnapshot(snapshot);

    return NextResponse.json({
      ok:             true,
      inserted,
      signalsUsed:    signals.length,
      snapshot,
      timestamp:      new Date().toISOString(),
    });
  } catch (err) {
    console.error('[api/snapshots] POST error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
