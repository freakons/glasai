export const runtime = 'nodejs';
/**
 * Omterminal — Events API Route
 *
 * Returns AI ecosystem events in the frontend AiEvent format.
 * In production, never falls back to mock data — callers receive an explicit
 * source indicator ('db' | 'empty' | 'mock') so the UI can show the right
 * empty state rather than silently serving fake data.
 *
 * GET /api/events
 *   Returns up to `limit` events (default 50).
 *
 * Query params:
 *   limit  — max number of events to return (default 50, max 500)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getEvents } from '@/db/queries';
import { MOCK_EVENTS } from '@/data/mockEvents';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 500);

  try {
    const dbEvents = await getEvents(limit);

    // If the database returned data, serve it
    if (dbEvents.length > 0) {
      return NextResponse.json({
        ok:     true,
        source: 'db',
        events: dbEvents,
        count:  dbEvents.length,
      }, { headers: { 'x-data-origin': 'db' } });
    }

    // Production: return explicit empty state — never mask a pipeline issue with mock data
    if (IS_PRODUCTION) {
      return NextResponse.json({
        ok:      true,
        source:  'empty',
        events:  [],
        count:   0,
        message: 'No events in database. Run /api/ingest to populate.',
      }, { headers: { 'x-data-origin': 'empty' } });
    }

    // Development: fall back to mock data so local work is unblocked
    const events = MOCK_EVENTS.slice(0, limit);
    return NextResponse.json({
      ok:     true,
      source: 'mock',
      events,
      count:  events.length,
    }, { headers: { 'x-data-origin': 'mock' } });
  } catch (err) {
    console.error('[api/events] error:', err);

    // Production: surface the error clearly instead of silently serving stale data
    if (IS_PRODUCTION) {
      return NextResponse.json(
        { ok: false, source: 'error', error: 'events query failed', events: [] },
        { status: 503, headers: { 'x-data-origin': 'error' } },
      );
    }

    // Development: fall back to mock data so local work is unblocked
    const events = MOCK_EVENTS.slice(0, limit);
    return NextResponse.json({
      ok:     true,
      source: 'mock',
      events,
      count:  events.length,
    }, { headers: { 'x-data-origin': 'mock' } });
  }
}
