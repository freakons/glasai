/**
 * Tests for the unified rank score module.
 *
 * Run with: npx tsx --test src/lib/signals/__tests__/rankScore.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeRankScore,
  computeFreshness,
  compareByRankScore,
  FRESHNESS_HALF_LIFE_HOURS,
  RANK_WEIGHTS,
  type RankScoreInput,
} from '../rankScore';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const NOW = new Date('2026-03-13T12:00:00Z');

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();
}

function makeInput(overrides: Partial<RankScoreInput> = {}): RankScoreInput {
  return {
    significanceScore: 75,
    confidenceScore: 80,
    createdAt: hoursAgo(0),
    now: NOW,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Freshness decay
// ─────────────────────────────────────────────────────────────────────────────

describe('computeFreshness', () => {
  it('returns 100 for age 0', () => {
    assert.equal(computeFreshness(0), 100);
  });

  it('returns ~50 at the half-life', () => {
    const fresh = computeFreshness(FRESHNESS_HALF_LIFE_HOURS);
    assert.ok(fresh >= 49 && fresh <= 51, `Expected ~50 at half-life, got ${fresh}`);
  });

  it('returns ~25 at twice the half-life', () => {
    const fresh = computeFreshness(FRESHNESS_HALF_LIFE_HOURS * 2);
    assert.ok(fresh >= 24 && fresh <= 26, `Expected ~25 at 2x half-life, got ${fresh}`);
  });

  it('approaches 0 for very old signals', () => {
    const fresh = computeFreshness(FRESHNESS_HALF_LIFE_HOURS * 10);
    assert.ok(fresh <= 1, `Expected ~0 for very old signals, got ${fresh}`);
  });

  it('handles negative age as 100', () => {
    assert.equal(computeFreshness(-5), 100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeRankScore — basic behavior
// ─────────────────────────────────────────────────────────────────────────────

describe('computeRankScore — basic behavior', () => {
  it('returns a score in [0, 100]', () => {
    const result = computeRankScore(makeInput());
    assert.ok(result.rankScore >= 0 && result.rankScore <= 100);
  });

  it('returns a breakdown with all components', () => {
    const result = computeRankScore(makeInput());
    assert.ok('significance' in result.breakdown);
    assert.ok('freshness' in result.breakdown);
    assert.ok('entityBoost' in result.breakdown);
    assert.ok('significanceFallback' in result.breakdown);
  });

  it('uses significanceScore when available', () => {
    const result = computeRankScore(makeInput({ significanceScore: 90 }));
    assert.equal(result.breakdown.significance, 90);
    assert.equal(result.breakdown.significanceFallback, false);
  });

  it('falls back to confidenceScore when significance is null', () => {
    const result = computeRankScore(makeInput({ significanceScore: null, confidenceScore: 80 }));
    assert.equal(result.breakdown.significance, 80);
    assert.equal(result.breakdown.significanceFallback, true);
  });

  it('scales 0-1 confidence to 0-100', () => {
    const result = computeRankScore(makeInput({ significanceScore: null, confidenceScore: 0.85 }));
    assert.equal(result.breakdown.significance, 85);
    assert.equal(result.breakdown.significanceFallback, true);
  });

  it('uses neutral default when both are null', () => {
    const result = computeRankScore(makeInput({ significanceScore: null, confidenceScore: null }));
    assert.equal(result.breakdown.significance, 40);
    assert.equal(result.breakdown.significanceFallback, true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Core ranking scenarios
// ─────────────────────────────────────────────────────────────────────────────

describe('computeRankScore — ranking scenarios', () => {
  it('authoritative + significant + fresh signal ranks above weak/noisy one', () => {
    const strong = computeRankScore(makeInput({
      significanceScore: 95,
      createdAt: hoursAgo(2),
    }));
    const weak = computeRankScore(makeInput({
      significanceScore: 30,
      createdAt: hoursAgo(2),
    }));
    assert.ok(
      strong.rankScore > weak.rankScore,
      `Strong (${strong.rankScore}) should outrank weak (${weak.rankScore})`,
    );
  });

  it('fresh but low-trust item does NOT dominate everything', () => {
    // Low significance, very fresh
    const freshWeak = computeRankScore(makeInput({
      significanceScore: 20,
      createdAt: hoursAgo(0),
    }));
    // High significance, moderately old
    const oldStrong = computeRankScore(makeInput({
      significanceScore: 90,
      createdAt: hoursAgo(24),
    }));
    assert.ok(
      oldStrong.rankScore > freshWeak.rankScore,
      `Old strong (${oldStrong.rankScore}) should outrank fresh weak (${freshWeak.rankScore})`,
    );
  });

  it('older but very important item can still outrank trivial fresh item', () => {
    const importantOld = computeRankScore(makeInput({
      significanceScore: 100,
      createdAt: hoursAgo(72),
    }));
    const trivialFresh = computeRankScore(makeInput({
      significanceScore: 25,
      createdAt: hoursAgo(0),
    }));
    assert.ok(
      importantOld.rankScore > trivialFresh.rankScore,
      `Important old (${importantOld.rankScore}) should outrank trivial fresh (${trivialFresh.rankScore})`,
    );
  });

  it('entity-relevant signal gets a boost', () => {
    const tracked = computeRankScore(makeInput({
      significanceScore: 60,
      createdAt: hoursAgo(4),
      isTrackedEntity: true,
    }));
    const untracked = computeRankScore(makeInput({
      significanceScore: 60,
      createdAt: hoursAgo(4),
      isTrackedEntity: false,
    }));
    assert.ok(
      tracked.rankScore > untracked.rankScore,
      `Tracked (${tracked.rankScore}) should outrank untracked (${untracked.rankScore})`,
    );
  });

  it('entity boost is bounded — low significance with entity boost does not beat high significance', () => {
    const lowWithBoost = computeRankScore(makeInput({
      significanceScore: 30,
      createdAt: hoursAgo(4),
      isTrackedEntity: true,
    }));
    const highNoBoost = computeRankScore(makeInput({
      significanceScore: 90,
      createdAt: hoursAgo(4),
      isTrackedEntity: false,
    }));
    assert.ok(
      highNoBoost.rankScore > lowWithBoost.rankScore,
      `High significance (${highNoBoost.rankScore}) should still beat low+boost (${lowWithBoost.rankScore})`,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Ordering stability
// ─────────────────────────────────────────────────────────────────────────────

describe('computeRankScore — ordering stability', () => {
  it('score is deterministic for the same inputs', () => {
    const input = makeInput({ significanceScore: 70, createdAt: hoursAgo(12) });
    const a = computeRankScore(input);
    const b = computeRankScore(input);
    assert.equal(a.rankScore, b.rankScore);
  });

  it('scores are bounded within [0, 100]', () => {
    const extreme1 = computeRankScore(makeInput({
      significanceScore: 100,
      createdAt: hoursAgo(0),
      isTrackedEntity: true,
    }));
    const extreme2 = computeRankScore(makeInput({
      significanceScore: 0,
      confidenceScore: 0,
      createdAt: hoursAgo(10000),
      isTrackedEntity: false,
    }));
    assert.ok(extreme1.rankScore <= 100, `Max case should be <= 100: ${extreme1.rankScore}`);
    assert.ok(extreme2.rankScore >= 0, `Min case should be >= 0: ${extreme2.rankScore}`);
  });

  it('weights sum to 1.0', () => {
    const sum = RANK_WEIGHTS.significance + RANK_WEIGHTS.freshness + RANK_WEIGHTS.entityBoost;
    assert.ok(Math.abs(sum - 1.0) < 0.001, `Weights should sum to 1.0, got ${sum}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// compareByRankScore
// ─────────────────────────────────────────────────────────────────────────────

describe('compareByRankScore', () => {
  it('sorts higher rank scores first', () => {
    const items = [
      { rankScore: 50, createdAt: hoursAgo(1) },
      { rankScore: 90, createdAt: hoursAgo(2) },
      { rankScore: 70, createdAt: hoursAgo(3) },
    ];
    items.sort(compareByRankScore);
    assert.deepEqual(items.map(i => i.rankScore), [90, 70, 50]);
  });

  it('breaks ties by most recent createdAt', () => {
    const items = [
      { rankScore: 75, createdAt: hoursAgo(10) },
      { rankScore: 75, createdAt: hoursAgo(1) },
      { rankScore: 75, createdAt: hoursAgo(5) },
    ];
    items.sort(compareByRankScore);
    // Most recent (1 hour ago) should come first
    assert.equal(items[0].createdAt, hoursAgo(1));
    assert.equal(items[2].createdAt, hoursAgo(10));
  });
});
