/**
 * Omterminal — Signals API Route
 *
 * Runs the signals engine over recent events and persists the results.
 * Triggered automatically by the ingest pipeline or called on demand.
 *
 * GET /api/signals?secret=<CRON_SECRET>
 *   Runs signal generation and returns newly generated signals.
 *
 * GET /api/signals?list=true
 *   Returns the most recent stored signals without re-running the engine.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRecentEvents } from '@/services/storage/eventStore';
import { generateSignalsFromEvents } from '@/services/signals/signalEngine';
import { saveSignals, getRecentSignals } from '@/services/storage/signalStore';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cronSecret   = req.headers.get('x-vercel-cron-secret') || '';
  const querySecret  = searchParams.get('secret') || '';
  const expected     = process.env.CRON_SECRET || '';
  const listOnly     = searchParams.get('list') === 'true';

  // Auth check (bypass if CRON_SECRET is not configured, e.g. local dev)
  if (expected && cronSecret !== expected && querySecret !== expected) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // List-only mode: return stored signals without running the engine
  if (listOnly) {
    const limit   = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 200);
    const signals = await getRecentSignals(limit);
    return NextResponse.json({ ok: true, signals, count: signals.length });
  }

  try {
    // 1. Fetch recent events (look back over 30 days to catch all windows)
    const events = await getRecentEvents(500);

    // 2. Run signals engine
    const signals = generateSignalsFromEvents(events);

    // 3. Persist new signals (idempotent via ON CONFLICT DO NOTHING)
    const inserted = await saveSignals(signals);

    return NextResponse.json({
      ok: true,
      eventsAnalysed: events.length,
      signalsGenerated: signals.length,
      signalsInserted: inserted,
      signals,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[api/signals] route error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export const POST = GET;
