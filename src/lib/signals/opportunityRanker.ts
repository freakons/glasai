/**
 * Omterminal — Opportunity Ranking Engine
 *
 * Pure, stateless module that ranks market signals by strength and returns
 * the top N opportunities.  Designed for low-latency real-time updates:
 * no allocations beyond the output array, no external dependencies.
 */

import type { TrendDirection } from './signalScore';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SignalCandidate {
  symbol:       string;
  score:        number;
  direction:    TrendDirection;
  velocity?:    number;
  volumeSpike?: boolean;
}

export interface RankedOpportunity extends SignalCandidate {
  rank:      number;
  timestamp: number;
}

export interface RankOptions {
  /** Maximum number of results to return. Defaults to 20. */
  limit?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_LIMIT = 20;

// ─────────────────────────────────────────────────────────────────────────────
// Core
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rank market signals by score and return the top opportunities.
 *
 * Optimised for real-time call patterns:
 * - Input array is **not mutated** — sorting is done on a shallow copy.
 * - Ranking stops once the requested `limit` is reached (no over-allocation).
 * - O(n log n) sort, then O(limit) slice — suitable for hundreds of symbols.
 *
 * @param signals  Array of scored signal objects.
 * @param options  Optional configuration (e.g. custom result limit).
 * @returns        Ranked array, highest score first, with a 1-based `rank` field.
 *
 * @example
 * const ranked = rankOpportunities([
 *   { symbol: "BTCUSDT",  score: 87, direction: "UP",   velocity: 1.8, volumeSpike: true  },
 *   { symbol: "SOLUSDT",  score: 91, direction: "UP",   velocity: 3.1, volumeSpike: true  },
 *   { symbol: "ETHUSDT",  score: 72, direction: "DOWN", velocity: 0.9, volumeSpike: false },
 * ]);
 * // ranked[0] → { rank: 1, symbol: "SOLUSDT", score: 91, timestamp: <ms>, … }
 * // ranked[1] → { rank: 2, symbol: "BTCUSDT", score: 87, timestamp: <ms>, … }
 */
export function rankOpportunities(
  signals: SignalCandidate[],
  options: RankOptions = {},
): RankedOpportunity[] {
  const limit = options.limit ?? DEFAULT_LIMIT;

  if (signals.length === 0) return [];

  // Snapshot timestamp once per call so all results share the same instant.
  const timestamp = Date.now();

  // Shallow copy to avoid mutating caller's array, then sort descending by score.
  // Ties are broken by symbol (alphabetical) for deterministic ordering.
  const sorted = signals
    .slice()
    .sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol));

  const top = sorted.length > limit ? sorted.slice(0, limit) : sorted;

  // Assign 1-based rank and shared timestamp inline — avoids a second map pass.
  const result: RankedOpportunity[] = new Array(top.length);
  for (let i = 0; i < top.length; i++) {
    result[i] = { ...top[i], rank: i + 1, timestamp };
  }

  return result;
}
