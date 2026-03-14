/**
 * Omterminal — Signal Impact Scoring
 *
 * Derives an impact level from existing signal data. Impact represents how
 * important a signal is to the ecosystem or entity — distinct from confidence
 * (trustworthiness) and corroboration (evidence breadth).
 *
 * Current logic uses significanceScore as the primary input with optional
 * boosts from sourceSupportCount and affectedEntities count.
 *
 * Designed for future expansion with corroboration, trend/momentum,
 * cross-ecosystem spread, and category-specific weighting.
 */

export type ImpactLevel = 'High' | 'Medium' | 'Low';

export interface ImpactResult {
  /** Derived impact level. */
  level: ImpactLevel;
  /** The effective score (0–100) used to derive the level. */
  effectiveScore: number;
  /**
   * Whether the result used a fallback because significanceScore was missing.
   * Useful for UI to optionally indicate reduced certainty.
   */
  usedFallback: boolean;
}

export interface ImpactInput {
  /** Composite significance score (0–100). May be null for legacy signals. */
  significanceScore?: number | null;
  /** Confidence score (0–100). */
  confidenceScore?: number | null;
  /** Number of distinct corroborating sources. */
  sourceSupportCount?: number | null;
  /** Number of affected entities (from signal context). */
  affectedEntitiesCount?: number | null;
}

/**
 * Compute the impact level for a signal.
 *
 * Scoring rules (v1):
 *   - Base score = significanceScore (or fallback of 40 if missing)
 *   - Boost +5 if sourceSupportCount >= 3 (well-corroborated)
 *   - Boost +5 if affectedEntitiesCount >= 3 (broad reach)
 *   - Capped at 100
 *
 * Thresholds:
 *   - High:   effectiveScore >= 75
 *   - Medium: effectiveScore >= 50
 *   - Low:    effectiveScore < 50
 */
export function computeImpact(input: ImpactInput): ImpactResult {
  const usedFallback = input.significanceScore == null;
  let score = input.significanceScore ?? 40;

  // Source support boost
  if (input.sourceSupportCount != null && input.sourceSupportCount >= 3) {
    score += 5;
  }

  // Affected entities boost
  if (input.affectedEntitiesCount != null && input.affectedEntitiesCount >= 3) {
    score += 5;
  }

  const effectiveScore = Math.min(score, 100);

  let level: ImpactLevel;
  if (effectiveScore >= 75) {
    level = 'High';
  } else if (effectiveScore >= 50) {
    level = 'Medium';
  } else {
    level = 'Low';
  }

  return { level, effectiveScore, usedFallback };
}
