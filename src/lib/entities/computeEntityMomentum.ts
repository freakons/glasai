/**
 * Omterminal — Entity Momentum Scoring
 *
 * Computes a transparent momentum score (0–100) for an entity based on
 * recent intelligence activity. The score answers: "Is this entity
 * heating up right now?"
 *
 * ─── Formula ──────────────────────────────────────────────────────────
 *
 *   Base score:
 *     volumeScore     = min(recentSignalCount / 10, 1) × 35
 *     accelerationScore = clamp(growthRate, -1, 2) normalized to 0–30
 *     impactBonus     = min(highImpactSignalCount × 5, 20)
 *     momentumBonus   = min(risingMomentumSignalCount × 5, 15)
 *
 *   Total = volumeScore + accelerationScore + impactBonus + momentumBonus
 *   Clamped to 0–100.
 *
 * ─── Weights ──────────────────────────────────────────────────────────
 *
 *   Volume (recent 7d signal count)          — up to 35 pts
 *   Acceleration (7d vs previous 7d growth)  — up to 30 pts
 *   High-impact signals (significance ≥ 75)  — up to 20 pts
 *   Rising-momentum signals                  — up to 15 pts
 *
 * ─── Labels ───────────────────────────────────────────────────────────
 *
 *   Surging  — score ≥ 70
 *   Rising   — score ≥ 45
 *   Stable   — score ≥ 20
 *   Cooling  — score < 20
 *
 * ─── Fallback ─────────────────────────────────────────────────────────
 *
 *   When an entity has no recent activity (all inputs zero), the score
 *   is 0 and the label is "Cooling". Sparse data naturally produces low
 *   scores — never misleading "Surging" results.
 *
 * ─── Extensibility ────────────────────────────────────────────────────
 *
 *   The input interface is designed for future additions:
 *     - trendAppearances
 *     - recentFundingEventCount
 *     - recentModelReleaseCount
 *     - crossEcosystemSpread
 *     - strategicImportanceIndex
 *   Add optional fields to EntityMomentumInput and extend the formula.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type EntityMomentumLabel = 'Surging' | 'Rising' | 'Stable' | 'Cooling';

export interface EntityMomentumInput {
  /** Number of signals in the recent window (last 7 days). */
  recentSignalCount: number;
  /** Number of signals in the previous window (8–14 days ago). */
  previousSignalCount: number;
  /** Number of recent signals with significance_score ≥ 75. */
  highImpactSignalCount: number;
  /** Number of recent signals with rising momentum (recentEvents > prevEvents × 1.5). */
  risingMomentumSignalCount: number;
  /** Number of events in the recent window (last 7 days). */
  recentEventCount: number;
}

export interface EntityMomentumResult {
  /** Composite score 0–100. */
  momentumScore: number;
  /** Human-readable label. */
  momentumLabel: EntityMomentumLabel;
  /** Breakdown for transparency / debugging. */
  breakdown: {
    volumeScore: number;
    accelerationScore: number;
    impactBonus: number;
    momentumBonus: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Weights — tunable constants
// ─────────────────────────────────────────────────────────────────────────────

const MAX_VOLUME_SCORE = 35;
const VOLUME_CEILING = 10; // signals to reach max volume score

const MAX_ACCELERATION_SCORE = 30;

const MAX_IMPACT_BONUS = 20;
const IMPACT_BONUS_PER_SIGNAL = 5;

const MAX_MOMENTUM_BONUS = 15;
const MOMENTUM_BONUS_PER_SIGNAL = 5;

// Label thresholds
const SURGING_THRESHOLD = 70;
const RISING_THRESHOLD = 45;
const STABLE_THRESHOLD = 20;

// ─────────────────────────────────────────────────────────────────────────────
// Core
// ─────────────────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function labelFromScore(score: number): EntityMomentumLabel {
  if (score >= SURGING_THRESHOLD) return 'Surging';
  if (score >= RISING_THRESHOLD) return 'Rising';
  if (score >= STABLE_THRESHOLD) return 'Stable';
  return 'Cooling';
}

/**
 * Compute the entity momentum score.
 *
 * Deterministic, pure function — no side effects, no external data.
 */
export function computeEntityMomentum(input: EntityMomentumInput): EntityMomentumResult {
  const {
    recentSignalCount,
    previousSignalCount,
    highImpactSignalCount,
    risingMomentumSignalCount,
  } = input;

  // 1. Volume — how much recent activity exists (0–35)
  const volumeRatio = Math.min(recentSignalCount / VOLUME_CEILING, 1);
  const volumeScore = Math.round(volumeRatio * MAX_VOLUME_SCORE);

  // 2. Acceleration — is activity growing vs previous window (0–30)
  //    growthRate: -1 (complete drop) to 2+ (tripled)
  //    We normalize [-1, 2] → [0, 1] for scoring
  const baseline = Math.max(previousSignalCount, 1);
  const growthRate = (recentSignalCount - previousSignalCount) / baseline;
  const clampedGrowth = clamp(growthRate, -1, 2);
  const normalizedGrowth = (clampedGrowth + 1) / 3; // maps [-1,2] → [0,1]
  const accelerationScore = Math.round(normalizedGrowth * MAX_ACCELERATION_SCORE);

  // 3. Impact bonus — high-significance signals in recent window (0–20)
  const impactBonus = Math.min(
    highImpactSignalCount * IMPACT_BONUS_PER_SIGNAL,
    MAX_IMPACT_BONUS,
  );

  // 4. Momentum bonus — rising-momentum signals in recent window (0–15)
  const momentumBonus = Math.min(
    risingMomentumSignalCount * MOMENTUM_BONUS_PER_SIGNAL,
    MAX_MOMENTUM_BONUS,
  );

  const raw = volumeScore + accelerationScore + impactBonus + momentumBonus;
  const momentumScore = clamp(raw, 0, 100);

  return {
    momentumScore,
    momentumLabel: labelFromScore(momentumScore),
    breakdown: {
      volumeScore,
      accelerationScore,
      impactBonus,
      momentumBonus,
    },
  };
}
