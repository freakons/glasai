export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { getSignals } from '@/db/queries';
import { createRequestId, logWithRequestId } from '@/lib/requestId';

export async function GET() {
  const t0 = Date.now();
  const reqId = createRequestId();
  const signals = await getSignals(50);
  logWithRequestId(reqId, 'intelligence/signals', `signals=${signals.length} ms=${Date.now() - t0}`);
  return NextResponse.json(
    { signals },
    { headers: { 'Cache-Control': 's-maxage=5, stale-while-revalidate=30' } },
  );
}
