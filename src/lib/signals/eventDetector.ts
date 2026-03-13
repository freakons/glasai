/**
 * Omterminal — Major Event Detector
 *
 * Detects and scores major AI ecosystem events by analyzing clusters of
 * related signals.  A "major event" is a real-world development — model
 * launch, funding round, regulatory shift, acquisition, partnership, or
 * research breakthrough — that is corroborated by multiple signals and
 * warrants first-class treatment in the product.
 *
 * Design constraints:
 *   • Pure functions — no I/O, no LLM calls, fully deterministic.
 *   • Works with the existing Signal interface from mockSignals.
 *   • Builds on crossSignalLinker for relatedness and clustering.
 *   • Conservative merging — prefers precision over recall.
 *   • Produces explainable event objects with scoring breakdowns.
 *
 * Exported utilities:
 *   detectMajorEvents()       — full pipeline: cluster → filter → score → rank
 *   scoreMajorEvent()         — score a single candidate event
 *   buildCandidateEvents()    — build candidate events from signal clusters
 */

import type { Signal } from '@/data/mockSignals';
import {
  buildSignalClusters,
  computeSignalRelatedness,
  type SignalCluster,
} from './crossSignalLinker';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Category labels for detected major events. */
export type MajorEventCategory =
  | 'model_launch'
  | 'funding_round'
  | 'regulation'
  | 'acquisition'
  | 'partnership'
  | 'research_breakthrough'
  | 'product_launch'
  | 'other';

/** A detected major event with scoring and provenance. */
export interface MajorEvent {
  /** Unique event identifier (deterministic, derived from member signal IDs). */
  id: string;
  /** Human-readable event title. */
  title: string;
  /** One-sentence summary of what happened. */
  summary: string;
  /** Detected event category. */
  category: MajorEventCategory;
  /** Primary entities involved in this event. */
  entities: string[];
  /** Categories of member signals. */
  signalCategories: string[];
  /** IDs of the signals that constitute this event. */
  memberSignalIds: string[];
  /** Number of member signals. */
  signalCount: number;
  /** Composite importance score (0–100). */
  importanceScore: number;
  /** Confidence / corroboration metric (0–100). */
  corroboration: number;
  /** Timestamp of the earliest member signal. */
  startedAt: string;
  /** Timestamp of the latest member signal. */
  latestAt: string;
  /** Human-readable explanation of why this event was detected. */
  whyDetected: string[];
  /** Per-component scoring breakdown for transparency. */
  scoreBreakdown: EventScoreBreakdown;
}

/** Per-component breakdown of the event importance score. */
export interface EventScoreBreakdown {
  /** Average significance of member signals (0–100). */
  avgSignificance: number;
  /** Max significance among member signals (0–100). */
  maxSignificance: number;
  /** Corroboration score based on signal count (0–100). */
  corroborationScore: number;
  /** Average source trust / support count (0–100). */
  sourceQuality: number;
  /** Recency score based on latest signal date (0–100). */
  recency: number;
  /** Cluster cohesion score from the linker (0–100). */
  cohesion: number;
}

