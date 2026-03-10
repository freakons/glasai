export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { getSignals } from '@/db/queries';
import { createRequestId, logWithRequestId } from '@/lib/requestId';

// s-maxage=10 keeps CDN copies fresh; stale-while-revalidate extends TTL gracefully
const CACHE_HEADERS = { 'Cache-Control': 's-maxage=10, stale-while-revalidate=60' };

export async function GET() {
  const t0    = Date.now();
  const reqId = createRequestId();

  try {
    const signals = await getSignals(50);
    logWithRequestId(reqId, 'intelligence/signals', `signals=${signals.length} ms=${Date.now() - t0}`);
    const source = signals.length > 0 ? 'db' : 'empty';
    return NextResponse.json(
      {
        ok: true,
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
