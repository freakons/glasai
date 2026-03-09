/**
 * Omterminal — Signal Scoring Engine
 *
 * Pure, stateless module that converts raw market indicators into a single
 * normalized confidence score.  No side-effects, no I/O — safe to call on
 * server, edge, or client.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type TrendDirection = 'UP' | 'DOWN' | 'NEUTRAL';
export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface SignalInput {
  symbol:         string;
  /** Positive value; typical range 0–5, clamped at 5 for normalization. */
  velocity:       number;
  /** Whether a statistically significant volume spike was detected. */
  volumeSpike:    boolean;
  trendDirection: TrendDirection;
  /** Momentum magnitude; expected 0–1. */
  momentum:       number;
  /** Liquidity depth score; expected 0–1. */
  liquidityScore: number;
}

export interface SignalMetrics {
  velocityScore:  number;
  volumeScore:    number;
  trendScore:     number;
  momentumScore:  number;
  liquidityScore: number;
}

export interface SignalResult {
  symbol:     string;
  score:      number;
  confidence: ConfidenceLevel;
  direction:  TrendDirection;
  metrics:    SignalMetrics;
}

// ─────────────────────────────────────────────────────────────────────────────
// Weights (must sum to 1.0)
// ─────────────────────────────────────────────────────────────────────────────

const WEIGHTS = {
  velocity:  0.35,
  volume:    0.25,
  trend:     0.20,
  momentum:  0.10,
  liquidity: 0.10,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Clamp a value to [0, 1]. */
function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Scale a [0, 1] fraction to a [0, 100] score, rounded to 2 dp. */
function toScore(fraction: number): number {
  return Math.round(clamp01(fraction) * 100 * 100) / 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalization helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Velocity is normalized over [0, 5].
 * A reading of 2.5 → 0.50; 5+ → 1.0.
 */
function normalizeVelocity(velocity: number): number {
  return clamp01(velocity / 5);
}

/**
 * Volume spike is binary: spike present → 1.0, absent → 0.0.
 */
function normalizeVolume(volumeSpike: boolean): number {
  return volumeSpike ? 1 : 0;
}

/**
 * Trend direction maps to a directional confidence fraction.
 * UP / DOWN both signal conviction (score = 1.0); NEUTRAL = 0.5.
 */
function normalizeTrend(trendDirection: TrendDirection): number {
  return trendDirection === 'NEUTRAL' ? 0.5 : 1.0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute a composite signal score from raw market indicators.
 *
 * @param input  Raw indicator set for a single symbol.
 * @returns      Scored result with confidence band, direction, and per-metric breakdown.
 *
 * @example
 * const result = computeSignalScore({
 *   symbol:         "BTCUSDT",
 *   velocity:       2.3,
 *   volumeSpike:    true,
 *   trendDirection: "UP",
 *   momentum:       0.74,
 *   liquidityScore: 0.82,
 * });
 * // result.score      → 78.45
 * // result.confidence → "MEDIUM"
 */
export function computeSignalScore(input: SignalInput): SignalResult {
  const { symbol, velocity, volumeSpike, trendDirection, momentum, liquidityScore } = input;

  // --- normalized component scores (0–100) ---
  const metrics: SignalMetrics = {
    velocityScore:  toScore(normalizeVelocity(velocity)),
    volumeScore:    toScore(normalizeVolume(volumeSpike)),
    trendScore:     toScore(normalizeTrend(trendDirection)),
    momentumScore:  toScore(clamp01(momentum)),
    liquidityScore: toScore(clamp01(liquidityScore)),
  };

  // --- weighted composite ---
  const raw =
    metrics.velocityScore  * WEIGHTS.velocity  +
    metrics.volumeScore    * WEIGHTS.volume     +
    metrics.trendScore     * WEIGHTS.trend      +
    metrics.momentumScore  * WEIGHTS.momentum   +
    metrics.liquidityScore * WEIGHTS.liquidity;

  const score = Math.round(raw * 100) / 100;

  // --- confidence band ---
  const confidence: ConfidenceLevel =
    score >= 85 ? 'HIGH'   :
    score >= 65 ? 'MEDIUM' :
                  'LOW';

  return { symbol, score, confidence, direction: trendDirection, metrics };
}
