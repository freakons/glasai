export const runtime = 'nodejs';
/**
 * Omterminal — Entities API Route
 *
 * Returns AI ecosystem entity profiles in the frontend EntityProfile format.
 * Falls back to mock data when the database is unavailable or empty.
 *
 * GET /api/entities
 *   Returns up to `limit` entities (default 50).
 *
 * Query params:
 *   limit  — max number of entities to return (default 50, max 200)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getEntities } from '@/db/queries';
import { MOCK_ENTITIES } from '@/data/mockEntities';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200);

  try {
    const dbEntities = await getEntities(limit);

    if (dbEntities.length > 0) {
      return NextResponse.json({
        ok:       true,
        source:   'db',
        entities: dbEntities,
        count:    dbEntities.length,
      }, { headers: { 'x-data-origin': 'db' } });
    }

    // Production: return explicit empty state — never mask a pipeline issue with mock data
    if (IS_PRODUCTION) {
      return NextResponse.json({
        ok:       true,
        source:   'empty',
        entities: [],
        count:    0,
        message:  'No entities in database. Run the ingestion pipeline to populate.',
      }, { headers: { 'x-data-origin': 'empty' } });
    }

    // Development: fall back to mock data so local work is unblocked
    const entities = MOCK_ENTITIES.slice(0, limit);
    return NextResponse.json({
      ok:       true,
      source:   'mock',
      entities,
      count:    entities.length,
    }, { headers: { 'x-data-origin': 'mock' } });
  } catch (err) {
    console.error('[api/entities] error:', err);

    if (IS_PRODUCTION) {
      return NextResponse.json(
        { ok: false, source: 'error', error: 'entities query failed', entities: [] },
        { status: 503, headers: { 'x-data-origin': 'error' } },
      );
    }

    const entities = MOCK_ENTITIES.slice(0, limit);
    return NextResponse.json({
      ok:       true,
      source:   'mock',
      entities,
      count:    entities.length,
    }, { headers: { 'x-data-origin': 'mock' } });
  }
}
