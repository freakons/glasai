/**
 * Omterminal — Trend Evolution Analytics
 *
 * Computes how signal activity within a trend cluster changes over time.
 * Transforms clusters from static groups into dynamic trend indicators
 * by analysing daily signal counts, growth rate, and velocity.
 */

import type { Signal } from '@/data/mockSignals';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface DailyCount {
  /** ISO date string (YYYY-MM-DD) */
  date: string;
  /** Number of signals on this day */
  count: number;
}

export type TrendStatus = 'rising' | 'stable' | 'cooling';

export interface TrendEvolution {
  /** Daily signal counts over the analysis window */
  dailyCounts: DailyCount[];
  /** Total signals in the recent half of the window */
  recentTotal: number;
  /** Total signals in the earlier half of the window */
  previousTotal: number;
  /** Growth rate: (recent - previous) / max(previous, 1) */
  growthRate: number;
  /** Derived trend status */
  status: TrendStatus;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Format a Date as YYYY-MM-DD */
function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Derive trend status from recent vs previous signal counts.
 *
 *   recent > previous * 1.5 → rising
 *   recent < previous * 0.6 → cooling
 *   otherwise               → stable
 */
function deriveStatus(recent: number, previous: number): TrendStatus {
  if (recent > previous * 1.5) return 'rising';
  if (recent < previous * 0.6) return 'cooling';
  return 'stable';
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the evolution analytics for a set of signals within a trend cluster.
 *
 * Analyses a 7-day window ending at `now` (defaults to current date).
 * The window is split into two halves:
 *   - previous: days 7–4 (3 days)
 *   - recent:   days 3–0 (4 days, including today)
 *
 * @param signals - Signals belonging to the trend cluster
 * @param now     - Reference date (defaults to Date.now)
 */
export function computeTrendEvolution(
  signals: Signal[],
  now?: Date,
): TrendEvolution {
  const reference = now ?? new Date();
  const windowDays = 7;

  // Build a map of date → count for the window
  const countMap = new Map<string, number>();

  // Pre-fill all days in the window so we get zero-count entries
  for (let i = 0; i < windowDays; i++) {
    const d = new Date(reference);
    d.setDate(d.getDate() - i);
    countMap.set(toDateKey(d), 0);
  }

  // Count signals per day
  const cutoff = new Date(reference);
  cutoff.setDate(cutoff.getDate() - windowDays);

  for (const signal of signals) {
    const signalDate = new Date(signal.date);
    if (signalDate < cutoff || signalDate > reference) continue;

    const key = toDateKey(signalDate);
    if (countMap.has(key)) {
      countMap.set(key, countMap.get(key)! + 1);
    }
  }

  // Build sorted daily counts (oldest first)
  const dailyCounts: DailyCount[] = Array.from(countMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  // Split window: first 3 days = previous, last 4 days = recent
  const splitIndex = 3;
  let previousTotal = 0;
  let recentTotal = 0;

  for (let i = 0; i < dailyCounts.length; i++) {
    if (i < splitIndex) {
      previousTotal += dailyCounts[i].count;
    } else {
      recentTotal += dailyCounts[i].count;
    }
  }

  const growthRate = (recentTotal - previousTotal) / Math.max(previousTotal, 1);
  const status = deriveStatus(recentTotal, previousTotal);

  return {
    dailyCounts,
    recentTotal,
    previousTotal,
    growthRate,
    status,
  };
}
