/**
 * Tests for entity intelligence computations.
 *
 * Covers the pure-logic portions of the entity intelligence API:
 * velocity scoring, trend detection, and response shaping.
 *
 * Run with: npx tsx --test src/lib/__tests__/entityIntelligence.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─────────────────────────────────────────────────────────────────────────────
// Extracted logic from /api/entities/[name]/route.ts for testability
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes velocity score — matches the API route logic exactly.
 * Velocity = weighted combination of 24h and 7d density, normalized 0–100.
 */
export function computeVelocity(count24h: number, count7d: number): number {
  const VELOCITY_SATURATION = 100;
  const rawVelocity = (count24h * 0.6) + ((count7d / 7) * 0.4);
  return Math.min((rawVelocity / VELOCITY_SATURATION) * 100, 100);
}

/**
 * Computes trend direction — matches the API route logic exactly.
 */
export function computeTrend(count7d: number, count30d: number): 'rising' | 'falling' | 'stable' {
  const prior7d = count30d - count7d;
  return count7d > prior7d * 1.2 ? 'rising' :
         count7d < prior7d * 0.8 ? 'falling' : 'stable';
}

/**
 * Determines if a signal is a "major" highlight (significance ≥ 65).
 */
export function isMajorSignal(significanceScore: number | null): boolean {
  return (significanceScore ?? 0) >= 65;
}

/**
 * Groups related entities by type.
 */
export function groupRelatedByType(
  entities: Array<{ name: string; type: string; mentions: number }>,
): Record<string, Array<{ name: string; mentions: number }>> {
  const groups: Record<string, Array<{ name: string; mentions: number }>> = {};
  for (const e of entities) {
    const key = e.type || 'other';
    if (!groups[key]) groups[key] = [];
    groups[key].push({ name: e.name, mentions: e.mentions });
  }
  return groups;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests: computeVelocity
// ─────────────────────────────────────────────────────────────────────────────

describe('computeVelocity', () => {
  it('returns 0 when no signals', () => {
    assert.equal(computeVelocity(0, 0), 0);
  });

  it('weighs 24h signals at 60%', () => {
    // 10 signals in 24h, 0 in 7d
    // rawVelocity = 10 * 0.6 + 0 = 6
    // score = (6/100)*100 = 6
    assert.equal(computeVelocity(10, 0), 6);
  });

  it('weighs 7d signals at 40% daily average', () => {
    // 0 signals in 24h, 70 in 7d
    // rawVelocity = 0 + (70/7)*0.4 = 4
    // score = (4/100)*100 = 4
    assert.equal(computeVelocity(0, 70), 4);
  });

  it('combines both windows', () => {
    // 10 in 24h, 70 in 7d
    // rawVelocity = 6 + 4 = 10
    const v = computeVelocity(10, 70);
    assert.equal(v, 10);
  });

  it('caps at 100', () => {
    assert.equal(computeVelocity(200, 700), 100);
  });

  it('handles very high 24h with moderate 7d', () => {
    // 100 in 24h, 100 in 7d
    // rawVelocity = 60 + (100/7)*0.4 ≈ 65.71
    const v = computeVelocity(100, 100);
    assert.ok(v > 60 && v < 70, `Expected 60 < ${v} < 70`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: computeTrend
// ─────────────────────────────────────────────────────────────────────────────

describe('computeTrend', () => {
  it('returns stable when counts are similar', () => {
    // 7d = 10, 30d = 40 → prior7d = 30
    // 10 vs 30 * 0.8 = 24 → 10 < 24 → falling
    // Actually let's do: 7d = 10, 30d = 20 → prior7d = 10
    assert.equal(computeTrend(10, 20), 'stable');
  });

  it('returns rising when 7d count exceeds prior period by >20%', () => {
    // 7d = 15, 30d = 22 → prior7d = 7
    // 15 > 7 * 1.2 = 8.4 → rising
    assert.equal(computeTrend(15, 22), 'rising');
  });

  it('returns falling when 7d count is <80% of prior period', () => {
    // 7d = 5, 30d = 50 → prior7d = 45
    // 5 < 45 * 0.8 = 36 → falling
    assert.equal(computeTrend(5, 50), 'falling');
  });

  it('returns rising when all signals are in the last 7d', () => {
    // 7d = 10, 30d = 10 → prior7d = 0
    // 10 > 0 * 1.2 = 0 → rising
    assert.equal(computeTrend(10, 10), 'rising');
  });

  it('returns stable with zero signals', () => {
    // 7d = 0, 30d = 0 → prior7d = 0
    // 0 > 0 * 1.2 → false, 0 < 0 * 0.8 → false → stable
    assert.equal(computeTrend(0, 0), 'stable');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: isMajorSignal
// ─────────────────────────────────────────────────────────────────────────────

describe('isMajorSignal', () => {
  it('returns true for significance ≥ 65', () => {
    assert.ok(isMajorSignal(65));
    assert.ok(isMajorSignal(100));
    assert.ok(isMajorSignal(80));
  });

  it('returns false for significance < 65', () => {
    assert.ok(!isMajorSignal(64));
    assert.ok(!isMajorSignal(0));
    assert.ok(!isMajorSignal(50));
  });

  it('returns false for null significance', () => {
    assert.ok(!isMajorSignal(null));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: groupRelatedByType
// ─────────────────────────────────────────────────────────────────────────────

describe('groupRelatedByType', () => {
  it('groups entities by type', () => {
    const entities = [
      { name: 'Google', type: 'company', mentions: 5 },
      { name: 'GPT-4', type: 'model', mentions: 3 },
      { name: 'Microsoft', type: 'company', mentions: 2 },
      { name: 'a16z', type: 'investor', mentions: 1 },
    ];
    const groups = groupRelatedByType(entities);

    assert.equal(Object.keys(groups).length, 3);
    assert.equal(groups['company']!.length, 2);
    assert.equal(groups['model']!.length, 1);
    assert.equal(groups['investor']!.length, 1);
    assert.equal(groups['company']![0]!.name, 'Google');
  });

  it('returns empty object for empty input', () => {
    const groups = groupRelatedByType([]);
    assert.deepEqual(groups, {});
  });

  it('uses "other" for empty type strings', () => {
    const entities = [
      { name: 'Unknown', type: '', mentions: 1 },
    ];
    const groups = groupRelatedByType(entities);
    assert.equal(groups['other']!.length, 1);
  });
});
