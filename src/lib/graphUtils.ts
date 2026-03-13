/**
 * graphUtils.ts — Graph data adapter for the Intelligence Graph.
 *
 * Maps live DB data (EntityProfile[], AiEvent[], Signal[]) into the
 * GraphData format (nodes + links) used by IntelligenceGraph.tsx.
 *
 * This module does NOT import from IntelligenceGraph — it only deals with
 * the shared types from src/data/mockGraph.ts.
 *
 * Usage (future):
 *   const entities = await fetchEntities();
 *   const events   = await fetchEvents();
 *   const signals  = await fetchSignals();
 *   const graph    = buildGraphData({ entities, events, signals });
 */

import type { GraphData, GraphNode, GraphLink } from '@/data/mockGraph';
import type { EntityProfile } from '@/data/mockEntities';
import type { AiEvent } from '@/data/mockEvents';
import type { Signal } from '@/data/mockSignals';
import { computeAllRelationships, type EntityRelationship } from '@/lib/relationshipIntelligence';

// ─────────────────────────────────────────────────────────────────────────────
// Input shape
// ─────────────────────────────────────────────────────────────────────────────

export interface GraphInput {
  entities?: EntityProfile[];
  events?: AiEvent[];
  signals?: Signal[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts live DB records into a GraphData object suitable for rendering.
 *
 * Node IDs:
 *   - entities → entity.id
 *   - events   → event.id
 *   - signals  → signal.id
 *
 * Link strategy:
 *   - event.entityId  → entity node (if present)
 *   - event.signalIds → signal nodes (if present)
 *   - signal.entityId → entity node (if present)
 */
export function buildGraphData({ entities = [], events = [], signals = [] }: GraphInput): GraphData {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];

  // Track which node IDs have been added to avoid duplicates
  const seen = new Set<string>();

  function addNode(node: GraphNode) {
    if (!seen.has(node.id)) {
      seen.add(node.id);
      nodes.push(node);
    }
  }

  // ── Entity nodes ──────────────────────────────────────────────────────────
  for (const e of entities) {
    addNode({ id: e.id, type: 'entity', label: e.name });
  }

  // ── Event nodes + links to entities ──────────────────────────────────────
  for (const ev of events) {
    addNode({ id: ev.id, type: 'event', label: ev.title });

    if (ev.entityId && seen.has(ev.entityId)) {
      links.push({ source: ev.entityId, target: ev.id });
    }

    // Link event → signals it belongs to
    if (ev.signalIds) {
      for (const sid of ev.signalIds) {
        links.push({ source: ev.id, target: sid });
      }
    }
  }

  // ── Signal nodes + links to entities ─────────────────────────────────────
  for (const sig of signals) {
    addNode({ id: sig.id, type: 'signal', label: sig.title });

    if (sig.entityId && seen.has(sig.entityId)) {
      links.push({ source: sig.entityId, target: sig.id });
    }
  }

  // Remove links where either endpoint has no node (referential safety)
  const validLinks = links.filter(l => seen.has(l.source) && seen.has(l.target));

  return { nodes, links: validLinks };
}

// ─────────────────────────────────────────────────────────────────────────────
// Entity-only convenience (used by IntelligenceGraph's buildGraphFromEntities)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lightweight variant that builds a graph from entities alone.
 * Entities sharing the same `sector` are linked together.
 */
export function buildGraphFromEntities(entities: EntityProfile[]): GraphData {
  const nodes: GraphNode[] = entities.map(e => ({
    id: e.id,
    type: 'entity' as const,
    label: e.name,
  }));

  const links: GraphLink[] = [];
  // Group by sector and link co-sector entities
  const bySector = new Map<string, string[]>();
  for (const e of entities) {
    const sector = e.sector ?? 'unknown';
    const group = bySector.get(sector) ?? [];
    group.push(e.id);
    bySector.set(sector, group);
  }
  for (const group of bySector.values()) {
    if (group.length < 2) continue;
    // Star topology: first entity in group links to all others
    const [hub, ...rest] = group;
    for (const target of rest) {
      links.push({ source: hub, target });
    }
  }

  return { nodes, links };
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal-driven graph builder (relationship intelligence)
// ─────────────────────────────────────────────────────────────────────────────

export interface IntelligentGraphInput {
  entities: EntityProfile[];
  events: AiEvent[];
  signals: Signal[];
  /** Reference date for recency calculations (default: now). */
  referenceDate?: Date;
  /** Minimum relationship strength to include an entity↔entity edge (default: 1). */
  minStrength?: number;
}

export interface IntelligentGraphResult {
  graph: GraphData;
  /** All computed entity relationships, sorted by strength descending. */
  relationships: EntityRelationship[];
}

/**
 * Build a graph where entity↔entity edges are weighted by signal-driven
 * relationship intelligence rather than static sector groupings.
 *
 * Includes all standard entity→event, event→signal, and signal→entity links
 * from buildGraphData, plus weighted entity↔entity edges computed from shared
 * signal activity, recency, and significance.
 */
export function buildIntelligentGraph(input: IntelligentGraphInput): IntelligentGraphResult {
  const { entities, events, signals, referenceDate, minStrength = 1 } = input;

  // Start with the standard graph
  const base = buildGraphData({ entities, events, signals });

  // Compute signal-driven relationships
  const relationships = computeAllRelationships({
    entities,
    signals,
    events,
    referenceDate,
  });

  // Add weighted entity↔entity edges
  const existingLinks = new Set(
    base.links.map(l => `${l.source}::${l.target}`),
  );
  const seen = new Set(base.nodes.map(n => n.id));

  for (const rel of relationships) {
    if (rel.strength < minStrength) continue;

    // Skip if both entities aren't in the graph
    if (!seen.has(rel.sourceEntityId) || !seen.has(rel.targetEntityId)) continue;

    const key = `${rel.sourceEntityId}::${rel.targetEntityId}`;
    const reverseKey = `${rel.targetEntityId}::${rel.sourceEntityId}`;

    // Skip if link already exists in either direction
    if (existingLinks.has(key) || existingLinks.has(reverseKey)) continue;

    base.links.push({
      source: rel.sourceEntityId,
      target: rel.targetEntityId,
      strength: rel.strength,
      tier: rel.tier === 'none' ? undefined : rel.tier,
      sharedSignals: rel.sharedSignalCount,
      lastInteraction: rel.lastInteraction ?? undefined,
    });
  }

  return { graph: base, relationships };
}