/** Configuration for event detection thresholds and weights. */
export interface EventDetectorConfig {
  /** Minimum number of signals to form a candidate event. Default: 2. */
  minSignals: number;
  /** Minimum importance score to include an event. Default: 40. */
  minImportanceScore: number;
  /** Minimum cluster cohesion to consider. Default: 20. */
  minClusterCohesion: number;
  /** Maximum age in days for recency scoring. Default: 30. */
  maxAgeDays: number;
  /** Maximum events to return. Default: 20. */
  maxEvents: number;
  /** Reference "now" for deterministic recency scoring. */
  now?: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: EventDetectorConfig = {
  minSignals: 2,
  minImportanceScore: 40,
  minClusterCohesion: 20,
  maxAgeDays: 30,
  maxEvents: 20,
};

// ─────────────────────────────────────────────────────────────────────────────
// Importance score weights (must sum to 1.0)
// ─────────────────────────────────────────────────────────────────────────────

export const EVENT_IMPORTANCE_WEIGHTS = {
  /** Blended significance (avg * 0.6 + max * 0.4) of member signals. */
  significance: 0.30,
  /** Number of corroborating signals (log-saturating). */
  corroboration: 0.25,
  /** Average source support count / trust. */
  sourceQuality: 0.15,
  /** How recent the event is. */
  recency: 0.15,
  /** Cluster cohesion — how tightly related the signals are. */
  cohesion: 0.15,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Category mapping from signal categories to event categories
// ─────────────────────────────────────────────────────────────────────────────

const SIGNAL_CATEGORY_TO_EVENT: Record<string, MajorEventCategory> = {
  models: 'model_launch',
  funding: 'funding_round',
  regulation: 'regulation',
  agents: 'product_launch',
  research: 'research_breakthrough',
  product: 'product_launch',
};

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
 * Deterministic event ID derived from sorted member signal IDs.
 * Ensures the same set of signals always produces the same event ID.
 */
function deriveEventId(signalIds: string[]): string {
  const sorted = [...signalIds].sort();
  // Simple hash: join and create a short deterministic string
  let hash = 0;
  const str = sorted.join('|');
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return `evt-${hex}`;
}

/**
 * Determine the dominant category among a set of signals.
 * Returns the category with the highest count; ties broken alphabetically.
 */
function dominantCategory(signals: Signal[]): string {
  const counts = new Map<string, number>();
  for (const s of signals) {
    counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  for (const [cat, count] of counts) {
    if (count > bestCount || (count === bestCount && cat < best)) {
      best = cat;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Generate a human-readable title for an event based on its entities,
 * category, and member signals.
 */
function generateEventTitle(
  entities: string[],
  eventCategory: MajorEventCategory,
  signals: Signal[],
): string {
  const categoryLabel = eventCategory.replace(/_/g, ' ');
  if (entities.length === 0) {
    return `Major ${categoryLabel}`;
  }
  if (entities.length === 1) {
    return `${entities[0]}: ${categoryLabel}`;
  }
  if (entities.length === 2) {
    return `${entities[0]} & ${entities[1]}: ${categoryLabel}`;
  }
  return `${entities[0]} + ${entities.length - 1} others: ${categoryLabel}`;
}

/**
 * Generate a one-sentence summary from the member signals.
 * Uses the highest-significance signal's title as the primary hook.
 */
function generateEventSummary(signals: Signal[]): string {
  const sorted = [...signals].sort((a, b) =>
    (b.significanceScore ?? b.confidence ?? 0) - (a.significanceScore ?? a.confidence ?? 0)
  );
  const lead = sorted[0];
  if (signals.length === 1) {
    return lead.summary || lead.title;
  }
  return `${lead.title}. Corroborated by ${signals.length - 1} related signal${signals.length > 2 ? 's' : ''}.`;
}

/**
 * Build human-readable reasons why this event was detected.
 */
function buildWhyDetected(
  signals: Signal[],
  cluster: SignalCluster,
  eventCategory: MajorEventCategory,
): string[] {
  const reasons: string[] = [];

  reasons.push(`${signals.length} related signals clustered with ${Math.round(cluster.cohesion)}% cohesion`);

  if (cluster.entities.length > 0) {
    reasons.push(`Shared entities: ${cluster.entities.join(', ')}`);
  }

  reasons.push(`Dominant category: ${eventCategory.replace(/_/g, ' ')}`);

  const avgSig = signals.reduce((sum, s) => sum + (s.significanceScore ?? s.confidence ?? 0), 0) / signals.length;
  if (avgSig >= 70) {
    reasons.push(`High average signal significance (${Math.round(avgSig)})`);
  }

  const totalSources = signals.reduce((sum, s) => sum + (s.sourceSupportCount ?? 1), 0);
  if (totalSources >= 5) {
    reasons.push(`${totalSources} total source corroborations across signals`);
  }

  const dateSpanDays = (new Date(cluster.dateTo).getTime() - new Date(cluster.dateFrom).getTime()) / (1000 * 60 * 60 * 24);
  if (dateSpanDays <= 7) {
    reasons.push(`Concentrated timeline (${Math.round(dateSpanDays)} day${dateSpanDays !== 1 ? 's' : ''})`);
  }

  return reasons;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoring
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Score a candidate event's importance.
 *
 * Components:
 *   1. Significance (30%) — blended avg/max of member signal significance scores
 *   2. Corroboration (25%) — log-saturating score based on number of signals
 *   3. Source quality (15%) — average source support count across member signals
 *   4. Recency (15%) — exponential decay from latest signal date
 *   5. Cohesion (15%) — cluster cohesion from the cross-signal linker
 *
 * @param signals   Member signals for this event.
 * @param cohesion  Cluster cohesion score (0–100).
 * @param config    Detector configuration for recency params.
 * @returns         Importance score (0–100) and component breakdown.
 */
export function scoreMajorEvent(
  signals: Signal[],
  cohesion: number,
  config: Partial<EventDetectorConfig> = {},
): { importanceScore: number; breakdown: EventScoreBreakdown } {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const now = cfg.now ?? new Date();

  // 1. Significance
  const significances = signals.map(s => s.significanceScore ?? s.confidence ?? 0);
  const avgSignificance = significances.reduce((a, b) => a + b, 0) / significances.length;
  const maxSignificance = Math.max(...significances);
  // Blend: 60% average + 40% max — rewards consistency without ignoring standout signals
  const blendedSignificance = avgSignificance * 0.6 + maxSignificance * 0.4;

  // 2. Corroboration — log-saturating: 2 signals ≈ 45%, 3 ≈ 63%, 5 ≈ 80%, 8+ ≈ 95%
  const CORROBORATION_SATURATION = 8;
  const corroborationScore = toScore(
    Math.log(signals.length + 1) / Math.log(CORROBORATION_SATURATION + 1)
  );

  // 3. Source quality — average source support count, saturating at 5
  const SOURCE_QUALITY_SATURATION = 5;
  const avgSourceCount = signals.reduce(
    (sum, s) => sum + (s.sourceSupportCount ?? 1), 0
  ) / signals.length;
  const sourceQuality = toScore(avgSourceCount / SOURCE_QUALITY_SATURATION);

  // 4. Recency — exponential decay from latest signal date
  const latestDate = signals.reduce((latest, s) => {
    const d = new Date(s.date).getTime();
    return d > latest ? d : latest;
  }, 0);
  const ageMs = now.getTime() - latestDate;
  const ageDays = Math.max(ageMs / (1000 * 60 * 60 * 24), 0);
  const RECENCY_HALF_LIFE_DAYS = cfg.maxAgeDays / 2;
  const decayLambda = Math.LN2 / RECENCY_HALF_LIFE_DAYS;
  const recency = toScore(Math.exp(-decayLambda * ageDays));

  // 5. Cohesion — passed directly from the cluster
  const cohesionScore = Math.round(clamp01(cohesion / 100) * 100);

  // Weighted composite
  const raw =
    blendedSignificance     * EVENT_IMPORTANCE_WEIGHTS.significance +
    corroborationScore      * EVENT_IMPORTANCE_WEIGHTS.corroboration +
    sourceQuality           * EVENT_IMPORTANCE_WEIGHTS.sourceQuality +
    recency                 * EVENT_IMPORTANCE_WEIGHTS.recency +
    cohesionScore           * EVENT_IMPORTANCE_WEIGHTS.cohesion;

  const importanceScore = Math.round(clamp01(raw / 100) * 100);

  return {
    importanceScore,
    breakdown: {
      avgSignificance: Math.round(avgSignificance),
      maxSignificance: Math.round(maxSignificance),
      corroborationScore,
      sourceQuality,
      recency,
      cohesion: cohesionScore,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Candidate event building
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build candidate MajorEvent objects from signal clusters.
 *
 * Each cluster that meets the minimum signal count is converted into a
 * candidate event with scoring and metadata. Events below the minimum
 * importance threshold are filtered out.
 *
 * @param clusters  Signal clusters from buildSignalClusters.
 * @param signals   Full signal pool (for looking up signal data).
 * @param config    Detector configuration.
 * @returns         Array of scored MajorEvent candidates.
 */
export function buildCandidateEvents(
  clusters: SignalCluster[],
  signals: Signal[],
  config: Partial<EventDetectorConfig> = {},
): MajorEvent[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const signalMap = new Map(signals.map(s => [s.id, s]));
  const candidates: MajorEvent[] = [];

  for (const cluster of clusters) {
    // Resolve member signals
    const members = cluster.signalIds
      .map(id => signalMap.get(id))
      .filter((s): s is Signal => s !== undefined);

    // Skip clusters below minimum signal threshold
    if (members.length < cfg.minSignals) continue;

    // Determine event category
    const domCat = dominantCategory(members);
    const eventCategory: MajorEventCategory = SIGNAL_CATEGORY_TO_EVENT[domCat] ?? 'other';

    // Collect entities
    const entities = [...new Set(members.map(m => m.entityName).filter(Boolean))];

    // Collect distinct signal categories
    const signalCategories = [...new Set(members.map(m => m.category))];

    // Score the event
    const { importanceScore, breakdown } = scoreMajorEvent(members, cluster.cohesion, cfg);

    // Filter by minimum importance
    if (importanceScore < cfg.minImportanceScore) continue;

    // Corroboration metric: scaled from signal count + source support
    const totalSources = members.reduce((sum, s) => sum + (s.sourceSupportCount ?? 1), 0);
    const corroboration = toScore(
      Math.min(totalSources / 10, 1) * 0.6 +
      Math.min(members.length / 5, 1) * 0.4
    );

    // Sort dates for range
    const dates = members.map(m => m.date).filter(Boolean).sort();

    candidates.push({
      id: deriveEventId(cluster.signalIds),
      title: generateEventTitle(entities, eventCategory, members),
      summary: generateEventSummary(members),
      category: eventCategory,
      entities,
      signalCategories,
      memberSignalIds: cluster.signalIds,
      signalCount: members.length,
      importanceScore,
      corroboration,
      startedAt: dates[0] ?? '',
      latestAt: dates[dates.length - 1] ?? '',
      whyDetected: buildWhyDetected(members, cluster, eventCategory),
      scoreBreakdown: breakdown,
    });
  }

  // Sort by importance descending
  candidates.sort((a, b) => b.importanceScore - a.importanceScore);
  return candidates.slice(0, cfg.maxEvents);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main pipeline
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect major events from a pool of signals.
 *
 * Full pipeline:
 *   1. Build signal clusters using the cross-signal linker.
 *   2. Convert clusters into candidate events.
 *   3. Score each candidate using the importance model.
 *   4. Filter by minimum importance threshold.
 *   5. Return ranked events.
 *
 * This function is the primary entry point for event detection. It is pure,
 * deterministic, and safe to call from any context.
 *
 * @param signals  Array of signals to analyze.
 * @param config   Optional configuration overrides.
 * @returns        Array of detected MajorEvent objects, ranked by importance.
 */
export function detectMajorEvents(
  signals: Signal[],
  config: Partial<EventDetectorConfig> = {},
): MajorEvent[] {
  if (signals.length === 0) return [];

  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Step 1: Build clusters
  const clusters = buildSignalClusters(signals, cfg.minClusterCohesion);

  // Step 2–5: Build, score, filter, and rank candidate events
  return buildCandidateEvents(clusters, signals, cfg);
}
