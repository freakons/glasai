/**
 * Omterminal — Signal Significance Engine
 *
 * Pure, stateless module that computes a significance score (0–100) for a
 * signal at write time.  Significance goes beyond raw confidence: it weighs
 * source diversity, event velocity, signal type strategic weight, and entity
 * spread to produce a ranking signal that powers premium surfaces.
 *
 * Design constraints:
 *   • No LLM calls, no external I/O — safe to call in any pipeline stage.
 *   • Pure function: same inputs always produce the same output.
 *   • All weights are centralised here; change one place to affect all signals.
 */

import type { SignalType } from '@/types/intelligence';
import { computeWeightedSourceTrust } from '@/lib/sourceTrust';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Input to computeSignificance.
 *
 * All numeric fields are expected to be non-negative.
 * The function clamps them internally so callers do not need to guard ranges.
 */
export interface SignificanceInput {
  /** Signal pattern type — drives the type-weight multiplier. */
  signalType: SignalType | null;

  /**
   * Raw confidence from the detection engine (0.0 – 1.0).
   * Maps to the engine's confidence_score column.
   */
  confidenceScore: number;

  /**
   * Number of distinct source domains / publishers that contributed events
   * supporting this signal.  0 = single-source; higher = more credible.
   */
  sourceCount: number;

  /**
   * Number of supporting events that fired within the detection window.
   * Captures how densely the signal's time-window was populated.
   */
  eventCount: number;

  /**
   * Total time span of the supporting events in hours.
   * A short span for many events indicates high velocity.
   * 0 means all events are simultaneous (treat as instantaneous).
   */
  windowHours: number;

  /**
   * Number of distinct named entities (companies, labs, funds) mentioned
   * across supporting events.  Broader entity coverage = broader impact.
   */
  entityCount: number;

  /**
   * Optional list of source identifiers (registry IDs, names, or domains)
   * that contributed events to this signal.  When provided, enables a source
   * trust quality component that rewards signals backed by credible sources.
   * When absent, the source trust component uses a neutral midpoint.
   */
  sourceIds?: string[];
}

/**
 * Scored output returned by computeSignificance.
 */
export interface SignificanceResult {
  /** Composite significance score clamped to [0, 100]. */
  significanceScore: number;

  /**
   * Number of distinct sources used in the computation.
   * Mirrors SignificanceInput.sourceCount; provided for convenience at the
   * write site so callers can persist both fields in one pass.
   */
  sourceSupportCount: number;

