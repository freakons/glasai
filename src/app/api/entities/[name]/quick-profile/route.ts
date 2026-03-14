export const runtime = 'nodejs';

/**
 * Entity Quick Profile API
 *
 * Lightweight endpoint returning only the data needed for the
 * EntityQuickProfile popover card.
 *
 * GET /api/entities/[name]/quick-profile
 *   Returns { entity, signals7d, eventsTotal, avgConfidence, latestSignal }
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbQuery } from '@/db/client';
import { slugify } from '@/utils/sanitize';

interface EntityRow {
  name: string;
  sector: string | null;
  country: string | null;
}

interface MetricsRow {
  signals_7d: string;
  avg_confidence: string | null;
}

interface EventCountRow {
  count: string;
}

interface LatestSignalRow {
  title: string;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const entityName = decodeURIComponent(name);

  try {
    // 1. Find entity by case-insensitive name or slug
    let [entity] = await dbQuery<EntityRow>`
      SELECT name, sector, country
      FROM entities
      WHERE LOWER(name) = LOWER(${entityName})
      LIMIT 1
    `;

    if (!entity) {
      const slug = slugify(entityName);
      [entity] = await dbQuery<EntityRow>`
        SELECT name, sector, country
        FROM entities
        WHERE trim(both '-' from lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))) = ${slug}
        LIMIT 1
      `;
    }

    if (!entity) {
      return NextResponse.json({ ok: false, error: 'Entity not found' }, { status: 404 });
    }

    // 2. Signal metrics (7d count + avg confidence) — single query
    const [metrics] = await dbQuery<MetricsRow>`
      SELECT
        COUNT(*) FILTER (WHERE s.created_at > NOW() - INTERVAL '7 days')::text AS signals_7d,
        AVG(COALESCE(s.confidence, 50))::numeric(5,1)::text AS avg_confidence
      FROM signals s
      JOIN signal_entities se ON se.signal_id = s.id
      JOIN entities e ON e.id = se.entity_id
      WHERE e.name = ${entity.name}
    `;

    // 3. Event count
    const [evtRow] = await dbQuery<EventCountRow>`
      SELECT COUNT(*)::text AS count
      FROM events
      WHERE entity_name = ${entity.name}
    `;

    // 4. Latest signal title
    const [latest] = await dbQuery<LatestSignalRow>`
      SELECT s.title
      FROM signals s
      JOIN signal_entities se ON se.signal_id = s.id
      JOIN entities e ON e.id = se.entity_id
      WHERE e.name = ${entity.name}
      ORDER BY s.created_at DESC
      LIMIT 1
    `;

    return NextResponse.json({
      ok: true,
      name: entity.name,
      sector: entity.sector,
      country: entity.country,
      signals7d: parseInt(metrics?.signals_7d ?? '0', 10),
      eventsTotal: parseInt(evtRow?.count ?? '0', 10),
      avgConfidence: metrics?.avg_confidence != null ? parseFloat(metrics.avg_confidence) : 0,
      latestSignal: latest?.title ?? null,
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'Failed to fetch profile' }, { status: 500 });
  }
}
