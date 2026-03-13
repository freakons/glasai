export const runtime = 'nodejs';
/**
 * Omterminal — Graph Relationships API Route
 *
 * Returns signal-driven entity relationships and the weighted graph.
 * Falls back to mock data when the database is unavailable or empty.
 *
 * GET /api/graph/relationships
 *   Returns all entity relationships with strength scores, shared signal
 *   counts, recency data, and the full weighted graph.
 *
 * Query params:
 *   entity  — optional entity ID to filter connections for a single entity
 *   min     — minimum relationship strength to include (default 1, range 0–100)
 *   limit   — max entities to load (default 50, max 200)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getEntities, getEvents, getSignals } from '@/db/queries';
import { MOCK_ENTITIES } from '@/data/mockEntities';
import { MOCK_EVENTS } from '@/data/mockEvents';
import { MOCK_SIGNALS } from '@/data/mockSignals';
import { buildIntelligentGraph } from '@/lib/graphUtils';
import { getEntityConnections } from '@/lib/relationshipIntelligence';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const entityFilter = searchParams.get('entity') ?? undefined;
  const minStrength = Math.max(0, Math.min(100,
    parseInt(searchParams.get('min') ?? '1', 10) || 1,
  ));
  const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)), 200);

  try {
    // Attempt to load from DB
    const [dbEntities, dbEvents, dbSignals] = await Promise.all([
      getEntities(limit),
      getEvents(200),
      getSignals(200),
    ]);

    const hasDbData = dbEntities.length > 0;

    // Use DB data or fall back to mocks
    const entities = hasDbData ? dbEntities : (IS_PRODUCTION ? [] : MOCK_ENTITIES.slice(0, limit));
    const events   = hasDbData ? dbEvents   : (IS_PRODUCTION ? [] : MOCK_EVENTS);
    const signals  = hasDbData ? dbSignals  : (IS_PRODUCTION ? [] : MOCK_SIGNALS);
    const source   = hasDbData ? 'db' : (IS_PRODUCTION ? 'empty' : 'mock');

    if (entities.length === 0) {
      return NextResponse.json({
        ok: true,
        source,
        graph: { nodes: [], links: [] },
        relationships: [],
        count: 0,
      }, { headers: { 'x-data-origin': source } });
    }

    // Adapt mock signals to match the shape expected by relationship engine
    // (mock Signal uses entityId/entityName, DB Signal uses the same via rowToSignal)
    const adaptedSignals = signals.map(s => ({
      ...s,
      entityId: s.entityId ?? s.id,
    }));

    const { graph, relationships } = buildIntelligentGraph({
      entities,
      events,
      signals: adaptedSignals,
      minStrength,
    });

    // If entity filter is specified, return connection profile
    if (entityFilter) {
      const nameMap = new Map(entities.map(e => [e.id, e.name]));
      const profile = getEntityConnections(entityFilter, relationships, nameMap);

      return NextResponse.json({
        ok: true,
        source,
        entity: profile,
        count: profile.connectionCount,
      }, { headers: { 'x-data-origin': source } });
    }

    return NextResponse.json({
      ok: true,
      source,
      graph,
      relationships,
      count: relationships.length,
    }, { headers: { 'x-data-origin': source } });

  } catch (err) {
    console.error('[api/graph/relationships] error:', err);

    if (IS_PRODUCTION) {
      return NextResponse.json(
        { ok: false, source: 'error', error: 'graph relationships query failed' },
        { status: 503, headers: { 'x-data-origin': 'error' } },
      );
    }

    // Dev fallback: compute from mock data
    const { graph, relationships } = buildIntelligentGraph({
      entities: MOCK_ENTITIES,
      events: MOCK_EVENTS,
      signals: MOCK_SIGNALS,
      minStrength,
    });

    return NextResponse.json({
      ok: true,
      source: 'mock',
      graph,
      relationships,
      count: relationships.length,
    }, { headers: { 'x-data-origin': 'mock' } });
  }
}
