/**
 * Omterminal — Entity Intelligence API
 *
 * Returns intelligence data about a specific entity by name.
 *
 * GET /api/entities/[name]
 *   Returns { entity, metrics, related_entities, recent_signals }
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbQuery } from '@/db/client';

// ─────────────────────────────────────────────────────────────────────────────
// Row types
// ─────────────────────────────────────────────────────────────────────────────

interface EntityRow {
  id: string;
  name: string;
  type: string;
  description: string;
  sector: string | null;
  country: string | null;
  founded: number | null;
  website: string | null;
  risk_level: string | null;
  tags: string[] | null;
  financial_scale: string | null;
  created_at: string;
}

interface SignalRow {
  id: string;
  title: string;
  summary: string | null;
  description: string;
  category: string | null;
  signal_type: string | null;
  confidence: number | null;
  confidence_score: string | null;
  intelligence_score: number | null;
  trust_score: number | null;
  created_at: string;
}

interface RelatedEntityRow {
  name: string;
  mentions: string;
}

interface CountRow {
  count: string;
}

interface AvgRow {
  avg: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const entityName = decodeURIComponent(name);

  // 1. Fetch the entity record
  const [entity] = await dbQuery<EntityRow>`
    SELECT
      id, name, type, description, sector, country,
      founded, website, risk_level, tags, financial_scale, created_at
    FROM entities
    WHERE name = ${entityName}
    LIMIT 1
  `;

  if (!entity) {
    return NextResponse.json({ ok: false, error: 'Entity not found' }, { status: 404 });
  }

  // 2. Fetch recent signals for this entity (last 20)
  const recentSignals = await dbQuery<SignalRow>`
    SELECT
      s.id,
      s.title,
      s.summary,
      s.description,
      s.category,
      s.signal_type,
      s.confidence,
      s.confidence_score,
      s.intelligence_score,
      s.trust_score,
      s.created_at
    FROM signals s
    JOIN signal_entities se ON se.signal_id = s.id
    JOIN entities e ON e.id = se.entity_id
    WHERE e.name = ${entityName}
    ORDER BY s.created_at DESC
    LIMIT 20
  `;

  // 3. Compute metrics via targeted DB queries
  const [row24h] = await dbQuery<CountRow>`
    SELECT COUNT(*) AS count
    FROM signals s
    JOIN signal_entities se ON se.signal_id = s.id
    JOIN entities e ON e.id = se.entity_id
    WHERE e.name = ${entityName}
      AND s.created_at > NOW() - INTERVAL '24 hours'
  `;

  const [row7d] = await dbQuery<CountRow>`
    SELECT COUNT(*) AS count
    FROM signals s
    JOIN signal_entities se ON se.signal_id = s.id
    JOIN entities e ON e.id = se.entity_id
    WHERE e.name = ${entityName}
      AND s.created_at > NOW() - INTERVAL '7 days'
  `;

  const [avgRow] = await dbQuery<AvgRow>`
    SELECT AVG(
      COALESCE(s.intelligence_score, s.confidence, 50)
    )::numeric(5,2) AS avg
    FROM signals s
    JOIN signal_entities se ON se.signal_id = s.id
    JOIN entities e ON e.id = se.entity_id
    WHERE e.name = ${entityName}
  `;

  const count24h = parseInt(row24h?.count ?? '0', 10);
  const count7d  = parseInt(row7d?.count  ?? '0', 10);

  /** Velocity = weighted combination of 24 h and 7 d density, normalized 0–100 */
  const VELOCITY_SATURATION = 100;
  const rawVelocity = (count24h * 0.6) + ((count7d / 7) * 0.4);
  const velocity_score = Math.min((rawVelocity / VELOCITY_SATURATION) * 100, 100);

  const avg_importance_score = avgRow?.avg != null ? parseFloat(avgRow.avg) : 0;

  // 4. Fetch co-occurring entities
  const relatedEntities = await dbQuery<RelatedEntityRow>`
    SELECT e2.name, COUNT(*) AS mentions
    FROM signal_entities se
    JOIN entities e1 ON e1.id = se.entity_id
    JOIN signal_entities se2 ON se2.signal_id = se.signal_id
    JOIN entities e2 ON e2.id = se2.entity_id
    WHERE e1.name = ${entityName}
      AND e2.name != ${entityName}
    GROUP BY e2.name
    ORDER BY mentions DESC
    LIMIT 10
  `;

  return NextResponse.json({
    ok: true,
    entity,
    metrics: {
      signals_last_24h:     count24h,
      signals_last_7d:      count7d,
      avg_importance_score: Math.round(avg_importance_score * 100) / 100,
      velocity_score:       Math.round(velocity_score * 100) / 100,
    },
    related_entities: relatedEntities.map((r) => ({
      name:     r.name,
      mentions: parseInt(r.mentions, 10),
    })),
    recent_signals: recentSignals,
  });
}
