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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200);

  try {
    const dbEntities = await getEntities(limit);

    // If the database returned data, serve it
    if (dbEntities.length > 0) {
      return NextResponse.json({
        ok:       true,
        source:   'db',
        entities: dbEntities,
        count:    dbEntities.length,
      });
    }

    // Empty DB — fall back to mock data
    const entities = MOCK_ENTITIES.slice(0, limit);
    return NextResponse.json({
      ok:       true,
      source:   'mock',
      entities,
      count:    entities.length,
    });
  } catch (err) {
    console.error('[api/entities] error:', err);

    // Error path — return mock data so the UI is never broken
    const entities = MOCK_ENTITIES.slice(0, limit);
    return NextResponse.json({
      ok:       true,
      source:   'mock',
      entities,
      count:    entities.length,
    });
  }
}
