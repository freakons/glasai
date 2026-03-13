/**
 * Omterminal — Relationship Intelligence Engine
 *
 * Pure, stateless module that computes signal-driven relationship strength
 * between entities.  Relationships are derived from shared signal activity
 * (co-occurrence in events/signals), recency of interactions, and signal
 * significance rather than static sector-based linking.
 *
 * Design constraints:
 *   • No LLM calls, no external I/O — safe to call in any pipeline stage.
 *   • Pure functions: same inputs always produce the same output.
 *   • Works with the existing Signal and AiEvent interfaces.
 */

import type { Signal } from '@/data/mockSignals';
import type { AiEvent } from '@/data/mockEvents';
import type { EntityProfile } from '@/data/mockEntities';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Qualitative strength tier derived from numeric score. */
export type RelationshipTier = 'strong' | 'moderate' | 'weak' | 'none';

/**
 * A computed relationship edge between two entities.
 * Enriched with signal-driven metrics for graph rendering and API responses.
 */
export interface EntityRelationship {
  /** Canonical entity ID of the first entity (alphabetically lower). */
  sourceEntityId: string;
  /** Canonical entity ID of the second entity. */
  targetEntityId: string;
  /** Number of shared signals between the two entities. */
  sharedSignalCount: number;
  /** Number of shared events between the two entities. */
  sharedEventCount: number;
  /** ISO timestamp of the most recent shared signal or event. */
  lastInteraction: string | null;
  /** Average significance of shared signals (0–100). */
  avgSignificance: number;
  /** Computed relationship strength score (0–100). */
  strength: number;
  /** Qualitative tier derived from strength score. */
  tier: RelationshipTier;
  /** IDs of the shared signals connecting these entities. */
  sharedSignalIds: string[];
}

/**
 * Full connection profile for a single entity.
 * Aggregates all relationships an entity participates in.
 */
