/**
 * Omterminal — Opportunities API
 *
 * GET /api/opportunities
 *
 * Returns the top 20 ranked market opportunities derived from the latest
 * intelligence signals, together with an overall market-bias reading.
 *
 * Pipeline
 * ────────
 *  1. Fetch latest signals from DB (falls back to mock data)
 *  2. Map each signal → SignalInput and call computeSignalScore()
 *  3. Feed scored results into rankOpportunities() (top 20, score desc)
 *  4. Derive marketBias from the direction distribution of ranked signals
 *  5. Return { marketBias, signals, timestamp }
 *
 * Response shape
 * ──────────────
 *  {
 *    marketBias: "BULLISH" | "BEARISH" | "NEUTRAL"
 *    signals: [
 *      { rank, symbol, score, direction, velocity, volumeSpike, timestamp },
 *      …
 *    ]
 *    timestamp: string  // ISO-8601
 *  }
 */

import { NextResponse }        from 'next/server';
import { getSignals }          from '@/db/queries';
import { MOCK_SIGNALS }        from '@/data/mockSignals';
import { computeSignalScore }  from '@/lib/signals/signalScore';
import { rankOpportunities }   from '@/lib/signals/opportunityRanker';
import type { Signal }         from '@/data/mockSignals';
import type { SignalInput, TrendDirection } from '@/lib/signals/signalScore';
import type { SignalCandidate } from '@/lib/signals/opportunityRanker';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const RESULT_LIMIT         = 20;
const FETCH_LIMIT          = 60;  // fetch slightly more than we rank to give scorer headroom
const VOLUME_SPIKE_FLOOR   = 80;  // confidence >= 80 → treat as volume-spike signal
const VELOCITY_MAX         = 100; // confidence scale denominator for velocity mapping

// How much of the top-ranked signals must point one direction to call bias
const BIAS_THRESHOLD = 0.60;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map a signal category to a TrendDirection.
 *
 * Bullish categories (funding, model launches, research, product) → UP
 * Regulatory / compliance signals → DOWN (uncertainty)
 * Everything else                 → NEUTRAL
 */
function categoryToDirection(category: string): TrendDirection {
  switch (category) {
    case 'funding':
    case 'models':
    case 'research':
    case 'agents':
    case 'product':
      return 'UP';
    case 'regulation':
      return 'DOWN';
    default:
      return 'NEUTRAL';
  }
}

/**
 * Convert a frontend Signal (0-100 confidence) into a SignalInput suitable
 * for computeSignalScore().
 *
 * Mapping rationale
 * ─────────────────
 *  velocity      — confidence scaled from [0, 100] to [0, 5] (scorer's expected range)
 *  volumeSpike   — true when confidence >= VOLUME_SPIKE_FLOOR (high-conviction signal)
 *  trendDirection — derived from signal category
 *  momentum      — confidence normalized to [0, 1]
 *  liquidityScore — fixed at 0.70; no liquidity data available in the signal layer,
 *                   0.70 represents a moderate-liquidity prior rather than artificially
 *                   inflating or deflating scores
 */
function toSignalInput(signal: Signal): SignalInput {
  const direction = categoryToDirection(signal.category);
  const confidence01 = signal.confidence / VELOCITY_MAX;

  return {
    symbol:         signal.entityName || signal.id,
    velocity:       confidence01 * 5,
    volumeSpike:    signal.confidence >= VOLUME_SPIKE_FLOOR,
    trendDirection: direction,
    momentum:       confidence01,
    liquidityScore: 0.70,
  };
}

/**
 * Derive an overall market bias from the direction distribution of the
 * top-ranked signal candidates.
 *
 * Logic: if more than BIAS_THRESHOLD of ranked signals point UP → BULLISH,
 * if more than BIAS_THRESHOLD point DOWN → BEARISH, otherwise NEUTRAL.
 */
function computeMarketBias(candidates: SignalCandidate[]): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
  if (candidates.length === 0) return 'NEUTRAL';

  let up = 0;
  let down = 0;

  for (const c of candidates) {
    if (c.direction === 'UP')   up++;
    if (c.direction === 'DOWN') down++;
  }

  const total = candidates.length;

  if (up   / total > BIAS_THRESHOLD) return 'BULLISH';
  if (down / total > BIAS_THRESHOLD) return 'BEARISH';
  return 'NEUTRAL';
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  // ── 1. Fetch latest signals ───────────────────────────────────────────────
  let raw: Signal[];
  try {
    raw = await getSignals(FETCH_LIMIT);
    if (raw.length === 0) raw = MOCK_SIGNALS.slice(0, FETCH_LIMIT);
  } catch {
    raw = MOCK_SIGNALS.slice(0, FETCH_LIMIT);
  }

  // ── 2. Score each signal ──────────────────────────────────────────────────
  // computeSignalScore() is pure/synchronous — no async overhead.
  const candidates: SignalCandidate[] = raw.map((signal) => {
    const input  = toSignalInput(signal);
    const result = computeSignalScore(input);

    return {
      symbol:      result.symbol,
      score:       result.score,
      direction:   result.direction,
      velocity:    input.velocity,
      volumeSpike: input.volumeSpike,
    };
  });

  // ── 3. Rank (top 20, score descending) ───────────────────────────────────
  const ranked = rankOpportunities(candidates, { limit: RESULT_LIMIT });

  // ── 4. Market bias ────────────────────────────────────────────────────────
  // Bias is computed over the ranked set (post-filter), not the raw pool,
  // so it reflects the quality-weighted view of the market.
  const marketBias = computeMarketBias(ranked);

  // ── 5. Respond ────────────────────────────────────────────────────────────
  return NextResponse.json({
    marketBias,
    signals:   ranked,
    timestamp: new Date().toISOString(),
  });
}
