/**
 * Omterminal — Signal Quality Mode Definitions
 *
 * Centralised, authoritative definitions for the three signal quality modes:
 *
 *   raw      — high-volume, minimal filtering
 *              intended for internal monitoring, debug, and admin views
 *
 *   standard — balanced filtering
 *              the default public product mode
 *
 *   premium  — strongest quality / ranking threshold
 *              best signals only; reserved for future paid / executive surfaces
 *
 * Modes control:
 *   - Minimum confidence score required to surface a signal (read path)
 *   - Which signal statuses are eligible for display (read path)
 *   - Default maximum result count (read path)
 *   - Cluster minCount multiplier used by the signals engine (write path)
 *
 * Architecture notes:
 *   - Add new mode variants here only; never scatter thresholds in routes or queries.
 *   - The read path (queries.ts, API routes) consumes SignalModeConfig.
 *   - The write path (signalEngine.ts) optionally consumes engineMinCountMultiplier.
 *   - DEFAULT_SIGNAL_MODE drives all public-facing surfaces by default.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SignalMode = 'raw' | 'standard' | 'premium';

export interface SignalModeConfig {
  /** Human-readable label. */
  label: string;

  /** Brief description of intended use. */
  description: string;

  /**
   * Minimum confidence score (0–100 integer scale) required to surface a
   * signal on the read path.
   *
   * Corresponds to the `confidence` integer column, or derived from
   * `confidence_score` (NUMERIC 0-1) × 100 when the integer column is absent.
   *
   * 0 = no filtering; signals with any confidence are included.
   */
  minConfidence: number;

  /**
   * Set of signal `status` values eligible for this mode.
   *
   * null means "include everything except 'rejected'".
   * A non-null array restricts results to only those statuses
   * (plus rows where status IS NULL, treated as 'auto').
   */
  allowedStatuses: string[] | null;

  /**
   * Default upper limit on the number of signals returned by getSignals()
   * when called in this mode.  Callers may request fewer; this acts as a cap.
   */
  defaultLimit: number;

  /**
   * Multiplier applied to each detection rule's minCount when the signals
   * engine runs in this mode (write path / generation time).
   *
   *   < 1.0 → lower threshold → more, potentially weaker, signals generated
   *   = 1.0 → unchanged (standard behaviour)
   *   > 1.0 → raise threshold → fewer, higher-confidence signals generated
   *
   * The resolved per-rule minCount is always clamped to a minimum of 1.
   */
  engineMinCountMultiplier: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode definitions
// ─────────────────────────────────────────────────────────────────────────────

export const SIGNAL_MODES: Record<SignalMode, SignalModeConfig> = {
  /**
   * raw — High-volume, minimal filtering.
   *
   * Read path:  All non-rejected signals regardless of confidence.
   *             Includes 'internal' and 'review' status signals.
   * Write path: engineMinCountMultiplier = 0.5, so cluster thresholds are
   *             halved (minimum 1), allowing individual events to become signals.
   *             Useful for surfacing weak-but-interesting patterns for review.
   */
  raw: {
    label:                    'Raw',
    description:              'High-volume, minimal filtering. For internal monitoring, debug, and admin views.',
    minConfidence:            0,
    allowedStatuses:          null, // everything except 'rejected'
    defaultLimit:             200,
    engineMinCountMultiplier: 0.5,
  },

  /**
   * standard — Balanced filtering.
   *
   * Read path:  Only 'auto' and 'published' signals with confidence ≥ 65.
   *             Ordered by significance_score DESC (composite quality metric),
   *             then confidence_score, then created_at for tie-breaking.
   *             This is the sane default for public-facing intelligence surfaces.
   * Write path: Default engine thresholds (multiplier = 1.0, unchanged).
   */
  standard: {
    label:                    'Standard',
    description:              'Balanced filtering. Default public product mode.',
    minConfidence:            65,
    allowedStatuses:          ['auto', 'published'],
    defaultLimit:             50,
    engineMinCountMultiplier: 1.0,
  },

  /**
   * premium — Maximum quality, strictest filtering.
   *
   * Read path:  Only 'auto' and 'published' signals with confidence ≥ 85.
   *             Ordered by significance_score DESC (same as standard) for
   *             consistent ranking logic across all quality tiers.
   *             Surfaces only the highest-conviction signals.
   *             Intended for future paid / executive intelligence surfaces.
   * Write path: Same generation thresholds as standard (multiplier = 1.0);
   *             the additional selectivity is applied on the read path only.
   */
  premium: {
    label:                    'Premium',
    description:              'Strongest quality threshold. Best signals only. For future paid/executive surfaces.',
    minConfidence:            85,
    allowedStatuses:          ['auto', 'published'],
    defaultLimit:             20,
    engineMinCountMultiplier: 1.0,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The mode used on all public-facing surfaces when no explicit mode is requested.
 * Change this value here — nowhere else — to shift the platform default.
 */
export const DEFAULT_SIGNAL_MODE: SignalMode = 'standard';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runtime type guard — returns true only for the three known mode strings.
 *
 * @example
 * const raw = searchParams.get('mode');
 * const mode = isSignalMode(raw) ? raw : DEFAULT_SIGNAL_MODE;
 */
export function isSignalMode(v: unknown): v is SignalMode {
  return v === 'raw' || v === 'standard' || v === 'premium';
}

/**
 * Resolve a SignalMode to its full configuration object.
 *
 * This is a direct lookup with no fallback — callers should validate with
 * isSignalMode() before calling, or pass a literal SignalMode value.
 */
export function getModeConfig(mode: SignalMode): SignalModeConfig {
  return SIGNAL_MODES[mode];
}

/**
 * Parse a raw string (e.g. from a query param) into a SignalMode,
 * falling back to DEFAULT_SIGNAL_MODE for unknown or missing values.
 */
export function parseSignalMode(raw: string | null | undefined): SignalMode {
  return isSignalMode(raw) ? raw : DEFAULT_SIGNAL_MODE;
}
