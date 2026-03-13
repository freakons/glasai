/**
 * Omterminal — Cross-Signal Intelligence Linker
 *
 * Connects signals into a coherent intelligence network by identifying
 * relationships between signals that share entities, models, investors,
 * regulatory bodies, or related events.
 *
 * Design constraints:
 *   • Pure functions — no I/O, no LLM calls, deterministic.
 *   • Works with the existing Signal interface from mockSignals.
 *   • Uses existing entity registries for entity resolution.
 *   • Does not introduce new schema — uses existing signal metadata.
 *
 * Exported utilities:
 *   computeRelatedSignals()  — find signals related to a given signal
 *   groupSignalsByEvent()    — group signals by shared entity/category overlap
 *   buildSignalClusters()    — cluster signals into coherent intelligence groups
 */

import type { Signal } from '@/data/mockSignals';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** A scored link between two signals with an explanation of why they're related. */
export interface SignalLink {
  /** ID of the related signal. */
  signalId: string;
  /** Relatedness score (0–100). Higher = stronger relationship. */
  score: number;
  /** Reasons this link exists, e.g. ["shared_entity:OpenAI", "same_category"]. */
  reasons: string[];
}

/** A signal enriched with its computed related signals. */
export interface LinkedSignal extends Signal {
  /** Scored links to related signals, sorted by score descending. */
  relatedSignals: SignalLink[];
}

/** A group of signals clustered around a shared event or theme. */
export interface SignalGroup {
  /** Descriptive label for this group. */
  label: string;
  /** The key used for grouping (entity ID, category, etc.). */
  groupKey: string;
  /** Signals in this group, ordered by date descending. */
  signals: Signal[];
  /** Number of distinct entities involved across all signals. */
  entityCount: number;
}

