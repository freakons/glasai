/**
 * Tests for the cross-signal intelligence linker.
 *
 * Run with: npx tsx --test src/lib/signals/__tests__/crossSignalLinker.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSignalRelatedness,
  computeRelatedSignals,
  groupSignalsByEvent,
  buildSignalClusters,
  enrichSignalsWithLinks,
  type SignalLink,
  type LinkedSignal,
} from '../crossSignalLinker';
import type { Signal } from '@/data/mockSignals';

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeSignal(overrides: Partial<Signal> & { id: string }): Signal {
  return {
    title: 'Test signal',
    category: 'research',
    entityId: 'unknown',
    entityName: 'Unknown',
    summary: 'Test summary',
    date: '2026-03-10',
    confidence: 80,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// computeSignalRelatedness
// ─────────────────────────────────────────────────────────────────────────────

describe('computeSignalRelatedness', () => {
  it('returns zero for the same signal', () => {
    const s = makeSignal({ id: 'sig-1', entityId: 'openai' });
    const { score } = computeSignalRelatedness(s, s);
    assert.equal(score, 0);
  });

  it('scores higher for signals sharing the same entity', () => {
    const a = makeSignal({ id: 'sig-1', entityId: 'openai', entityName: 'OpenAI', category: 'models', date: '2026-03-10' });
    const b = makeSignal({ id: 'sig-2', entityId: 'openai', entityName: 'OpenAI', category: 'funding', date: '2026-01-01' });
    const c = makeSignal({ id: 'sig-3', entityId: 'anthropic', entityName: 'Anthropic', category: 'funding', date: '2026-01-01' });

    const { score: abScore } = computeSignalRelatedness(a, b);
    const { score: acScore } = computeSignalRelatedness(a, c);

    assert.ok(abScore > acScore,
      `same-entity score (${abScore}) should exceed different-entity score (${acScore})`);
  });

  it('includes shared_entity reason when entities overlap', () => {
    const a = makeSignal({ id: 'sig-1', entityId: 'openai', entityName: 'OpenAI' });
    const b = makeSignal({ id: 'sig-2', entityId: 'openai', entityName: 'OpenAI' });

    const { reasons } = computeSignalRelatedness(a, b);
    assert.ok(reasons.some(r => r.startsWith('shared_entity:')),
      `expected shared_entity reason, got: ${reasons.join(', ')}`);
  });

  it('includes same_category reason when categories match', () => {
    const a = makeSignal({ id: 'sig-1', category: 'funding', entityId: 'x' });
    const b = makeSignal({ id: 'sig-2', category: 'funding', entityId: 'y' });

    const { reasons } = computeSignalRelatedness(a, b);
    assert.ok(reasons.some(r => r.startsWith('same_category:')),
      `expected same_category reason, got: ${reasons.join(', ')}`);
  });

  it('scores higher for temporally close signals', () => {
    const base = makeSignal({ id: 'sig-base', entityId: 'x', date: '2026-03-10' });
    const close = makeSignal({ id: 'sig-close', entityId: 'y', category: 'funding', date: '2026-03-09' });
    const far = makeSignal({ id: 'sig-far', entityId: 'y', category: 'funding', date: '2025-06-01' });

    const { score: closeScore } = computeSignalRelatedness(base, close);
    const { score: farScore } = computeSignalRelatedness(base, far);

    assert.ok(closeScore >= farScore,
      `close signal (${closeScore}) should score >= far signal (${farScore})`);
  });

  it('scores are bounded 0–100', () => {
    const a = makeSignal({ id: 'sig-1', entityId: 'openai', entityName: 'OpenAI', category: 'models', date: '2026-03-10', title: 'GPT-5 released today' });
    const b = makeSignal({ id: 'sig-2', entityId: 'openai', entityName: 'OpenAI', category: 'models', date: '2026-03-10', title: 'GPT-5 released today for all' });

    const { score } = computeSignalRelatedness(a, b);
    assert.ok(score >= 0 && score <= 100, `score ${score} out of bounds`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeRelatedSignals
// ─────────────────────────────────────────────────────────────────────────────

describe('computeRelatedSignals', () => {
  it('returns empty for a single signal pool', () => {
    const sig = makeSignal({ id: 'sig-1', entityId: 'openai' });
    const result = computeRelatedSignals(sig, [sig]);
    assert.equal(result.length, 0);
  });

  it('finds related signals in a pool', () => {
    const target = makeSignal({ id: 'sig-1', entityId: 'openai', entityName: 'OpenAI', category: 'models', date: '2026-03-10' });
    const related = makeSignal({ id: 'sig-2', entityId: 'openai', entityName: 'OpenAI', category: 'models', date: '2026-03-09' });
    const unrelated = makeSignal({ id: 'sig-3', entityId: 'nvidia', entityName: 'NVIDIA', category: 'product', date: '2025-01-01' });

    const links = computeRelatedSignals(target, [target, related, unrelated]);

    // Should find related (same entity + category + close date)
    assert.ok(links.length >= 1, `expected at least 1 related signal, got ${links.length}`);
    assert.equal(links[0].signalId, 'sig-2');
  });

  it('respects maxResults limit', () => {
    const target = makeSignal({ id: 'sig-target', entityId: 'openai', entityName: 'OpenAI', category: 'models', date: '2026-03-10' });
    const pool = [target];
    for (let i = 0; i < 20; i++) {
      pool.push(makeSignal({
        id: `sig-${i}`,
        entityId: 'openai',
        entityName: 'OpenAI',
        category: 'models',
        date: '2026-03-10',
      }));
    }

    const links = computeRelatedSignals(target, pool, 3);
    assert.ok(links.length <= 3, `expected at most 3 results, got ${links.length}`);
  });

  it('sorts results by score descending', () => {
    const target = makeSignal({ id: 'sig-target', entityId: 'openai', entityName: 'OpenAI', category: 'models', date: '2026-03-10' });
    const strongMatch = makeSignal({ id: 'sig-strong', entityId: 'openai', entityName: 'OpenAI', category: 'models', date: '2026-03-10' });
    const weakMatch = makeSignal({ id: 'sig-weak', entityId: 'anthropic', entityName: 'Anthropic', category: 'regulation', date: '2025-06-01' });

    const links = computeRelatedSignals(target, [target, strongMatch, weakMatch]);
    if (links.length >= 2) {
      assert.ok(links[0].score >= links[1].score,
        `results should be sorted by score desc`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// groupSignalsByEvent
// ─────────────────────────────────────────────────────────────────────────────

describe('groupSignalsByEvent', () => {
  it('groups signals by entity', () => {
    const signals = [
      makeSignal({ id: 's1', entityId: 'openai', entityName: 'OpenAI' }),
      makeSignal({ id: 's2', entityId: 'openai', entityName: 'OpenAI' }),
      makeSignal({ id: 's3', entityId: 'anthropic', entityName: 'Anthropic' }),
    ];

    const groups = groupSignalsByEvent(signals, 'entity');
    assert.equal(groups.length, 2);
    // Largest group first
    assert.equal(groups[0].groupKey, 'openai');
    assert.equal(groups[0].signals.length, 2);
    assert.equal(groups[1].groupKey, 'anthropic');
    assert.equal(groups[1].signals.length, 1);
  });

  it('groups signals by category', () => {
    const signals = [
      makeSignal({ id: 's1', category: 'models' }),
      makeSignal({ id: 's2', category: 'models' }),
      makeSignal({ id: 's3', category: 'funding' }),
      makeSignal({ id: 's4', category: 'funding' }),
      makeSignal({ id: 's5', category: 'funding' }),
    ];

    const groups = groupSignalsByEvent(signals, 'category');
    assert.equal(groups.length, 2);
    assert.equal(groups[0].groupKey, 'funding');
    assert.equal(groups[0].signals.length, 3);
  });

  it('sorts signals within groups by date descending', () => {
    const signals = [
      makeSignal({ id: 's1', entityId: 'openai', date: '2026-03-01' }),
      makeSignal({ id: 's2', entityId: 'openai', date: '2026-03-10' }),
      makeSignal({ id: 's3', entityId: 'openai', date: '2026-03-05' }),
    ];

    const groups = groupSignalsByEvent(signals, 'entity');
    assert.equal(groups[0].signals[0].id, 's2');
    assert.equal(groups[0].signals[1].id, 's3');
    assert.equal(groups[0].signals[2].id, 's1');
  });

  it('returns empty for empty input', () => {
    assert.equal(groupSignalsByEvent([], 'entity').length, 0);
  });

  it('computes entityCount correctly', () => {
    const signals = [
      makeSignal({ id: 's1', entityId: 'openai', category: 'models' }),
      makeSignal({ id: 's2', entityId: 'anthropic', category: 'models' }),
    ];

    const groups = groupSignalsByEvent(signals, 'category');
    assert.equal(groups[0].entityCount, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildSignalClusters
// ─────────────────────────────────────────────────────────────────────────────

describe('buildSignalClusters', () => {
  it('returns empty for empty input', () => {
    assert.equal(buildSignalClusters([]).length, 0);
  });

  it('does not create singleton clusters', () => {
    const signals = [
      makeSignal({ id: 's1', entityId: 'openai', category: 'models', date: '2026-03-10' }),
      makeSignal({ id: 's2', entityId: 'anthropic', category: 'regulation', date: '2025-01-01' }),
    ];

    const clusters = buildSignalClusters(signals);
    // These signals are very different (different entity, category, far apart),
    // so likely no cluster forms. If one does form, it should have >= 2 members.
    for (const c of clusters) {
      assert.ok(c.signalIds.length >= 2, `cluster should have >= 2 members`);
    }
  });

  it('clusters signals sharing entity + category + time', () => {
    const signals = [
      makeSignal({ id: 's1', entityId: 'openai', entityName: 'OpenAI', category: 'models', date: '2026-03-10', significanceScore: 90 }),
      makeSignal({ id: 's2', entityId: 'openai', entityName: 'OpenAI', category: 'models', date: '2026-03-09', significanceScore: 80 }),
      makeSignal({ id: 's3', entityId: 'openai', entityName: 'OpenAI', category: 'models', date: '2026-03-08', significanceScore: 70 }),
    ];

    const clusters = buildSignalClusters(signals);
    assert.ok(clusters.length >= 1, `expected at least 1 cluster, got ${clusters.length}`);
    assert.ok(clusters[0].signalIds.length >= 2, `cluster should have >= 2 members`);
    assert.equal(clusters[0].dominantCategory, 'models');
  });

  it('assigns correct date range', () => {
    const signals = [
      makeSignal({ id: 's1', entityId: 'openai', entityName: 'OpenAI', category: 'models', date: '2026-03-10', significanceScore: 80 }),
      makeSignal({ id: 's2', entityId: 'openai', entityName: 'OpenAI', category: 'models', date: '2026-03-05', significanceScore: 70 }),
    ];

    const clusters = buildSignalClusters(signals);
    if (clusters.length > 0) {
      assert.equal(clusters[0].dateFrom, '2026-03-05');
      assert.equal(clusters[0].dateTo, '2026-03-10');
    }
  });

  it('cohesion is bounded 0–100', () => {
    const signals = [
      makeSignal({ id: 's1', entityId: 'openai', entityName: 'OpenAI', category: 'models', date: '2026-03-10' }),
      makeSignal({ id: 's2', entityId: 'openai', entityName: 'OpenAI', category: 'models', date: '2026-03-10' }),
    ];

    const clusters = buildSignalClusters(signals);
    for (const c of clusters) {
      assert.ok(c.cohesion >= 0 && c.cohesion <= 100, `cohesion ${c.cohesion} out of bounds`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// enrichSignalsWithLinks
// ─────────────────────────────────────────────────────────────────────────────

describe('enrichSignalsWithLinks', () => {
  it('adds relatedSignals field to each signal', () => {
    const signals = [
      makeSignal({ id: 's1', entityId: 'openai', entityName: 'OpenAI', category: 'models', date: '2026-03-10' }),
      makeSignal({ id: 's2', entityId: 'openai', entityName: 'OpenAI', category: 'models', date: '2026-03-09' }),
    ];

    const linked = enrichSignalsWithLinks(signals);
    assert.ok(Array.isArray(linked[0].relatedSignals), 'relatedSignals should be an array');
    assert.ok(Array.isArray(linked[1].relatedSignals), 'relatedSignals should be an array');
  });

  it('preserves original signal properties', () => {
    const signals = [
      makeSignal({ id: 's1', entityId: 'openai', entityName: 'OpenAI', category: 'models', confidence: 92, date: '2026-03-10' }),
    ];

    const linked = enrichSignalsWithLinks(signals);
    assert.equal(linked[0].id, 's1');
    assert.equal(linked[0].entityId, 'openai');
    assert.equal(linked[0].confidence, 92);
  });

  it('respects maxRelated parameter', () => {
    const signals: Signal[] = [];
    for (let i = 0; i < 20; i++) {
      signals.push(makeSignal({
        id: `s${i}`,
        entityId: 'openai',
        entityName: 'OpenAI',
        category: 'models',
        date: '2026-03-10',
      }));
    }

    const linked = enrichSignalsWithLinks(signals, 2);
    for (const s of linked) {
      assert.ok(s.relatedSignals.length <= 2,
        `expected at most 2 related, got ${s.relatedSignals.length}`);
    }
  });
});
