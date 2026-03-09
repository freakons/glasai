export const runtime = 'nodejs';
/**
 * Omterminal — Signals API Route
 *
 * Runs the signals engine over recent events and persists the results.
 * Triggered automatically by the ingest pipeline or called on demand.
 *
 * GET /api/signals
 *   No params required — returns stored signals in frontend format.
 *   Returns source='db' when real data exists, source='empty' when the DB
 *   has no signals yet.  Never silently falls back to mock data; callers
 *   must detect source='empty' and show an appropriate empty state.
 *
 * GET /api/signals?secret=<CRON_SECRET>
 *   Runs signal generation and returns newly generated signals.
 *
 * GET /api/signals?list=true
 *   Returns the most recent stored signals in the internal engine format
 *   without re-running the engine.
 *
 * Error transparency contract:
 *   DB unavailable        → HTTP 503  { ok: false, source: 'error', error: '...' }
 *   No signals in DB yet  → HTTP 200  { ok: true,  source: 'empty', signals: [], count: 0 }
 *   Real signals found    → HTTP 200  { ok: true,  source: 'db',    signals: [...] }
 *   Engine failure        → HTTP 500  { ok: false, error: '...' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateEnvironment } from '@/lib/env';
import { createRequestId, logWithRequestId } from '@/lib/requestId';
import { getCache, setCache } from '@/lib/memoryCache';
import { getEdgeSignals, setEdgeSignals } from '@/lib/edgeCache';
import { getRecentEvents } from '@/services/storage/eventStore';
import { generateSignalsFromEvents } from '@/services/signals/signalEngine';
import { saveSignals, getRecentSignals } from '@/services/storage/signalStore';
import { getSignals } from '@/db/queries';

export const maxDuration = 10; // Vercel Hobby plan limit; upgrade to Pro for larger event lookbacks

// Short TTL so fresh data appears quickly; stale-while-revalidate keeps UX snappy
const CACHE_HEADERS = { 'Cache-Control': 's-maxage=10, stale-while-revalidate=60' };

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const reqId = createRequestId();
  validateEnvironment(['DATABASE_URL', 'CRON_SECRET']);

  const { searchParams } = new URL(req.url);
  const cronSecret  = req.headers.get('x-vercel-cron-secret') || '';
  const querySecret = searchParams.get('secret') || '';
  const expected    = process.env.CRON_SECRET || '';
  const listOnly    = searchParams.get('list') === 'true';

  // ── Frontend mode ─────────────────────────────────────────────────────────
  // Called without auth params → serve frontend-formatted signals from DB.
  // No mock-data fallback: callers receive an explicit source indicator.
  const isAuthRequest =
    listOnly ||
    (expected !== '' && (cronSecret === expected || querySecret === expected));

  if (!isAuthRequest) {
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200);

    // 1. Edge cache (KV-backed, cross-region)
    const edgeCached = await getEdgeSignals();
    if (edgeCached) {
      return Response.json(edgeCached);
    }

    // 2. In-process memory cache (per-instance, 5 s)
    const cached = getCache('signals', 5000);
    if (cached) {
      return Response.json(cached);
    }

    // 3. Database query
    try {
      const dbSignals = await getSignals(limit);

      if (dbSignals.length > 0) {
        const payload = { ok: true, source: 'db', signals: dbSignals, count: dbSignals.length };
        await setEdgeSignals(payload);
        setCache('signals', payload);
        logWithRequestId(reqId, 'signals', `source=db signals=${dbSignals.length} ms=${Date.now() - t0}`);
        return NextResponse.json(payload, { headers: CACHE_HEADERS });
      }

      // DB is reachable but has no signals yet — return an explicit empty state.
      // Do NOT serve mock data: this would mask a real pipeline issue.
      logWithRequestId(reqId, 'signals', `source=empty ms=${Date.now() - t0}`);
      return NextResponse.json(
        {
          ok: true,
          source: 'empty',
          signals: [],
          count: 0,
          message: 'No signals ingested yet. Trigger /api/ingest to populate.',
        },
        { headers: CACHE_HEADERS },
      );
    } catch (err) {
      // DB query failed — surface the error clearly rather than hiding it with mock data.
      console.error('[api/signals] DB fetch error:', err);
      return NextResponse.json(
        {
          ok: false,
          source: 'error',
          error: process.env.NODE_ENV === 'production' ? 'Database unavailable' : String(err),
          signals: [],
          count: 0,
        },
        { status: 503 },
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

    logWithRequestId(reqId, 'signals', `engine: events=${events.length} generated=${signals.length} inserted=${inserted} ms=${Date.now() - t0}`);

    return NextResponse.json({
      ok:               true,
      eventsAnalysed:   events.length,
      signalsGenerated: signals.length,
      signalsInserted:  inserted,
      signals,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[api/signals] engine error:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export const POST = GET;
