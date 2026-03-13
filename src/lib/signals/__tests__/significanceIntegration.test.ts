/**
 * Tests for significance integration across feed surfaces.
 *
 * Validates that:
 *   - significance-driven ordering works correctly
 *   - NULL/missing significance values fall back gracefully
 *   - blended ranking (opportunities) produces sensible results
 *   - mock data includes significance values for dev/prod parity
 *   - signal mode configs have correct minSignificance thresholds
 *
 * Run with: npx tsx --test src/lib/signals/__tests__/significanceIntegration.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeRankScore,
  compareByRankScore,
  type RankScoreInput,
} from '../rankScore';
import { SIGNAL_MODES, getModeConfig } from '../signalModes';
import { MOCK_SIGNALS } from '@/data/mockSignals';

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
// Mock data significance values
// ─────────────────────────────────────────────────────────────────────────────

describe('mock data — significance values', () => {
  it('all mock signals have significanceScore populated', () => {
    for (const signal of MOCK_SIGNALS) {
      assert.ok(
        signal.significanceScore != null,
        `Signal ${signal.id} (${signal.title}) should have a significanceScore`,
      );
    }
  });

  it('all mock signals have sourceSupportCount populated', () => {
    for (const signal of MOCK_SIGNALS) {
      assert.ok(
        signal.sourceSupportCount != null,
        `Signal ${signal.id} (${signal.title}) should have a sourceSupportCount`,
      );
    }
  });

  it('significanceScore values are in valid range [0, 100]', () => {
    for (const signal of MOCK_SIGNALS) {
      const score = signal.significanceScore!;
      assert.ok(
        score >= 0 && score <= 100,
        `Signal ${signal.id} significanceScore ${score} should be in [0, 100]`,
      );
    }
  });

  it('sourceSupportCount values are positive', () => {
    for (const signal of MOCK_SIGNALS) {
      const count = signal.sourceSupportCount!;
      assert.ok(
        count > 0,
        `Signal ${signal.id} sourceSupportCount ${count} should be positive`,
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Signal mode configs — minSignificance
// ─────────────────────────────────────────────────────────────────────────────

describe('signal mode configs — minSignificance', () => {
  it('raw mode has no significance filter (minSignificance = 0)', () => {
    const config = getModeConfig('raw');
    assert.equal(config.minSignificance, 0);
  });

  it('standard mode has no significance filter (minSignificance = 0)', () => {
    const config = getModeConfig('standard');
    assert.equal(config.minSignificance, 0);
  });

  it('premium mode requires significance >= 50', () => {
    const config = getModeConfig('premium');
    assert.equal(config.minSignificance, 50);
  });

  it('all modes have minSignificance defined', () => {
    for (const [mode, config] of Object.entries(SIGNAL_MODES)) {
      assert.ok(
        'minSignificance' in config,
        `Mode ${mode} should have minSignificance defined`,
      );
      assert.ok(
        typeof config.minSignificance === 'number',
        `Mode ${mode} minSignificance should be a number`,
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Significance-driven ordering
// ─────────────────────────────────────────────────────────────────────────────

describe('significance-driven ordering', () => {
  it('higher significance outranks lower significance at same freshness', () => {
    const high = computeRankScore(makeInput({ significanceScore: 90, createdAt: hoursAgo(6) }));
    const low = computeRankScore(makeInput({ significanceScore: 40, createdAt: hoursAgo(6) }));
    assert.ok(
      high.rankScore > low.rankScore,
      `High significance (${high.rankScore}) should outrank low (${low.rankScore})`,
    );
  });

  it('ordering by rankScore produces significance-weighted results', () => {
    const signals = [
      { sig: 50, age: 2 },
      { sig: 90, age: 12 },
      { sig: 30, age: 1 },
      { sig: 80, age: 24 },
    ].map((s) => {
      const result = computeRankScore(makeInput({
        significanceScore: s.sig,
        createdAt: hoursAgo(s.age),
      }));
      return { ...result, sig: s.sig, age: s.age, createdAt: hoursAgo(s.age) };
    });

    signals.sort(compareByRankScore);

    // The highest significance (90) should rank first even though it's 12h old
    assert.equal(signals[0].sig, 90, 'Most significant signal should rank first');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NULL significance fallback behavior
// ─────────────────────────────────────────────────────────────────────────────

describe('NULL significance fallback', () => {
  it('null significance falls back to confidence score', () => {
    const result = computeRankScore(makeInput({
      significanceScore: null,
      confidenceScore: 85,
    }));
    assert.equal(result.breakdown.significance, 85);
    assert.equal(result.breakdown.significanceFallback, true);
  });

  it('null significance + null confidence uses neutral default (40)', () => {
    const result = computeRankScore(makeInput({
      significanceScore: null,
      confidenceScore: null,
    }));
    assert.equal(result.breakdown.significance, 40);
    assert.equal(result.breakdown.significanceFallback, true);
  });

  it('undefined significance falls back to confidence score', () => {
    const result = computeRankScore(makeInput({
      significanceScore: undefined,
      confidenceScore: 70,
    }));
    assert.equal(result.breakdown.significance, 70);
    assert.equal(result.breakdown.significanceFallback, true);
  });

  it('signal with significance=0 uses 0, not fallback', () => {
    const result = computeRankScore(makeInput({
      significanceScore: 0,
      confidenceScore: 80,
    }));
    // significanceScore of 0 is valid (not null/undefined), so should NOT fall back
    assert.equal(result.breakdown.significance, 0);
    assert.equal(result.breakdown.significanceFallback, false);
  });

  it('legacy row (null significance) still produces a valid rankScore', () => {
    const result = computeRankScore(makeInput({
      significanceScore: null,
      confidenceScore: 0.75,
      createdAt: hoursAgo(48),
    }));
    assert.ok(result.rankScore >= 0 && result.rankScore <= 100);
  });

  it('scored row always ranks above unscored row (all else equal)', () => {
    const scored = computeRankScore(makeInput({
      significanceScore: 70,
      createdAt: hoursAgo(4),
    }));
    const unscored = computeRankScore(makeInput({
      significanceScore: null,
      confidenceScore: null,
      createdAt: hoursAgo(4),
    }));
    assert.ok(
      scored.rankScore > unscored.rankScore,
      `Scored (${scored.rankScore}) should outrank unscored/neutral (${unscored.rankScore})`,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Blended ranking (opportunities-style)
// ─────────────────────────────────────────────────────────────────────────────

describe('blended ranking for opportunities', () => {
  function blendedScore(baseScore: number, signal: Partial<RankScoreInput>): number {
    const { rankScore } = computeRankScore(makeInput(signal));
    return Math.round(baseScore * 0.7 + rankScore * 0.3);
  }

  it('high significance boosts opportunity score', () => {
    const baseScore = 60;
    const withHighSig = blendedScore(baseScore, { significanceScore: 95, createdAt: hoursAgo(2) });
    const withLowSig = blendedScore(baseScore, { significanceScore: 30, createdAt: hoursAgo(2) });
    assert.ok(
      withHighSig > withLowSig,
      `High significance blend (${withHighSig}) should beat low (${withLowSig})`,
    );
  });

  it('blended score stays within [0, 100]', () => {
    const maxBlend = blendedScore(100, { significanceScore: 100, createdAt: hoursAgo(0), isTrackedEntity: true });
    const minBlend = blendedScore(0, { significanceScore: 0, createdAt: hoursAgo(1000) });
    assert.ok(maxBlend <= 100, `Max blend should be <= 100, got ${maxBlend}`);
    assert.ok(minBlend >= 0, `Min blend should be >= 0, got ${minBlend}`);
  });

  it('base opportunity score still dominates (70% weight)', () => {
    // High base, low significance
    const highBase = blendedScore(90, { significanceScore: 20, createdAt: hoursAgo(2) });
    // Low base, high significance
    const highSig = blendedScore(30, { significanceScore: 95, createdAt: hoursAgo(2) });
    assert.ok(
      highBase > highSig,
      `High base (${highBase}) should still beat high significance alone (${highSig})`,
    );
  });

  it('null significance does not break blending', () => {
    const result = blendedScore(60, { significanceScore: null, confidenceScore: 80, createdAt: hoursAgo(6) });
    assert.ok(result >= 0 && result <= 100, `Blended with null significance should be valid: ${result}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cross-endpoint consistency
// ─────────────────────────────────────────────────────────────────────────────

describe('cross-endpoint consistency', () => {
  it('mock signals sorted by significanceScore match expected strategic order', () => {
    const sorted = [...MOCK_SIGNALS]
      .filter((s) => s.significanceScore != null)
      .sort((a, b) => (b.significanceScore ?? 0) - (a.significanceScore ?? 0));

    // Highest significance should be the most strategically important signal
    assert.ok(sorted[0].significanceScore! >= 80, 'Top signal should have high significance');
    // Verify ordering is strictly descending
    for (let i = 1; i < sorted.length; i++) {
      assert.ok(
        sorted[i - 1].significanceScore! >= sorted[i].significanceScore!,
        `Signals should be in descending significance order at index ${i}`,
      );
    }
  });

  it('rankScore ordering of mock signals preserves significance hierarchy for fresh signals', () => {
    const ranked = MOCK_SIGNALS
      .filter((s) => s.significanceScore != null)
      .map((s) => ({
        id: s.id,
        significanceScore: s.significanceScore!,
        createdAt: s.date,
        ...computeRankScore({
          significanceScore: s.significanceScore ?? null,
          confidenceScore: s.confidence,
          createdAt: s.date,
          now: NOW,
        }),
      }));

    ranked.sort(compareByRankScore);

    // The first ranked signal should have a high significance (significance
    // carries 65% weight, so it should dominate for similarly-aged signals)
    assert.ok(
      ranked[0].significanceScore >= 70,
      `Top ranked signal should have high significance, got ${ranked[0].significanceScore}`,
    );
  });
});
