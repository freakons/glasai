/**
 * Tests for the feed composer module.
 *
 * Run with: npx tsx --test src/lib/signals/__tests__/feedComposer.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  composeFeed,
  bigramSimilarity,
  getSignificanceTier,
  DEFAULT_FEED_CONFIG,
  type SignalWithRankMeta,
} from '../feedComposer';
import type { Signal, SignalCategory } from '@/data/mockSignals';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

let idCounter = 0;
function makeSignal(overrides: Partial<Signal> = {}): Signal {
  idCounter++;
  return {
    id: `test-${idCounter}`,
    title: `Test Signal ${idCounter}`,
    category: 'research' as SignalCategory,
    entityId: `entity-${idCounter}`,
    entityName: `Entity ${idCounter}`,
    summary: `Summary for signal ${idCounter}`,
    date: new Date(Date.now() - idCounter * 3600000).toISOString(),
    confidence: 80,
    significanceScore: 70,
    sourceSupportCount: 3,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// bigramSimilarity
// ─────────────────────────────────────────────────────────────────────────────

describe('bigramSimilarity', () => {
  it('returns 1 for identical strings', () => {
    assert.equal(bigramSimilarity('hello world', 'hello world'), 1);
  });

  it('returns 1 for case-insensitive identical strings', () => {
    assert.equal(bigramSimilarity('Hello World', 'hello world'), 1);
  });

  it('returns 1 for strings differing only in punctuation', () => {
    assert.equal(
      bigramSimilarity('OpenAI launches GPT-5!', 'OpenAI launches GPT5'),
      1,
    );
  });

  it('returns high similarity for near-duplicate titles', () => {
    const sim = bigramSimilarity(
      'OpenAI launches GPT-5 with new capabilities',
      'OpenAI launches GPT-5 with improved capabilities',
    );
    assert.ok(sim > 0.7, `Expected > 0.7, got ${sim}`);
  });

  it('returns low similarity for different titles', () => {
    const sim = bigramSimilarity(
      'OpenAI launches GPT-5',
      'EU regulation hits AI companies hard',
    );
    assert.ok(sim < 0.3, `Expected < 0.3, got ${sim}`);
  });

  it('returns 0 for very short strings', () => {
    assert.equal(bigramSimilarity('a', 'b'), 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getSignificanceTier
// ─────────────────────────────────────────────────────────────────────────────

describe('getSignificanceTier', () => {
  it('returns critical for score >= 85', () => {
    assert.equal(getSignificanceTier(85), 'critical');
    assert.equal(getSignificanceTier(100), 'critical');
  });

  it('returns high for score 65–84', () => {
    assert.equal(getSignificanceTier(65), 'high');
    assert.equal(getSignificanceTier(84), 'high');
  });

  it('returns standard for score 40–64', () => {
    assert.equal(getSignificanceTier(40), 'standard');
    assert.equal(getSignificanceTier(64), 'standard');
  });

  it('returns low for score < 40', () => {
    assert.equal(getSignificanceTier(39), 'low');
    assert.equal(getSignificanceTier(0), 'low');
  });

  it('returns standard for null/undefined', () => {
    assert.equal(getSignificanceTier(null), 'standard');
    assert.equal(getSignificanceTier(undefined), 'standard');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// composeFeed — duplicate suppression
// ─────────────────────────────────────────────────────────────────────────────

describe('composeFeed — duplicate suppression', () => {
  it('removes near-duplicate titles', () => {
    const signals = [
      makeSignal({ title: 'OpenAI launches GPT-5 with new capabilities', significanceScore: 90 }),
      makeSignal({ title: 'OpenAI launches GPT-5 with improved capabilities', significanceScore: 85 }),
      makeSignal({ title: 'EU regulation enforcement begins', significanceScore: 80 }),
    ];
    const feed = composeFeed(signals);
    assert.equal(feed.length, 2, `Expected 2 signals after dedup, got ${feed.length}`);
    // The higher-ranked one should survive
    assert.ok(feed.some(s => s.title.includes('new capabilities')));
    assert.ok(feed.some(s => s.title.includes('EU regulation')));
  });

  it('keeps distinct signals intact', () => {
    const signals = [
      makeSignal({ title: 'OpenAI GPT-5 launch', significanceScore: 90 }),
      makeSignal({ title: 'Anthropic raises funding', significanceScore: 85 }),
      makeSignal({ title: 'EU AI Act enforcement', significanceScore: 80 }),
    ];
    const feed = composeFeed(signals);
    assert.equal(feed.length, 3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// composeFeed — diversity guardrails
// ─────────────────────────────────────────────────────────────────────────────

describe('composeFeed — diversity guardrails', () => {
  it('prevents more than 2 consecutive items from the same entity', () => {
    const now = Date.now();
    const signals = [
      makeSignal({ entityId: 'openai', title: 'OpenAI signal 1', significanceScore: 95, date: new Date(now).toISOString() }),
      makeSignal({ entityId: 'openai', title: 'OpenAI signal 2', significanceScore: 90, date: new Date(now - 1000).toISOString() }),
      makeSignal({ entityId: 'openai', title: 'OpenAI signal 3', significanceScore: 85, date: new Date(now - 2000).toISOString() }),
      makeSignal({ entityId: 'anthropic', title: 'Anthropic signal', significanceScore: 60, date: new Date(now - 3000).toISOString() }),
    ];
    const feed = composeFeed(signals, { maxConsecutiveEntity: 2 });

    // Check that no more than 2 consecutive items share the same entity
    for (let i = 2; i < feed.length; i++) {
      const sameAsTwo = feed[i].entityId === feed[i - 1].entityId &&
                        feed[i].entityId === feed[i - 2].entityId;
      assert.ok(!sameAsTwo, `Three consecutive items from entity ${feed[i].entityId} at index ${i}`);
    }
  });

  it('prevents more than 3 consecutive items from the same category', () => {
    const now = Date.now();
    const signals = [
      makeSignal({ category: 'models', title: 'Model 1', significanceScore: 95, date: new Date(now).toISOString() }),
      makeSignal({ category: 'models', title: 'Model 2', significanceScore: 90, date: new Date(now - 1000).toISOString() }),
      makeSignal({ category: 'models', title: 'Model 3', significanceScore: 85, date: new Date(now - 2000).toISOString() }),
      makeSignal({ category: 'models', title: 'Model 4', significanceScore: 80, date: new Date(now - 3000).toISOString() }),
      makeSignal({ category: 'funding', title: 'Funding round', significanceScore: 50, date: new Date(now - 4000).toISOString() }),
    ];
    const feed = composeFeed(signals, { maxConsecutiveCategory: 3 });

    for (let i = 3; i < feed.length; i++) {
      const sameAsThree = feed[i].category === feed[i - 1].category &&
                          feed[i].category === feed[i - 2].category &&
                          feed[i].category === feed[i - 3].category;
      assert.ok(!sameAsThree, `Four consecutive items from category ${feed[i].category} at index ${i}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// composeFeed — significance filtering
// ─────────────────────────────────────────────────────────────────────────────

describe('composeFeed — significance filtering', () => {
  it('filters out low-significance signals when minSignificance is set', () => {
    const signals = [
      makeSignal({ significanceScore: 90, title: 'High sig' }),
      makeSignal({ significanceScore: 20, title: 'Low sig' }),
      makeSignal({ significanceScore: 50, title: 'Mid sig' }),
    ];
    const feed = composeFeed(signals, { minSignificance: 30 });
    assert.equal(feed.length, 2);
    assert.ok(feed.every(s => (s.significanceScore ?? 0) >= 30));
  });

  it('passes through items with null significance (legacy compat)', () => {
    const signals = [
      makeSignal({ significanceScore: 90, title: 'Has score' }),
      makeSignal({ significanceScore: undefined, title: 'No score' }),
    ];
    const feed = composeFeed(signals, { minSignificance: 50 });
    assert.equal(feed.length, 2, 'Items without significance should pass through');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// composeFeed — ranking behavior
// ─────────────────────────────────────────────────────────────────────────────

describe('composeFeed — ranking behavior', () => {
  it('ranks high-significance items above low-significance items', () => {
    const now = Date.now();
    const signals = [
      makeSignal({ significanceScore: 40, title: 'Low sig', date: new Date(now).toISOString(), entityId: 'a' }),
      makeSignal({ significanceScore: 95, title: 'High sig', date: new Date(now).toISOString(), entityId: 'b' }),
    ];
    const feed = composeFeed(signals);
    assert.equal(feed[0].title, 'High sig', 'High significance should rank first');
  });

  it('attaches rank metadata when configured', () => {
    const signals = [makeSignal({ significanceScore: 85 })];
    const feed = composeFeed(signals, { attachRankMetadata: true });
    const item = feed[0] as SignalWithRankMeta;
    assert.ok(item._rankScore != null, 'Should have _rankScore');
    assert.equal(item._significanceTier, 'critical');
  });

  it('does not attach rank metadata when disabled', () => {
    const signals = [makeSignal({ significanceScore: 85 })];
    const feed = composeFeed(signals, { attachRankMetadata: false });
    const item = feed[0] as SignalWithRankMeta;
    assert.equal(item._rankScore, undefined);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// composeFeed — stable ordering
// ─────────────────────────────────────────────────────────────────────────────

describe('composeFeed — stable ordering', () => {
  it('produces deterministic output for same input', () => {
    const now = Date.now();
    const signals = [
      makeSignal({ significanceScore: 90, title: 'A', date: new Date(now).toISOString(), entityId: 'x' }),
      makeSignal({ significanceScore: 80, title: 'B', date: new Date(now - 1000).toISOString(), entityId: 'y' }),
      makeSignal({ significanceScore: 70, title: 'C', date: new Date(now - 2000).toISOString(), entityId: 'z' }),
    ];
    const feed1 = composeFeed(signals);
    const feed2 = composeFeed(signals);
    assert.deepEqual(
      feed1.map(s => s.id),
      feed2.map(s => s.id),
      'Feed should be deterministic',
    );
  });

  it('handles empty input', () => {
    const feed = composeFeed([]);
    assert.equal(feed.length, 0);
  });

  it('handles single item', () => {
    const feed = composeFeed([makeSignal()]);
    assert.equal(feed.length, 1);
  });
});