export interface EntityConnectionProfile {
  entityId: string;
  entityName: string;
  /** All relationships sorted by strength descending. */
  relationships: EntityRelationship[];
  /** Total unique entities this entity is connected to. */
  connectionCount: number;
  /** Average relationship strength across all connections. */
  avgStrength: number;
  /** ID of the strongest connected entity, if any. */
  strongestConnectionId: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

/** Component weights for relationship strength (must sum to 1.0). */
const RELATIONSHIP_WEIGHTS = {
  sharedSignals:   0.40,  // Signal co-occurrence is the primary relationship driver
  recency:         0.30,  // Recent interactions indicate active relationships
  significance:    0.30,  // Higher-significance shared signals = stronger tie
} as const;

/** Maximum shared signals before the component saturates. */
const SIGNAL_SATURATION = 10;

/** Recency half-life in days — interactions older than this decay to 50%. */
const RECENCY_HALF_LIFE_DAYS = 14;

/** Strength thresholds for tier classification. */
const TIER_THRESHOLDS = {
  strong:   60,
  moderate: 30,
  weak:     1,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function toScore(fraction: number): number {
  return Math.round(clamp01(fraction) * 100);
}

/**
 * Exponential decay based on days since last interaction.
 * Returns 1.0 for today, ~0.5 at RECENCY_HALF_LIFE_DAYS, asymptoting to 0.
 */
function recencyDecay(daysSince: number): number {
  if (daysSince <= 0) return 1;
  return Math.pow(0.5, daysSince / RECENCY_HALF_LIFE_DAYS);
}

function strengthToTier(strength: number): RelationshipTier {
  if (strength >= TIER_THRESHOLDS.strong)   return 'strong';
  if (strength >= TIER_THRESHOLDS.moderate) return 'moderate';
  if (strength >= TIER_THRESHOLDS.weak)     return 'weak';
  return 'none';
}

/** Canonical pair key — always lower ID first for deduplication. */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

function pairIds(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

// ─────────────────────────────────────────────────────────────────────────────
// Index builders
// ─────────────────────────────────────────────────────────────────────────────

interface SignalEntityIndex {
  /** signal ID → set of entity IDs mentioned in or attributed to that signal */
  signalToEntities: Map<string, Set<string>>;
  /** entity ID → set of signal IDs the entity participates in */
  entityToSignals: Map<string, Set<string>>;
  /** signal ID → Signal object for metadata lookups */
  signalById: Map<string, Signal>;
}

/**
 * Build inverted indices from signals and events.
 *
 * An entity is linked to a signal when:
 *   1. The signal's entityId matches the entity, OR
 *   2. An event attributed to the entity references the signal via signalIds.
 */
function buildIndex(signals: Signal[], events: AiEvent[]): SignalEntityIndex {
  const signalToEntities = new Map<string, Set<string>>();
  const entityToSignals  = new Map<string, Set<string>>();
  const signalById       = new Map<string, Signal>();

  // Index signals by their primary entity
  for (const sig of signals) {
    signalById.set(sig.id, sig);

    const entities = signalToEntities.get(sig.id) ?? new Set();
    entities.add(sig.entityId);
    signalToEntities.set(sig.id, entities);

    const sigs = entityToSignals.get(sig.entityId) ?? new Set();
    sigs.add(sig.id);
    entityToSignals.set(sig.entityId, sigs);
  }

  // Index events — link event's entity to the event's signalIds
  for (const ev of events) {
    if (!ev.signalIds) continue;
    for (const sid of ev.signalIds) {
      // Add entity to this signal's entity set
      const entities = signalToEntities.get(sid) ?? new Set();
      entities.add(ev.entityId);
      signalToEntities.set(sid, entities);

      // Add signal to this entity's signal set
      const sigs = entityToSignals.get(ev.entityId) ?? new Set();
      sigs.add(sid);
      entityToSignals.set(ev.entityId, sigs);
    }
  }

  return { signalToEntities, entityToSignals, signalById };
}

// ─────────────────────────────────────────────────────────────────────────────
// Core computation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute relationship strength between two entities.
 *
 * Components:
 *   1. **Shared signal count** — logarithmic saturation at SIGNAL_SATURATION
 *   2. **Recency** — exponential decay from the most recent shared interaction
 *   3. **Significance** — average significance of shared signals (0–100 → 0–1)
 *
 * @param sharedSignalIds  IDs of signals both entities participate in.
 * @param signalById       Lookup map for signal metadata.
 * @param referenceDate    "Now" for recency calculations (default: current time).
 * @returns                Relationship strength score (0–100).
 */
export function computeRelationshipStrength(
  sharedSignalIds: string[],
  signalById: Map<string, Signal>,
  referenceDate: Date = new Date(),
): { strength: number; avgSignificance: number; lastInteraction: string | null } {
  if (sharedSignalIds.length === 0) {
    return { strength: 0, avgSignificance: 0, lastInteraction: null };
  }

  // Gather metadata from shared signals
  let totalSignificance = 0;
  let significanceCount = 0;
  let mostRecentDate: Date | null = null;

  for (const sid of sharedSignalIds) {
    const sig = signalById.get(sid);
    if (!sig) continue;

    if (sig.significanceScore != null) {
      totalSignificance += sig.significanceScore;
      significanceCount++;
    }

    const sigDate = new Date(sig.date);
    if (!mostRecentDate || sigDate > mostRecentDate) {
      mostRecentDate = sigDate;
    }
  }

  // Component 1: shared signal count (log saturation)
  const signalComponent = toScore(
    Math.log(sharedSignalIds.length + 1) / Math.log(SIGNAL_SATURATION + 1),
  );

  // Component 2: recency decay
  let recencyComponent = 50; // neutral default
  if (mostRecentDate) {
    const daysSince = (referenceDate.getTime() - mostRecentDate.getTime()) / (1000 * 60 * 60 * 24);
    recencyComponent = toScore(recencyDecay(daysSince));
  }

  // Component 3: average significance
  const avgSignificance = significanceCount > 0
    ? Math.round(totalSignificance / significanceCount)
    : 50; // neutral when no significance data
  const significanceComponent = avgSignificance; // already 0–100

  // Weighted composite
  const raw =
    signalComponent      * RELATIONSHIP_WEIGHTS.sharedSignals +
    recencyComponent     * RELATIONSHIP_WEIGHTS.recency +
    significanceComponent * RELATIONSHIP_WEIGHTS.significance;

  const strength = Math.round(clamp01(raw / 100) * 100);

  const lastInteraction = mostRecentDate ? mostRecentDate.toISOString() : null;

  return { strength, avgSignificance, lastInteraction };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export interface RelationshipInput {
  entities: EntityProfile[];
  signals: Signal[];
  events: AiEvent[];
  /** Reference date for recency calculations (default: now). */
  referenceDate?: Date;
}

/**
 * Compute all entity-to-entity relationships from signal activity.
 *
 * Returns an array of EntityRelationship objects sorted by strength descending.
 * Only relationships with strength > 0 are returned.
 */
export function computeAllRelationships(input: RelationshipInput): EntityRelationship[] {
  const { entities, signals, events, referenceDate = new Date() } = input;
  const index = buildIndex(signals, events);

  const entityIds = new Set(entities.map(e => e.id));
  const relationships: EntityRelationship[] = [];
  const seen = new Set<string>();

  // For each pair of entities, find shared signals
  for (const entityA of entityIds) {
    const signalsA = index.entityToSignals.get(entityA);
    if (!signalsA || signalsA.size === 0) continue;

    for (const entityB of entityIds) {
      if (entityA === entityB) continue;

      const key = pairKey(entityA, entityB);
      if (seen.has(key)) continue;
      seen.add(key);

      const signalsB = index.entityToSignals.get(entityB);
      if (!signalsB || signalsB.size === 0) continue;

      // Shared signals = intersection
      const shared: string[] = [];
      for (const sid of signalsA) {
        if (signalsB.has(sid)) shared.push(sid);
      }

      if (shared.length === 0) continue;

      // Count shared events (events where both entities' signals overlap)
      let sharedEventCount = 0;
      for (const ev of events) {
        if (!ev.signalIds) continue;
        const evEntityMatch = ev.entityId === entityA || ev.entityId === entityB;
        if (!evEntityMatch) continue;
        const hasSharedSignal = ev.signalIds.some(sid => shared.includes(sid));
        if (hasSharedSignal) sharedEventCount++;
      }

      const { strength, avgSignificance, lastInteraction } = computeRelationshipStrength(
        shared,
        index.signalById,
        referenceDate,
      );

      if (strength === 0) continue;

      const [sourceId, targetId] = pairIds(entityA, entityB);

      relationships.push({
        sourceEntityId: sourceId,
        targetEntityId: targetId,
        sharedSignalCount: shared.length,
        sharedEventCount,
        lastInteraction,
        avgSignificance,
        strength,
        tier: strengthToTier(strength),
        sharedSignalIds: shared,
      });
    }
  }

  // Sort by strength descending
  relationships.sort((a, b) => b.strength - a.strength);
  return relationships;
}

/**
 * Get the full connection profile for a specific entity.
 *
 * Includes all relationships the entity participates in, sorted by strength.
 */
export function getEntityConnections(
  entityId: string,
  allRelationships: EntityRelationship[],
  entityNameMap: Map<string, string>,
): EntityConnectionProfile {
  const relationships = allRelationships.filter(
    r => r.sourceEntityId === entityId || r.targetEntityId === entityId,
  );

  const totalStrength = relationships.reduce((sum, r) => sum + r.strength, 0);
  const avgStrength = relationships.length > 0
    ? Math.round(totalStrength / relationships.length)
    : 0;

  const strongestConnectionId = relationships.length > 0
    ? (relationships[0].sourceEntityId === entityId
        ? relationships[0].targetEntityId
        : relationships[0].sourceEntityId)
    : null;

  return {
    entityId,
    entityName: entityNameMap.get(entityId) ?? entityId,
    relationships,
    connectionCount: relationships.length,
    avgStrength,
    strongestConnectionId,
  };
}
