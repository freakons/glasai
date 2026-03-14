export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getSignalsForEntities } from '@/db/queries';

const CACHE_HEADERS = { 'Cache-Control': 's-maxage=10, stale-while-revalidate=60' };

/**
 * GET /api/watchlist/signals?entities=OpenAI,Anthropic,Google&limit=30
 *
 * Accepts a comma-separated list of entity names (from client-side watchlist)
 * and returns recent deduplicated signals for those entities.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const entitiesParam = searchParams.get('entities') ?? '';
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '30', 10), 100);

  const entityNames = entitiesParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (entityNames.length === 0) {
    return NextResponse.json(
      { ok: true, signals: [], count: 0, source: 'empty' },
      { headers: CACHE_HEADERS },
    );
  }

  try {
    const signals = await getSignalsForEntities(entityNames, limit);
    const source = signals.length > 0 ? 'db' : 'empty';
    return NextResponse.json(
      { ok: true, signals, count: signals.length, source },
      { headers: { ...CACHE_HEADERS, 'x-data-origin': source } },
    );
  } catch (err) {
    console.error('[api/watchlist/signals] error:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to fetch watchlist signals', signals: [] },
      { status: 503, headers: { 'x-data-origin': 'error' } },
    );
  }
}
