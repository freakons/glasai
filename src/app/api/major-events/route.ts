export const runtime = 'nodejs';
/**
 * Omterminal — Major Events API Route
 *
 * Detects and returns major AI ecosystem events by analyzing clusters of
 * related signals.  This is a read-only endpoint that computes events on
 * demand from the signal pool.
 *
 * GET /api/major-events
 *   Returns detected major events ranked by importance.
 *
 * Query params:
 *   limit          — max events to return (default 20, max 50)
 *   minImportance  — minimum importance score threshold (default 40, range 0–100)
 *   category       — filter by event category (e.g. "model_launch", "funding_round")
 *
 * Response:
 *   { ok, source, events, count, config }
 *
 * Backward compatibility: this is a new endpoint; existing /api/events and
 * /api/signals routes are unchanged.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSignals } from '@/db/queries';
import { MOCK_SIGNALS } from '@/data/mockSignals';
import { detectMajorEvents, type MajorEvent, type MajorEventCategory } from '@/lib/signals/eventDetector';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const VALID_CATEGORIES: Set<string> = new Set([
  'model_launch',
  'funding_round',
  'regulation',
  'acquisition',
  'partnership',
  'research_breakthrough',
  'product_launch',
  'other',
]);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 50);
  const minImportance = Math.min(
    Math.max(parseInt(searchParams.get('minImportance') ?? '40', 10), 0),
    100,
  );
  const categoryFilter = searchParams.get('category') ?? '';

  // Validate category filter
  if (categoryFilter && !VALID_CATEGORIES.has(categoryFilter)) {
    return NextResponse.json(
      {
        ok: false,
        error: `Invalid category "${categoryFilter}". Valid: ${[...VALID_CATEGORIES].join(', ')}`,
      },
      { status: 400 },
    );
  }

  try {
    // Try to get signals from DB first
    let signals: Array<{
      id: string;
      title: string;
      category: string;
      entityId: string;
      entityName: string;
      summary: string;
      date: string;
      confidence: number;
      significanceScore?: number | null;
      sourceSupportCount?: number | null;
    }> = [];
    let source: 'db' | 'mock' | 'empty' = 'empty';

    try {
      const dbSignals = await getSignals(200);
      if (dbSignals.length > 0) {
        // Map DB signals to the Signal shape expected by the detector
        signals = dbSignals.map((s: Record<string, unknown>) => ({
          id: String(s.id ?? ''),
          title: String(s.title ?? ''),
          category: String(s.category ?? 'research'),
          entityId: String(s.entityId ?? s.entity_id ?? ''),
          entityName: String(s.entityName ?? s.entity_name ?? ''),
          summary: String(s.summary ?? s.description ?? ''),
          date: String(s.date ?? s.createdAt ?? s.created_at ?? ''),
          confidence: Number(s.confidence ?? s.confidenceScore ?? s.confidence_score ?? 50),
          significanceScore: s.significanceScore != null ? Number(s.significanceScore)
            : s.significance_score != null ? Number(s.significance_score)
            : null,
          sourceSupportCount: s.sourceSupportCount != null ? Number(s.sourceSupportCount)
            : s.source_support_count != null ? Number(s.source_support_count)
            : null,
        }));
        source = 'db';
      }
    } catch {
      // DB unavailable — will fall back below
    }

    // Development fallback: use mock signals
    if (signals.length === 0 && !IS_PRODUCTION) {
      signals = MOCK_SIGNALS;
      source = 'mock';
    }

    if (signals.length === 0) {
      return NextResponse.json({
        ok: true,
        source: 'empty',
        events: [],
        count: 0,
        message: 'No signals available for event detection. Run /api/ingest to populate.',
      });
    }

    // Run event detection
    const allEvents = detectMajorEvents(signals, {
      minImportanceScore: minImportance,
      maxEvents: limit,
    });

    // Apply category filter if specified
    let events: MajorEvent[] = allEvents;
    if (categoryFilter) {
      events = allEvents.filter(e => e.category === categoryFilter);
    }

    return NextResponse.json({
      ok: true,
      source,
      events,
      count: events.length,
      config: {
        limit,
        minImportance,
        categoryFilter: categoryFilter || null,
        signalsAnalyzed: signals.length,
      },
    });
  } catch (err) {
    console.error('[api/major-events] error:', err);
    return NextResponse.json(
      {
        ok: false,
        source: 'error',
        error: IS_PRODUCTION ? 'event detection failed' : String(err),
        events: [],
      },
      { status: 500 },
    );
  }
}
