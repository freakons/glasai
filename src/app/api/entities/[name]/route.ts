export const runtime = 'nodejs';
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
import {
  deriveImportanceLabel,
  deriveCorroborationLabel,
  deriveConfidenceLabel,
} from '@/lib/signals/explanationLayer';
import { slugify } from '@/utils/sanitize';

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
  significance_score: number | null;
  trust_score: number | null;
  created_at: string;
}

interface RelatedEntityRow {
  name: string;
  type: string;
  mentions: string;
}

interface CountRow {
  count: string;
}

interface AvgRow {
  avg: string | null;
}

interface SourceCountRow {
  distinct_sources: string;
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

  // 1. Fetch the entity record — exact name first, then slug fallback
  let [entity] = await dbQuery<EntityRow>`
    SELECT
      id, name, type, description, sector, country,
      founded, website, risk_level, tags, financial_scale, created_at
    FROM entities
    WHERE name = ${entityName}
    LIMIT 1
  `;

  if (!entity) {
    const slug = slugify(entityName);
    [entity] = await dbQuery<EntityRow>`
      SELECT
        id, name, type, description, sector, country,
        founded, website, risk_level, tags, financial_scale, created_at
      FROM entities
      WHERE trim(both '-' from lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))) = ${slug}
      LIMIT 1
    `;
  }

  if (!entity) {
    return NextResponse.json({ ok: false, error: 'Entity not found' }, { status: 404 });
  }

  // 2. Fetch recent signals for this entity (last 20), including significance
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
      s.significance_score,
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

  // 3b. 30-day signal count
  const [row30d] = await dbQuery<CountRow>`
    SELECT COUNT(*) AS count
    FROM signals s
    JOIN signal_entities se ON se.signal_id = s.id
    JOIN entities e ON e.id = se.entity_id
    WHERE e.name = ${entityName}
      AND s.created_at > NOW() - INTERVAL '30 days'
  `;

  const count24h = parseInt(row24h?.count ?? '0', 10);
  const count7d  = parseInt(row7d?.count  ?? '0', 10);
  const count30d = parseInt(row30d?.count ?? '0', 10);

  /** Velocity = weighted combination of 24 h and 7 d density, normalized 0–100 */
  const VELOCITY_SATURATION = 100;
  const rawVelocity = (count24h * 0.6) + ((count7d / 7) * 0.4);
  const velocity_score = Math.min((rawVelocity / VELOCITY_SATURATION) * 100, 100);

  const avg_importance_score = avgRow?.avg != null ? parseFloat(avgRow.avg) : 0;

  // Compute trend direction based on 7d vs prior 7d within 30d window
  const prior7d = count30d - count7d;
  const trend: 'rising' | 'falling' | 'stable' =
    count7d > prior7d * 1.2 ? 'rising' :
    count7d < prior7d * 0.8 ? 'falling' : 'stable';

  // 4. Fetch co-occurring entities (with type for categorization)
  const relatedEntities = await dbQuery<RelatedEntityRow>`
    SELECT e2.name, e2.type, COUNT(*) AS mentions
    FROM signal_entities se
    JOIN entities e1 ON e1.id = se.entity_id
    JOIN signal_entities se2 ON se2.signal_id = se.signal_id
    JOIN entities e2 ON e2.id = se2.entity_id
    WHERE e1.name = ${entityName}
      AND e2.name != ${entityName}
    GROUP BY e2.name, e2.type
    ORDER BY mentions DESC
    LIMIT 10
  `;

  // 5. Recent events for this entity
  interface EventRow {
    id: string;
    type: string;
    title: string;
    description: string;
    entity_name: string | null;
    amount: string | null;
    timestamp: string;
  }

  const recentEvents = await dbQuery<EventRow>`
    SELECT id, type, title, description, entity_name, amount, timestamp
    FROM events
    WHERE entity_name = ${entityName}
    ORDER BY timestamp DESC
    LIMIT 15
  `;

  // 6. Major developments — top 5 signals by significance score
  const majorDevelopments = await dbQuery<SignalRow>`
    SELECT
      s.id, s.title, s.summary, s.description,
      s.category, s.signal_type, s.confidence, s.confidence_score,
      s.intelligence_score, s.significance_score, s.trust_score, s.created_at
    FROM signals s
    JOIN signal_entities se ON se.signal_id = s.id
    JOIN entities e ON e.id = se.entity_id
    WHERE e.name = ${entityName}
      AND s.significance_score IS NOT NULL
    ORDER BY s.significance_score DESC, s.created_at DESC
    LIMIT 5
  `;

  // 6. Source coverage — count distinct source_support_count entries
  const [sourceCoverage] = await dbQuery<SourceCountRow>`
    SELECT COUNT(DISTINCT s.source_support_count) AS distinct_sources
    FROM signals s
    JOIN signal_entities se ON se.signal_id = s.id
    JOIN entities e ON e.id = se.entity_id
    WHERE e.name = ${entityName}
      AND s.source_support_count IS NOT NULL
      AND s.source_support_count > 0
  `;

  // 7. First seen date — earliest signal for this entity
  const [firstSeenRow] = await dbQuery<{ first_seen: string }>`
    SELECT MIN(s.created_at) AS first_seen
    FROM signals s
    JOIN signal_entities se ON se.signal_id = s.id
    JOIN entities e ON e.id = se.entity_id
    WHERE e.name = ${entityName}
  `;

  // 8. Last activity — most recent signal for this entity
  const [lastActivityRow] = await dbQuery<{ last_activity: string }>`
    SELECT MAX(s.created_at) AS last_activity
    FROM signals s
    JOIN signal_entities se ON se.signal_id = s.id
    JOIN entities e ON e.id = se.entity_id
    WHERE e.name = ${entityName}
  `;

  return NextResponse.json({
    ok: true,
    entity: {
      ...entity,
      first_seen: firstSeenRow?.first_seen ?? null,
      last_activity: lastActivityRow?.last_activity ?? null,
    },
    metrics: {
      signals_last_24h:     count24h,
      signals_last_7d:      count7d,
      signals_last_30d:     count30d,
      avg_importance_score: Math.round(avg_importance_score * 100) / 100,
      velocity_score:       Math.round(velocity_score * 100) / 100,
      trend,
    },
    related_entities: relatedEntities.map((r) => ({
      name:     r.name,
      type:     r.type,
      mentions: parseInt(r.mentions, 10),
    })),
    recent_signals: recentSignals.map((s) => ({
      ...s,
      importanceLabel: deriveImportanceLabel(s.significance_score),
      corroborationLabel: deriveCorroborationLabel(null),
      confidenceLabel: deriveConfidenceLabel(
        s.confidence ?? (s.confidence_score ? Math.round(parseFloat(s.confidence_score) * 100) : null),
      ),
    })),
    major_developments: majorDevelopments.map((s) => ({
      ...s,
      importanceLabel: deriveImportanceLabel(s.significance_score),
      confidenceLabel: deriveConfidenceLabel(
        s.confidence ?? (s.confidence_score ? Math.round(parseFloat(s.confidence_score) * 100) : null),
      ),
    })),
    recent_events: recentEvents.map((e) => ({
      id: e.id,
      type: e.type,
      title: e.title,
      description: e.description,
      entity_name: e.entity_name,
      amount: e.amount,
      date: typeof e.timestamp === 'string'
        ? e.timestamp.slice(0, 10)
        : new Date(e.timestamp).toISOString().slice(0, 10),
    })),
    source_coverage: parseInt(sourceCoverage?.distinct_sources ?? '0', 10),
  });
}