/** A cluster of tightly related signals forming a coherent intelligence unit. */
export interface SignalCluster {
  /** Auto-generated cluster ID. */
  id: string;
  /** Descriptive label derived from the dominant theme. */
  label: string;
  /** Signal IDs in this cluster. */
  signalIds: string[];
  /** Average relatedness score within the cluster (0–100). */
  cohesion: number;
  /** Distinct entities involved across all signals in the cluster. */
  entities: string[];
  /** Dominant category of the cluster. */
  dominantCategory: string;
  /** Date range: earliest signal date. */
  dateFrom: string;
  /** Date range: latest signal date. */
  dateTo: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

/** Weights for each linking dimension (must sum to 1.0). */
const LINK_WEIGHTS = {
  sharedEntity:   0.40,
  sameCategory:   0.20,
  temporalProximity: 0.20,
  titleSimilarity:   0.20,
} as const;

/** Maximum time gap (days) for temporal proximity to contribute. */
const MAX_TEMPORAL_GAP_DAYS = 30;

/** Minimum relatedness score to include a link. */
const MIN_LINK_SCORE = 15;

/** Maximum related signals to return per signal. */
const MAX_RELATED = 10;

/** Minimum cluster cohesion to keep a cluster. */
const MIN_CLUSTER_COHESION = 20;

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
 * Extract entity tokens from a signal: entityId, entityName, and any
 * entities mentioned in the title/summary.
 */
function extractEntities(signal: Signal): Set<string> {
  const entities = new Set<string>();
  if (signal.entityId) entities.add(signal.entityId.toLowerCase());
  if (signal.entityName) entities.add(signal.entityName.toLowerCase());
  return entities;
}

/**
 * Compute bigram overlap between two strings (Dice coefficient).
 * Returns 0–1 where 1 = identical.
 */
function bigramOverlap(a: string, b: string): number {
  const na = a.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const nb = b.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return 0;

  const bigramsA = new Set<string>();
  for (let i = 0; i < na.length - 1; i++) bigramsA.add(na.slice(i, i + 2));

  const bigramsB = new Set<string>();
  for (let i = 0; i < nb.length - 1; i++) bigramsB.add(nb.slice(i, i + 2));

  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }

  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

/**
 * Compute temporal proximity score. Returns 1.0 for same day, decays
 * linearly to 0 at MAX_TEMPORAL_GAP_DAYS.
 */
function temporalProximity(dateA: string, dateB: string): number {
  const msA = new Date(dateA).getTime();
  const msB = new Date(dateB).getTime();
  if (isNaN(msA) || isNaN(msB)) return 0;
  const daysDiff = Math.abs(msA - msB) / (1000 * 60 * 60 * 24);
  if (daysDiff >= MAX_TEMPORAL_GAP_DAYS) return 0;
  return 1 - daysDiff / MAX_TEMPORAL_GAP_DAYS;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core: compute relatedness between two signals
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute a relatedness score between two signals.
 *
 * Dimensions:
 *   1. Shared entities (40%) — signals referencing the same company/entity
 *   2. Same category (20%) — signals in the same intelligence category
 *   3. Temporal proximity (20%) — signals close in time
 *   4. Title similarity (20%) — signals with similar titles (topical overlap)
 *
 * @returns Score (0–100) and array of human-readable reasons.
 */
export function computeSignalRelatedness(
  a: Signal,
  b: Signal,
): { score: number; reasons: string[] } {
  if (a.id === b.id) return { score: 0, reasons: [] };

  const reasons: string[] = [];

  // 1. Shared entities
  const entitiesA = extractEntities(a);
  const entitiesB = extractEntities(b);
  let sharedEntityCount = 0;
  for (const e of entitiesA) {
    if (entitiesB.has(e)) sharedEntityCount++;
  }
  const entityComponent = sharedEntityCount > 0
    ? toScore(Math.min(sharedEntityCount / 2, 1)) // saturates at 2 shared
    : 0;
  if (sharedEntityCount > 0) {
    const shared = [...entitiesA].filter(e => entitiesB.has(e));
    reasons.push(`shared_entity:${shared[0]}`);
  }

  // 2. Same category
  const categoryComponent = a.category === b.category ? 100 : 0;
  if (a.category === b.category) {
    reasons.push(`same_category:${a.category}`);
  }

  // 3. Temporal proximity
  const temporalComponent = toScore(temporalProximity(a.date, b.date));
  if (temporalComponent > 50) {
    reasons.push('temporal_proximity');
  }

  // 4. Title similarity
  const titleSim = bigramOverlap(a.title, b.title);
  const titleComponent = toScore(titleSim);
  if (titleSim >= 0.3) {
    reasons.push('title_overlap');
  }

  // Weighted composite
  const raw =
    entityComponent       * LINK_WEIGHTS.sharedEntity +
    categoryComponent     * LINK_WEIGHTS.sameCategory +
    temporalComponent     * LINK_WEIGHTS.temporalProximity +
    titleComponent        * LINK_WEIGHTS.titleSimilarity;

  const score = Math.round(clamp01(raw / 100) * 100);

  return { score, reasons };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute related signals for a target signal from a pool of candidates.
 *
 * Returns scored links sorted by relatedness, filtered by MIN_LINK_SCORE,
 * capped at MAX_RELATED.
 *
 * @param target      The signal to find relations for.
 * @param candidates  Pool of all signals to compare against.
 * @param maxResults  Maximum results to return (default: MAX_RELATED).
 */
export function computeRelatedSignals(
  target: Signal,
  candidates: Signal[],
  maxResults = MAX_RELATED,
): SignalLink[] {
  const links: SignalLink[] = [];

  for (const candidate of candidates) {
    if (candidate.id === target.id) continue;

    const { score, reasons } = computeSignalRelatedness(target, candidate);
    if (score >= MIN_LINK_SCORE && reasons.length > 0) {
      links.push({ signalId: candidate.id, score, reasons });
    }
  }

  links.sort((a, b) => b.score - a.score);
  return links.slice(0, maxResults);
}

/**
 * Group signals by shared event dimensions: entity or category.
 *
 * Each signal appears in exactly one group (its primary entity). Groups are
 * sorted by signal count descending.
 *
 * @param signals  Array of signals to group.
 * @param groupBy  Dimension to group by: 'entity' or 'category'.
 */
export function groupSignalsByEvent(
  signals: Signal[],
  groupBy: 'entity' | 'category' = 'entity',
): SignalGroup[] {
  const buckets = new Map<string, Signal[]>();

  for (const signal of signals) {
    const key = groupBy === 'entity'
      ? (signal.entityId || 'unknown')
      : (signal.category || 'unknown');

    const bucket = buckets.get(key) ?? [];
    bucket.push(signal);
    buckets.set(key, bucket);
  }

  const groups: SignalGroup[] = [];
  for (const [key, bucket] of buckets) {
    // Sort by date descending within group
    bucket.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const entitySet = new Set<string>();
    for (const s of bucket) {
      if (s.entityId) entitySet.add(s.entityId);
    }

    const label = groupBy === 'entity'
      ? (bucket[0]?.entityName || key)
      : key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    groups.push({
      label,
      groupKey: key,
      signals: bucket,
      entityCount: entitySet.size,
    });
  }

  // Sort groups by signal count descending
  groups.sort((a, b) => b.signals.length - a.signals.length);
  return groups;
}

/**
 * Build clusters of tightly related signals.
 *
 * Uses a greedy graph approach: starting from the highest-significance signal,
 * greedily absorbs related signals that meet the cohesion threshold. Signals
 * already assigned to a cluster are not re-assigned.
 *
 * @param signals       Array of signals to cluster.
 * @param minCohesion   Minimum average relatedness to keep a cluster (default: MIN_CLUSTER_COHESION).
 * @returns             Array of signal clusters, sorted by cohesion descending.
 */
export function buildSignalClusters(
  signals: Signal[],
  minCohesion = MIN_CLUSTER_COHESION,
): SignalCluster[] {
  if (signals.length === 0) return [];

  // Precompute pairwise relatedness (only for signal pairs above threshold)
  const pairScores = new Map<string, number>();
  for (let i = 0; i < signals.length; i++) {
    for (let j = i + 1; j < signals.length; j++) {
      const { score } = computeSignalRelatedness(signals[i], signals[j]);
      if (score >= MIN_LINK_SCORE) {
        pairScores.set(`${signals[i].id}::${signals[j].id}`, score);
        pairScores.set(`${signals[j].id}::${signals[i].id}`, score);
      }
    }
  }

  // Sort seeds by significance (descending), then date (most recent first)
  const seeds = [...signals].sort((a, b) => {
    const sigA = a.significanceScore ?? 0;
    const sigB = b.significanceScore ?? 0;
    if (sigA !== sigB) return sigB - sigA;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  const assigned = new Set<string>();
  const clusters: SignalCluster[] = [];
  let clusterIdx = 0;

  for (const seed of seeds) {
    if (assigned.has(seed.id)) continue;

    // Find all unassigned signals related to this seed
    const members = [seed];
    assigned.add(seed.id);

    for (const candidate of signals) {
      if (assigned.has(candidate.id)) continue;
      const pairKey = `${seed.id}::${candidate.id}`;
      const score = pairScores.get(pairKey) ?? 0;
      if (score >= minCohesion) {
        members.push(candidate);
        assigned.add(candidate.id);
      }
    }

    // Skip singletons
    if (members.length < 2) {
      assigned.delete(seed.id); // allow re-assignment by other clusters
      continue;
    }

    // Compute average cohesion within cluster
    let totalScore = 0;
    let pairCount = 0;
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const key = `${members[i].id}::${members[j].id}`;
        totalScore += pairScores.get(key) ?? 0;
        pairCount++;
      }
    }
    const cohesion = pairCount > 0 ? Math.round(totalScore / pairCount) : 0;

    if (cohesion < minCohesion) continue;

    // Derive cluster metadata
    const entities = [...new Set(members.map(m => m.entityName).filter(Boolean))];
    const dates = members.map(m => m.date).filter(Boolean).sort();
    const categoryCounts = new Map<string, number>();
    for (const m of members) {
      categoryCounts.set(m.category, (categoryCounts.get(m.category) ?? 0) + 1);
    }
    let dominantCategory = 'research';
    let maxCount = 0;
    for (const [cat, count] of categoryCounts) {
      if (count > maxCount) {
        dominantCategory = cat;
        maxCount = count;
      }
    }

    const label = entities.length <= 2
      ? `${entities.join(' & ')}: ${dominantCategory.replace(/_/g, ' ')}`
      : `${entities[0]} + ${entities.length - 1} others: ${dominantCategory.replace(/_/g, ' ')}`;

    clusters.push({
      id: `cluster_${clusterIdx++}`,
      label,
      signalIds: members.map(m => m.id),
      cohesion,
      entities,
      dominantCategory,
      dateFrom: dates[0] ?? '',
      dateTo: dates[dates.length - 1] ?? '',
    });
  }

  clusters.sort((a, b) => b.cohesion - a.cohesion);
  return clusters;
}

/**
 * Enrich an array of signals with computed related signal links.
 *
 * Convenience wrapper that runs computeRelatedSignals for each signal
 * against the full pool.
 *
 * @param signals     Full signal pool.
 * @param maxRelated  Maximum related signals per signal (default: 5).
 * @returns           Array of LinkedSignal with relatedSignals populated.
 */
export function enrichSignalsWithLinks(
  signals: Signal[],
  maxRelated = 5,
): LinkedSignal[] {
  return signals.map(signal => ({
    ...signal,
    relatedSignals: computeRelatedSignals(signal, signals, maxRelated),
  }));
}
