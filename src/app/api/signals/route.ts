export const runtime = 'nodejs';
/**
 * Omterminal — Signals API Route
 *
 * Runs the signals engine over recent events and persists the results.
 * Triggered automatically by the ingest pipeline or called on demand.
 *
 * GET /api/signals
 *   No params required — returns stored signals in frontend format (with
 *   mock-data fallback).  Safe to call from the frontend without auth.
 *
 * GET /api/signals?secret=<CRON_SECRET>
 *   Runs signal generation and returns newly generated signals.
 *
 * GET /api/signals?list=true
 *   Returns the most recent stored signals in the internal engine format
 *   without re-running the engine.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateEnvironment } from '@/lib/env';
import { getRecentEvents } from '@/services/storage/eventStore';
import { generateSignalsFromEvents } from '@/services/signals/signalEngine';
import { saveSignals, getRecentSignals } from '@/services/storage/signalStore';
import { getSignals } from '@/db/queries';
import { MOCK_SIGNALS } from '@/data/mockSignals';

export const maxDuration = 10; // Vercel Hobby plan limit; upgrade to Pro for larger event lookbacks

const CACHE_HEADERS = { 'Cache-Control': 's-maxage=5, stale-while-revalidate=30' };

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  validateEnvironment(['DATABASE_URL', 'CRON_SECRET']);

  const { searchParams } = new URL(req.url);
  const cronSecret  = req.headers.get('x-vercel-cron-secret') || '';
  const querySecret = searchParams.get('secret') || '';
  const expected    = process.env.CRON_SECRET || '';
  const listOnly    = searchParams.get('list') === 'true';

  // ── Frontend mode ─────────────────────────────────────────────────────────
  // Called without auth params → serve frontend-formatted signals with fallback.
  const isAuthRequest =
    listOnly ||
    (expected !== '' && (cronSecret === expected || querySecret === expected));

  if (!isAuthRequest) {
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200);
    try {
      const dbSignals = await getSignals(limit);

      if (dbSignals.length > 0) {
        console.log(`[signals] source=db signals=${dbSignals.length} ms=${Date.now() - t0}`);
        return NextResponse.json(
          { ok: true, source: 'db', signals: dbSignals, count: dbSignals.length },
          { headers: CACHE_HEADERS },
        );
      }

      // Empty DB — fall back to mock data
      const signals = MOCK_SIGNALS.slice(0, limit);
      console.log(`[signals] source=mock signals=${signals.length} ms=${Date.now() - t0}`);
      return NextResponse.json(
        { ok: true, source: 'mock', signals, count: signals.length },
        { headers: CACHE_HEADERS },
      );
    } catch (err) {
      console.error('[api/signals] frontend fetch error:', err);
      const signals = MOCK_SIGNALS.slice(0, limit);
      return NextResponse.json(
        { ok: true, source: 'mock', signals, count: signals.length },
        { headers: CACHE_HEADERS },
      );
    }
  }

  // ── Auth check (engine / list modes) ─────────────────────────────────────
  if (expected && cronSecret !== expected && querySecret !== expected) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // ── List-only mode: return stored signals without running the engine ───────
  if (listOnly) {
    const limit   = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 200);
    const signals = await getRecentSignals(limit);
    return NextResponse.json({ ok: true, signals, count: signals.length });
  }

  // ── Engine mode: run signals generation ───────────────────────────────────
  try {
    // 1. Fetch recent events (look back over 30 days to catch all windows)
    const events = await getRecentEvents(500);

    // 2. Run signals engine
    const signals = generateSignalsFromEvents(events);

    // 3. Persist new signals (idempotent via ON CONFLICT DO NOTHING)
    const inserted = await saveSignals(signals);

    return NextResponse.json({
      ok:               true,
      eventsAnalysed:   events.length,
      signalsGenerated: signals.length,
      signalsInserted:  inserted,
      signals,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[api/signals] route error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export const POST = GET;
