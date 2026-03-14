export const runtime = 'nodejs';
/**
 * Omterminal — Unified Search API
 *
 * Searches across entities, signals, events, and trends, returning
 * grouped, structured results suitable for the command palette.
 *
 * GET /api/search?q=<query>&limit=<number>
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbQuery, tableExists } from '@/db/client';

// ─────────────────────────────────────────────────────────────────────────────
// Result types
// ─────────────────────────────────────────────────────────────────────────────

interface SearchResult {
  type: 'entity' | 'signal' | 'trend' | 'event' | 'action';
  label: string;
  subtitle: string;
  href: string;
  metadata?: Record<string, string | number>;
}

interface SearchResponse {
  ok: boolean;
  query: string;
  entities: SearchResult[];
  signals: SearchResult[];
  trends: SearchResult[];
  events: SearchResult[];
  actions: SearchResult[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Static actions
// ─────────────────────────────────────────────────────────────────────────────

const STATIC_ACTIONS: SearchResult[] = [
  { type: 'action', label: 'Open Watchlist', subtitle: 'Track your watched entities', href: '/watchlist' },
  { type: 'action', label: 'Open Alerts', subtitle: 'View intelligence alerts', href: '/dashboard' },
  { type: 'action', label: 'Intelligence Feed', subtitle: 'Browse latest signals', href: '/intelligence' },
  { type: 'action', label: 'Compare Entities', subtitle: 'Side-by-side entity analysis', href: '/compare' },
  { type: 'action', label: 'Emerging Trends', subtitle: 'View trending clusters', href: '/trend' },
  { type: 'action', label: 'Events Timeline', subtitle: 'Browse ecosystem events', href: '/events' },
  { type: 'action', label: 'Entity Directory', subtitle: 'Browse all entities', href: '/entity' },
];

function filterActions(q: string): SearchResult[] {
  const lower = q.toLowerCase();
  return STATIC_ACTIONS.filter(
    (a) =>
      a.label.toLowerCase().includes(lower) ||
      a.subtitle.toLowerCase().includes(lower),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Slugify (mirrors the app's slugify util)
// ─────────────────────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// ─────────────────────────────────────────────────────────────────────────────
// DB search helpers
// ─────────────────────────────────────────────────────────────────────────────

async function searchEntities(q: string, limit: number): Promise<SearchResult[]> {
  try {
    const hasTable = await tableExists('entities');
    if (!hasTable) return [];

    const pattern = `%${q}%`;
    const rows = await dbQuery<{
      name: string;
      sector: string | null;
      country: string | null;
      risk_level: string | null;
    }>`
      SELECT name, sector, country, risk_level
      FROM entities
      WHERE name ILIKE ${pattern}
         OR sector ILIKE ${pattern}
         OR description ILIKE ${pattern}
      ORDER BY
        CASE WHEN LOWER(name) = LOWER(${q}) THEN 0
             WHEN LOWER(name) LIKE LOWER(${q}) || '%' THEN 1
             ELSE 2
        END,
        name ASC
      LIMIT ${limit}
    `;

    return rows.map((r) => ({
      type: 'entity' as const,
      label: r.name,
      subtitle: [r.sector, r.country].filter(Boolean).join(' · ') || 'Entity',
      href: `/entity/${slugify(r.name)}`,
      metadata: r.risk_level ? { risk: r.risk_level } : undefined,
    }));
  } catch {
    return [];
  }
}

async function searchSignals(q: string, limit: number): Promise<SearchResult[]> {
  try {
    const hasTable = await tableExists('signals');
    if (!hasTable) return [];

    const pattern = `%${q}%`;
    const rows = await dbQuery<{
      id: string;
      title: string;
      entity_name: string | null;
      category: string | null;
      confidence: number | null;
      significance_score: number | null;
    }>`
      SELECT id, title, entity_name, category, confidence, significance_score
      FROM signals
      WHERE (title ILIKE ${pattern} OR entity_name ILIKE ${pattern} OR description ILIKE ${pattern})
        AND (status IS NULL OR status NOT IN ('rejected'))
      ORDER BY
        CASE WHEN LOWER(title) LIKE LOWER(${q}) || '%' THEN 0 ELSE 1 END,
        significance_score DESC NULLS LAST,
        created_at DESC
      LIMIT ${limit}
    `;

    return rows.map((r) => ({
      type: 'signal' as const,
      label: r.title,
      subtitle: [r.category, r.entity_name].filter(Boolean).join(' · ') || 'Signal',
      href: `/signals/${r.id}`,
      metadata: {
        ...(r.confidence != null ? { confidence: r.confidence } : {}),
        ...(r.significance_score != null ? { significance: r.significance_score } : {}),
      },
    }));
  } catch {
    return [];
  }
}

async function searchTrends(q: string, limit: number): Promise<SearchResult[]> {
  try {
    const hasTable = await tableExists('trends');
    if (!hasTable) return [];

    const pattern = `%${q}%`;
    const rows = await dbQuery<{
      topic: string;
      category: string;
      signal_count: number;
      summary: string;
      importance_score: number | null;
      velocity_score: number | null;
    }>`
      SELECT topic, category, signal_count, summary, importance_score, velocity_score
      FROM trends
      WHERE topic ILIKE ${pattern}
         OR category ILIKE ${pattern}
         OR summary ILIKE ${pattern}
      ORDER BY
        CASE WHEN LOWER(topic) LIKE LOWER(${q}) || '%' THEN 0 ELSE 1 END,
        importance_score DESC NULLS LAST
      LIMIT ${limit}
    `;

    return rows.map((r) => ({
      type: 'trend' as const,
      label: r.topic,
      subtitle: `${r.category} · ${r.signal_count} signals`,
      href: `/trend/${slugify(r.topic)}`,
      metadata: {
        signalCount: r.signal_count,
        ...(r.importance_score != null ? { importance: r.importance_score } : {}),
        ...(r.velocity_score != null ? { velocity: r.velocity_score } : {}),
      },
    }));
  } catch {
    return [];
  }
}

async function searchEvents(q: string, limit: number): Promise<SearchResult[]> {
  try {
    const hasTable = await tableExists('events');
    if (!hasTable) return [];

    const pattern = `%${q}%`;
    const rows = await dbQuery<{
      id: string;
      title: string;
      type: string;
      entity_name: string | null;
      timestamp: string;
    }>`
      SELECT id, title, type, entity_name, timestamp
      FROM events
      WHERE title ILIKE ${pattern}
         OR entity_name ILIKE ${pattern}
         OR description ILIKE ${pattern}
      ORDER BY
        CASE WHEN LOWER(title) LIKE LOWER(${q}) || '%' THEN 0 ELSE 1 END,
        timestamp DESC
      LIMIT ${limit}
    `;

    return rows.map((r) => ({
      type: 'event' as const,
      label: r.title,
      subtitle: [r.type, r.entity_name].filter(Boolean).join(' · ') || 'Event',
      href: `/events/${r.id}`,
      metadata: { date: r.timestamp?.slice(0, 10) ?? '' },
    }));
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') ?? '').trim();
  const perGroup = Math.min(parseInt(searchParams.get('limit') ?? '5', 10), 20);

  if (!q) {
    // Return default suggestions when query is empty
    return NextResponse.json({
      ok: true,
      query: '',
      entities: [],
      signals: [],
      trends: [],
      events: [],
      actions: STATIC_ACTIONS,
    } satisfies SearchResponse);
  }

  // Run all searches in parallel for speed
  const [entities, signals, trends, events] = await Promise.all([
    searchEntities(q, perGroup),
    searchSignals(q, perGroup),
    searchTrends(q, perGroup),
    searchEvents(q, perGroup),
  ]);

  const actions = filterActions(q);

  return NextResponse.json({
    ok: true,
    query: q,
    entities,
    signals,
    trends,
    events,
    actions,
  } satisfies SearchResponse, {
    headers: { 'Cache-Control': 's-maxage=5, stale-while-revalidate=30' },
  });
}
