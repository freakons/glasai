export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getSignals } from '@/db/queries';
import { createRequestId, logWithRequestId } from '@/lib/requestId';
import { parseSignalMode } from '@/lib/signals/signalModes';
import { getCache, setCache, MEM_TTL } from '@/lib/memoryCache';

// s-maxage=10 keeps CDN copies fresh; stale-while-revalidate extends TTL gracefully
const CACHE_HEADERS = { 'Cache-Control': 's-maxage=10, stale-while-revalidate=60' };

export async function GET(req: NextRequest) {
  const t0    = Date.now();
  const reqId = createRequestId();

  const { searchParams } = new URL(req.url);
  const mode  = parseSignalMode(searchParams.get('mode'));
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200);

  // In-process memory cache (instance-local, 10 s).
  // Reduces repeated DB reads on hot polling cycles between pipeline runs.
  const memKey = `intelligence:signals:${mode}:${limit}`;
  const memCached = getCache<Record<string, unknown>>(memKey, MEM_TTL.INTELLIGENCE_SIGNALS);
  if (memCached) {
    logWithRequestId(reqId, 'intelligence/signals', `cache_hit source=memory mode=${mode} ms=${Date.now() - t0}`);
    return NextResponse.json(memCached, { headers: { ...CACHE_HEADERS, 'x-data-origin': 'cache' } });
  }

  try {
    const signals = await getSignals(limit, mode);
    const source = signals.length > 0 ? 'db' : 'empty';
    logWithRequestId(reqId, 'intelligence/signals', `cache_miss source=${source} mode=${mode} signals=${signals.length} ms=${Date.now() - t0}`);
    const payload = { ok: true, mode, signals, count: signals.length, source };
    // Only cache non-empty results; empty state should resolve quickly once the
    // pipeline runs, so we don't want to lock callers into a stale empty view.
    if (signals.length > 0) setCache(memKey, payload, MEM_TTL.INTELLIGENCE_SIGNALS);
    return NextResponse.json(payload, { headers: { ...CACHE_HEADERS, 'x-data-origin': source } });
  } catch (err) {
    console.error('[api/intelligence/signals] DB error:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to fetch signals', signals: [] },
      { status: 503, headers: { 'x-data-origin': 'error' } },
    );
  }
}
