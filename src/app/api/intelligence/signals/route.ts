export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getSignals } from '@/db/queries';
import { createRequestId, logWithRequestId } from '@/lib/requestId';
import { parseSignalMode } from '@/lib/signals/signalModes';

// s-maxage=10 keeps CDN copies fresh; stale-while-revalidate extends TTL gracefully
const CACHE_HEADERS = { 'Cache-Control': 's-maxage=10, stale-while-revalidate=60' };

export async function GET(req: NextRequest) {
  const t0    = Date.now();
  const reqId = createRequestId();

  const { searchParams } = new URL(req.url);
  const mode  = parseSignalMode(searchParams.get('mode'));
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200);

  try {
    const signals = await getSignals(limit, mode);
    logWithRequestId(reqId, 'intelligence/signals', `mode=${mode} signals=${signals.length} ms=${Date.now() - t0}`);
    const source = signals.length > 0 ? 'db' : 'empty';
    return NextResponse.json(
      {
        ok: true,
        mode,
        signals,
        count: signals.length,
        source,
      },
      { headers: { ...CACHE_HEADERS, 'x-data-origin': source } },
    );
  } catch (err) {
    console.error('[api/intelligence/signals] DB error:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to fetch signals', signals: [] },
      { status: 503, headers: { 'x-data-origin': 'error' } },
    );
  }
}
