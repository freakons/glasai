/**
 * Omterminal — Events API Route
 *
 * Returns AI ecosystem events in the frontend AiEvent format.
 * Falls back to mock data when the database is unavailable or empty.
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
      });
    }

    // Empty DB — fall back to mock data
    const events = MOCK_EVENTS.slice(0, limit);
    return NextResponse.json({
      ok:     true,
      source: 'mock',
      events,
      count:  events.length,
    });
  } catch (err) {
    console.error('[api/events] error:', err);

    // Error path — return mock data so the UI is never broken
    const events = MOCK_EVENTS.slice(0, limit);
    return NextResponse.json({
      ok:     true,
      source: 'mock',
      events,
      count:  events.length,
    });
  }
}
