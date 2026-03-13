/**
 * Omterminal — Unified Rank Score
 *
 * Pure, deterministic scoring function that produces a single rank score
 * (0–100) for ordering signals across all endpoints.  Combines the
 * persisted significance score with freshness decay and optional
 * tracked-entity priority into a final ordering value.
 *
 * Design principles:
 *   • Deterministic — same inputs always produce the same output.
 *   • Bounded — final score is always 0–100.
 *   • Explainable — returns a component breakdown alongside the score.
 *   • No double-counting — significance already incorporates confidence,
 *     source diversity, source trust, velocity, type weight, and entity
 *     spread.  Rank score adds only freshness decay and entity prominence
 *     as new, orthogonal factors.
 *   • No external I/O — pure function safe to call anywhere.
 *
 * Formula:
 *   rankScore = significance × W_sig + freshness × W_fresh + entityBoost × W_entity
 *
 * Where:
 *   significance  — persisted 0–100 from signalSignificance.ts (write-time composite)
 *   freshness     — exponential decay based on age: 100 × e^(-λ × ageHours)
 *   entityBoost   — 100 if the signal mentions a tracked/priority entity, else 0
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface RankScoreInput {
  /** Persisted significance score (0–100). Null/undefined → use fallback. */
  significanceScore: number | null | undefined;

  /** Persisted confidence score (0–100 integer or 0–1 float). Used as
   *  fallback when significanceScore is null (legacy rows). */
  confidenceScore: number | null | undefined;

  /** Signal creation timestamp (ISO 8601 or epoch ms). */
  createdAt: string | number;

  /** Whether this signal mentions a tracked/priority entity. */
  isTrackedEntity?: boolean;

  /** Optional: override "now" for deterministic testing. */
  now?: Date;
}

export interface RankScoreBreakdown {
  /** Raw significance component before weighting (0–100). */
  significance: number;
  /** Freshness component before weighting (0–100). */
  freshness: number;
  /** Entity boost component before weighting (0 or 100). */
  entityBoost: number;
  /** Whether significance was derived from a fallback. */
  significanceFallback: boolean;
}

export interface RankScoreResult {
  /** Final rank score clamped to [0, 100]. */
  rankScore: number;
  /** Per-component breakdown for debugging. */
  breakdown: RankScoreBreakdown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Weights (must sum to 1.0)
// ─────────────────────────────────────────────────────────────────────────────

export const RANK_WEIGHTS = {
  /** Significance carries most of the ranking weight. */
  significance: 0.65,
  /** Freshness rewards recency without overwhelming quality. */
  freshness: 0.25,
  /** Entity boost gives a small lift to tracked-entity signals. */
  entityBoost: 0.10,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Freshness decay
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Half-life in hours: a signal loses half its freshness value after this many
 * hours.  48 hours = 2 days means a 2-day-old signal still has 50% freshness,
 * a 4-day-old has 25%, etc.
 *
 * This balances rewarding timeliness without completely burying important
 * older signals (which still rank via their significance component).
 */
export const FRESHNESS_HALF_LIFE_HOURS = 48;

/** Decay constant λ = ln(2) / halfLife. */
const DECAY_LAMBDA = Math.LN2 / FRESHNESS_HALF_LIFE_HOURS;

/**
 * Compute freshness as an exponential decay from 100 (just created) → ~0.
 *
 * Formula: freshness = 100 × e^(-λ × ageHours)
 *
 * @param ageHours  Age of the signal in hours (non-negative).
 * @returns         Freshness score in [0, 100].
 */
export function computeFreshness(ageHours: number): number {
  if (ageHours <= 0) return 100;
  return Math.round(100 * Math.exp(-DECAY_LAMBDA * ageHours));
}

// ─────────────────────────────────────────────────────────────────────────────
// Core function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute a unified rank score for a signal.
 *
 * @param input  Rank score input with significance, timestamps, and entity flag.
 * @returns      { rankScore, breakdown } — score clamped to [0, 100] with
 *               per-component diagnostics.
 */
export function computeRankScore(input: RankScoreInput): RankScoreResult {
  const now = input.now ?? new Date();

  // ── Significance (0–100) ─────────────────────────────────────────────────
  let significance: number;
  let significanceFallback = false;

  if (input.significanceScore != null && input.significanceScore >= 0) {
    significance = Math.min(input.significanceScore, 100);
  } else if (input.confidenceScore != null) {
    // Legacy fallback: if confidence is 0–1, scale to 0–100; if already 0–100, use as-is.
    const raw = input.confidenceScore <= 1
      ? input.confidenceScore * 100
      : input.confidenceScore;
    significance = Math.min(Math.max(raw, 0), 100);
    significanceFallback = true;
  } else {
    significance = 40; // neutral default for rows with no scoring
    significanceFallback = true;
  }

  // ── Freshness (0–100) ───────────────────────────────────────────────────
  const createdDate = typeof input.createdAt === 'string'
    ? new Date(input.createdAt)
    : new Date(input.createdAt);
  const ageMs = now.getTime() - createdDate.getTime();
  const ageHours = Math.max(ageMs / (1000 * 60 * 60), 0);
  const freshness = computeFreshness(ageHours);

  // ── Entity boost (0 or 100) ──────────────────────────────────────────────
  const entityBoost = input.isTrackedEntity ? 100 : 0;

  // ── Weighted composite ───────────────────────────────────────────────────
  const raw =
    significance * RANK_WEIGHTS.significance +
    freshness    * RANK_WEIGHTS.freshness +
    entityBoost  * RANK_WEIGHTS.entityBoost;

  const rankScore = Math.round(Math.min(Math.max(raw, 0), 100));

  return {
    rankScore,
    breakdown: {
      significance,
      freshness,
      entityBoost,
      significanceFallback,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Comparator helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sort comparator: highest rank score first.  Stable tie-breaking by
 * most-recent createdAt.
 */
export function compareByRankScore(
  a: { rankScore: number; createdAt: string | number },
  b: { rankScore: number; createdAt: string | number },
): number {
  if (a.rankScore !== b.rankScore) return b.rankScore - a.rankScore;
  // Tie-break: more recent first
  const aTime = typeof a.createdAt === 'string' ? new Date(a.createdAt).getTime() : a.createdAt;
  const bTime = typeof b.createdAt === 'string' ? new Date(b.createdAt).getTime() : b.createdAt;
  return bTime - aTime;
}
