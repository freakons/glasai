/**
 * Omterminal — Signal Momentum Scoring
 *
 * Derives a momentum level from recent vs previous activity windows.
 * Momentum represents whether activity around a signal is accelerating,
 * stable, or fading — distinct from confidence (trustworthiness),
 * impact (importance), and corroboration (evidence breadth).
 *
 * Current logic uses supporting event counts in two 7-day windows.
 * Designed for future expansion with article velocity, corroboration
 * growth, entity spread, and cross-ecosystem trend scoring.
 */

export type MomentumLevel = 'new' | 'rising' | 'stable' | 'cooling';

export interface MomentumResult {
  /** Derived momentum level. */
  level: MomentumLevel;
  /** Activity count in the recent window (last 7 days). */
  recentCount: number;
  /** Activity count in the previous window (8–14 days ago). */
  previousCount: number;
}

export interface MomentumInput {
  /** Number of supporting events in the recent window (last 7 days). */
  recentCount: number;
  /** Number of supporting events in the previous window (8–14 days ago). */
  previousCount: number;
}

/**
 * Compute the momentum level for a signal.
 *
 * Rules:
 *   - new:     previousCount = 0 AND recentCount > 0
 *   - rising:  recentCount > previousCount × 1.5 (at least 50% increase)
 *   - cooling: recentCount < previousCount × 0.6 (at least 40% decrease)
 *   - stable:  everything else (counts are close or both zero)
 *
 * When both windows are zero, defaults to "stable" — the signal exists
 * but has no recent measurable activity in either window.
 */
export function computeMomentum(input: MomentumInput): MomentumResult {
  const { recentCount, previousCount } = input;

  let level: MomentumLevel;

  if (recentCount === 0 && previousCount === 0) {
    // No activity in either window — stable by default
    level = 'stable';
  } else if (previousCount === 0 && recentCount > 0) {
    // Activity appeared with no prior baseline
    level = 'new';
  } else if (recentCount > previousCount * 1.5) {
    // Meaningful increase (>50% more activity)
    level = 'rising';
  } else if (recentCount < previousCount * 0.6) {
    // Meaningful decrease (>40% drop)
    level = 'cooling';
  } else {
    level = 'stable';
  }

  return { level, recentCount, previousCount };
}
