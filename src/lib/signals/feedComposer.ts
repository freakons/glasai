/**
 * Omterminal — Feed Composer
 *
 * Post-query composition layer that transforms a rank-ordered list of signals
 * into a curated feed.  Applied after DB retrieval and rank scoring, before
 * returning to the client.
 *
 * Responsibilities:
 *   1. Diversity guardrails — prevent consecutive runs of the same entity,
 *      category, or source from dominating the feed.
 *   2. Duplicate suppression — detect near-duplicate titles and collapse them.
 *   3. Significance gating — suppress low-significance noise from the main feed.
 *   4. Stable, deterministic ordering — same inputs always produce same output.
 *
 * Design constraints:
 *   • Pure function — no I/O, no side effects.
 *   • Works on the Signal interface returned by queries.ts.
 *   • Preserves rank score ordering as the primary sort, then applies
 *     diversity re-ordering as a second pass.
 */

import type { Signal } from '@/data/mockSignals';
import { computeRankScore, type RankScoreResult } from './rankScore';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface FeedComposerConfig {
  /**
   * Maximum number of consecutive items from the same entity before a
   * different-entity item is interleaved.  Default: 2.
   */
  maxConsecutiveEntity: number;

  /**
   * Maximum number of consecutive items from the same category before a
   * different-category item is interleaved.  Default: 3.
   */
  maxConsecutiveCategory: number;

  /**
   * Minimum significance score to include in the feed.
   * Items below this threshold are filtered out.  Default: 0 (no filtering).
   * Only applies to items that have a significance score set.
   */
  minSignificance: number;

  /**
   * Title similarity threshold (0–1) for near-duplicate detection.
   * Titles with similarity >= this value are treated as duplicates.
   * Default: 0.7.
   */
  duplicateSimilarityThreshold: number;

  /**
   * Whether to attach rank score metadata to each signal.
   * Enables the frontend to display significance indicators.  Default: true.
   */
  attachRankMetadata: boolean;
}