  /** Per-component breakdown for debugging and audit logging. */
  components: {
    /** Confidence component (0–100 before weighting). */
    confidence: number;
    /** Source diversity component (0–100 before weighting). */
    sourceDiversity: number;
    /** Source trust quality component (0–100 before weighting). */
    sourceTrustQuality: number;
    /** Velocity component (0–100 before weighting). */
    velocity: number;
    /** Signal type strategic weight (0–100 before weighting). */
    typeWeight: number;
    /** Entity spread component (0–100 before weighting). */
    entitySpread: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal type weights
//
// Centralised map: higher = more strategically significant for Omterminal's
// target audience (AI operators, investors, policy watchers).
// Range: 0–100.  Neutral/informational types score lower than market-moving ones.
// ─────────────────────────────────────────────────────────────────────────────

export const SIGNAL_TYPE_WEIGHTS: Record<SignalType, number> = {
  CAPITAL_ACCELERATION: 90,  // Capital concentration is high-signal for investors
  MODEL_RELEASE_WAVE:   85,  // Capability shifts drive downstream decisions
  REGULATION_ACTIVITY:  75,  // Policy moves affect entire sectors; directional but slower
  RESEARCH_MOMENTUM:    70,  // Precursor to capability shifts; leading indicator
  COMPANY_EXPANSION:    65,  // Expansion events are relevant but more routine
};

/** Fallback weight when signal type is unknown or null. */
const DEFAULT_TYPE_WEIGHT = 60;

// ─────────────────────────────────────────────────────────────────────────────
// Component weights (must sum to 1.0)
// ─────────────────────────────────────────────────────────────────────────────

const COMPONENT_WEIGHTS = {
  confidence:        0.30,  // Confidence remains the primary signal of validity
  sourceDiversity:   0.20,  // Source corroboration (distinct source count)
  sourceTrustQuality: 0.10, // Quality/credibility of contributing sources
  velocity:          0.20,  // How fast events are clustering matters for timeliness
  typeWeight:        0.10,  // Strategic category boost
  entitySpread:      0.10,  // Breadth of impact across the AI ecosystem
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Normalisation constants
// ─────────────────────────────────────────────────────────────────────────────

/** Treat ≥ this many sources as full source-diversity coverage. */
const SOURCE_SATURATION = 5;

/** Treat ≥ this many entities as full entity-spread coverage. */
const ENTITY_SATURATION = 8;

/**
 * Reference velocity: events/hour at which velocity component saturates.
 * 0.5 events/hour = 12 events over 24 h triggers near-maximum velocity.
 */
const VELOCITY_SATURATION = 0.5;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Clamp a value to [0, 1]. */
function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Scale a [0, 1] fraction to [0, 100], rounded to nearest integer. */
function toScore(fraction: number): number {
  return Math.round(clamp01(fraction) * 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// Component scorers
// ─────────────────────────────────────────────────────────────────────────────

/** confidence_score (0–1) → [0, 100] */
function scoreConfidence(confidenceScore: number): number {
  return toScore(confidenceScore);
}

/**
 * Source diversity: logarithmic saturation so each additional source adds
 * diminishing returns.  1 source → 20; 5+ → 100.
 */
function scoreSourceDiversity(sourceCount: number): number {
  if (sourceCount <= 0) return 0;
  return toScore(Math.log(sourceCount + 1) / Math.log(SOURCE_SATURATION + 1));
}

/**
 * Velocity: events per hour, saturating at VELOCITY_SATURATION.
 * windowHours=0 (instantaneous burst) is treated as max velocity.
 */
function scoreVelocity(eventCount: number, windowHours: number): number {
  if (eventCount <= 0) return 0;
  if (windowHours <= 0) return 100; // Instantaneous burst = maximum velocity
  const eventsPerHour = eventCount / windowHours;
  return toScore(eventsPerHour / VELOCITY_SATURATION);
}

/** Look up the strategic weight for a signal type. */
function scoreTypeWeight(signalType: SignalType | null): number {
  if (signalType === null) return DEFAULT_TYPE_WEIGHT;
  return SIGNAL_TYPE_WEIGHTS[signalType] ?? DEFAULT_TYPE_WEIGHT;
}

/**
 * Entity spread: linear saturation at ENTITY_SATURATION.
 * A signal touching more distinct entities has broader ecosystem impact.
 */
function scoreEntitySpread(entityCount: number): number {
  return toScore(entityCount / ENTITY_SATURATION);
}

/**
 * Source trust quality: weighted trust score of contributing sources.
 * Returns a neutral 50 when no source IDs are provided (backward-compatible).
 */
function scoreSourceTrustQuality(sourceIds?: string[]): number {
  if (!sourceIds || sourceIds.length === 0) return 50;
  return computeWeightedSourceTrust(sourceIds);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute a composite significance score for a signal.
 *
 * Combines five components — confidence, source diversity, velocity, signal
 * type weight, and entity spread — into a single 0–100 integer.  Higher
 * scores indicate signals that are more credible, better corroborated, more
 * timely, more strategically relevant, and broader in ecosystem impact.
 *
 * Called at write time (signal generation stage) so the score is persisted
 * and never recomputed on the read path.
 *
 * @param input  Significance input derived from the signal and its events.
 * @returns      Scored result with the integer significanceScore and component breakdown.
 *
 * @example
 * const result = computeSignificance({
 *   signalType:      'CAPITAL_ACCELERATION',
 *   confidenceScore: 0.87,
 *   sourceCount:     4,
 *   eventCount:      5,
 *   windowHours:     72,
 *   entityCount:     3,
 * });
 * // result.significanceScore → 79
 */
export function computeSignificance(input: SignificanceInput): SignificanceResult {
  const {
    signalType,
    confidenceScore,
    sourceCount,
    eventCount,
    windowHours,
    entityCount,
    sourceIds,
  } = input;

  // --- per-component scores (0–100) ---
  const components = {
    confidence:        scoreConfidence(confidenceScore),
    sourceDiversity:   scoreSourceDiversity(sourceCount),
    sourceTrustQuality: scoreSourceTrustQuality(sourceIds),
    velocity:          scoreVelocity(eventCount, windowHours),
    typeWeight:        scoreTypeWeight(signalType),
    entitySpread:      scoreEntitySpread(entityCount),
  };

  // --- weighted composite ---
  const raw =
    components.confidence        * COMPONENT_WEIGHTS.confidence        +
    components.sourceDiversity   * COMPONENT_WEIGHTS.sourceDiversity   +
    components.sourceTrustQuality * COMPONENT_WEIGHTS.sourceTrustQuality +
    components.velocity          * COMPONENT_WEIGHTS.velocity          +
    components.typeWeight        * COMPONENT_WEIGHTS.typeWeight        +
    components.entitySpread      * COMPONENT_WEIGHTS.entitySpread;

  const significanceScore = Math.round(clamp01(raw / 100) * 100);

  return {
    significanceScore,
    sourceSupportCount: Math.max(0, Math.floor(sourceCount)),
    components,
  };
}