export const DEFAULT_FEED_CONFIG: FeedComposerConfig = {
  maxConsecutiveEntity: 2,
  maxConsecutiveCategory: 3,
  minSignificance: 0,
  duplicateSimilarityThreshold: 0.7,
  attachRankMetadata: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// Rank metadata attached to signals
// ─────────────────────────────────────────────────────────────────────────────

export interface SignalWithRankMeta extends Signal {
  /** Computed rank score (0–100). */
  _rankScore?: number;
  /** Significance tier derived from significance score. */
  _significanceTier?: 'critical' | 'high' | 'standard' | 'low';
  /** Number of corroborating sources (pass-through from signal). */
  _sourceCount?: number;
}

/**
 * Derive a human-readable significance tier from a numeric score.
 */
export function getSignificanceTier(
  score: number | null | undefined,
): 'critical' | 'high' | 'standard' | 'low' {
  if (score == null) return 'standard';
  if (score >= 85) return 'critical';
  if (score >= 65) return 'high';
  if (score >= 40) return 'standard';
  return 'low';
}

// ─────────────────────────────────────────────────────────────────────────────
// Near-duplicate detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalise a title for comparison: lowercase, strip punctuation, collapse spaces.
 */
function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compute bigram similarity between two strings (Dice coefficient).
 * Returns a value in [0, 1] where 1 = identical.
 */
export function bigramSimilarity(a: string, b: string): number {
  const na = normaliseTitle(a);
  const nb = normaliseTitle(b);
  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return 0;

  const bigramsA = new Set<string>();
  for (let i = 0; i < na.length - 1; i++) bigramsA.add(na.slice(i, i + 2));

  const bigramsB = new Set<string>();
  for (let i = 0; i < nb.length - 1; i++) bigramsB.add(nb.slice(i, i + 2));

  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }

  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

/**
 * Remove near-duplicate signals based on title similarity.
 * Keeps the first (higher-ranked) occurrence.
 */
function deduplicateByTitle(
  signals: Signal[],
  threshold: number,
): Signal[] {
  const result: Signal[] = [];
  const seenTitles: string[] = [];

  for (const signal of signals) {
    const norm = normaliseTitle(signal.title);
    const isDuplicate = seenTitles.some(
      (seen) => bigramSimilarity(norm, seen) >= threshold,
    );
    if (!isDuplicate) {
      result.push(signal);
      seenTitles.push(norm);
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Diversity re-ordering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Re-order signals to enforce diversity constraints without changing the
 * overall set.  Uses a greedy approach: walk through the rank-ordered list
 * and place each item, deferring items that would violate consecutive-run
 * limits.  Deferred items are placed at the next valid position.
 *
 * This preserves rank order as much as possible while breaking up monotonous
 * runs of the same entity or category.
 */
function applyDiversityGuardrails(
  signals: Signal[],
  maxConsecutiveEntity: number,
  maxConsecutiveCategory: number,
): Signal[] {
  if (signals.length <= 1) return signals;

  const result: Signal[] = [];
  const deferred: Signal[] = [];
  const remaining = [...signals];

  while (remaining.length > 0 || deferred.length > 0) {
    let placed = false;

    // Try to place from remaining first, then deferred
    const candidates = [...remaining, ...deferred];
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      if (canPlace(result, candidate, maxConsecutiveEntity, maxConsecutiveCategory)) {
        result.push(candidate);
        // Remove from whichever list it came from
        if (i < remaining.length) {
          remaining.splice(i, 1);
        } else {
          deferred.splice(i - remaining.length, 1);
        }
        placed = true;
        break;
      }
    }

    if (!placed) {
      // No candidate can be placed without violating constraints.
      // Force-place the highest-ranked remaining item to avoid infinite loop.
      if (remaining.length > 0) {
        result.push(remaining.shift()!);
      } else if (deferred.length > 0) {
        result.push(deferred.shift()!);
      }
    }
  }

  return result;
}

/**
 * Check if placing a signal at the end of the current result would violate
 * consecutive-run limits.
 */
function canPlace(
  result: Signal[],
  candidate: Signal,
  maxEntity: number,
  maxCategory: number,
): boolean {
  if (result.length === 0) return true;

  // Check entity run
  let entityRun = 0;
  for (let i = result.length - 1; i >= 0 && i >= result.length - maxEntity; i--) {
    if (result[i].entityId === candidate.entityId) entityRun++;
    else break;
  }
  if (entityRun >= maxEntity) return false;

  // Check category run
  let categoryRun = 0;
  for (let i = result.length - 1; i >= 0 && i >= result.length - maxCategory; i--) {
    if (result[i].category === candidate.category) categoryRun++;
    else break;
  }
  if (categoryRun >= maxCategory) return false;

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compose a curated feed from a raw list of signals.
 *
 * Pipeline:
 *   1. Compute rank scores and sort by rank
 *   2. Filter by minimum significance
 *   3. Deduplicate near-identical titles
 *   4. Apply diversity guardrails
 *   5. Optionally attach rank metadata
 *
 * @param signals  Raw signals from the database (already filtered by mode).
 * @param config   Feed composition configuration.
 * @returns        Curated, ordered feed of signals.
 */
export function composeFeed(
  signals: Signal[],
  config: Partial<FeedComposerConfig> = {},
): SignalWithRankMeta[] {
  const cfg = { ...DEFAULT_FEED_CONFIG, ...config };

  if (signals.length === 0) return [];

  // 1. Compute rank scores and sort
  const scored = signals.map((signal) => {
    const result = computeRankScore({
      significanceScore: signal.significanceScore ?? null,
      confidenceScore: signal.confidence,
      createdAt: signal.date,
    });
    return { signal, rankResult: result };
  });

  scored.sort((a, b) => {
    if (a.rankResult.rankScore !== b.rankResult.rankScore) {
      return b.rankResult.rankScore - a.rankResult.rankScore;
    }
    // Tie-break by date (most recent first)
    return new Date(b.signal.date).getTime() - new Date(a.signal.date).getTime();
  });

  let ordered = scored.map((s) => s.signal);

  // 2. Filter by minimum significance
  if (cfg.minSignificance > 0) {
    ordered = ordered.filter((s) => {
      // Items without a significance score pass through (legacy compat)
      if (s.significanceScore == null) return true;
      return s.significanceScore >= cfg.minSignificance;
    });
  }

  // 3. Deduplicate near-identical titles
  ordered = deduplicateByTitle(ordered, cfg.duplicateSimilarityThreshold);

  // 4. Apply diversity guardrails
  ordered = applyDiversityGuardrails(
    ordered,
    cfg.maxConsecutiveEntity,
    cfg.maxConsecutiveCategory,
  );

  // 5. Attach rank metadata
  if (cfg.attachRankMetadata) {
    const rankMap = new Map<string, RankScoreResult>();
    for (const { signal, rankResult } of scored) {
      rankMap.set(signal.id, rankResult);
    }

    return ordered.map((signal) => {
      const rank = rankMap.get(signal.id);
      return {
        ...signal,
        _rankScore: rank?.rankScore ?? 0,
        _significanceTier: getSignificanceTier(signal.significanceScore),
        _sourceCount: signal.sourceSupportCount ?? undefined,
      };
    });
  }

  return ordered;
}
