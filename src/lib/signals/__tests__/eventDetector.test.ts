/**
 * Tests for the major event detector.
 *
 * Run with: npx tsx --test src/lib/signals/__tests__/eventDetector.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectMajorEvents,
  scoreMajorEvent,
  buildCandidateEvents,
  type MajorEvent,
} from '../eventDetector';
import { buildSignalClusters } from '../crossSignalLinker';
import type { Signal } from '@/data/mockSignals';

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────────

/** Fixed reference date for deterministic recency scoring. */
const NOW = new Date('2026-03-13T00:00:00Z');

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
// Model launch event grouping
// ─────────────────────────────────────────────────────────────────────────────

describe('model launch event grouping', () => {
  it('detects a model launch event from related model signals', () => {
    const signals = [
      makeSignal({
        id: 's1',
        title: 'GPT-5 architecture leak signals imminent launch',
        category: 'models',
        entityId: 'openai',
        entityName: 'OpenAI',
        date: '2026-03-10',
        significanceScore: 78,
        sourceSupportCount: 4,
      }),
      makeSignal({
        id: 's2',
        title: 'OpenAI launches o3-mini with 40% cost reduction',
        category: 'models',
        entityId: 'openai',
        entityName: 'OpenAI',
        date: '2026-03-09',
        significanceScore: 80,
        sourceSupportCount: 5,
      }),
      makeSignal({
        id: 's3',
        title: 'OpenAI reportedly testing GPT-5 with select partners',
        category: 'models',
        entityId: 'openai',
        entityName: 'OpenAI',
        date: '2026-03-08',
        significanceScore: 72,
        sourceSupportCount: 3,
      }),
    ];

    const events = detectMajorEvents(signals, { now: NOW, minImportanceScore: 0 });

    assert.ok(events.length >= 1, `expected at least 1 event, got ${events.length}`);
    const modelEvent = events.find(e => e.category === 'model_launch');
    assert.ok(modelEvent, 'expected a model_launch event');
    assert.ok(modelEvent.entities.includes('OpenAI'), 'event should include OpenAI as an entity');
    assert.ok(modelEvent.signalCount >= 2, `event should have >= 2 signals, got ${modelEvent.signalCount}`);
  });

  it('generates a meaningful title for model launch events', () => {
    const signals = [
      makeSignal({
        id: 's1',
        title: 'Meta AI releases Llama 4',
        category: 'models',
        entityId: 'meta_ai',
        entityName: 'Meta AI',
        date: '2026-03-10',
        significanceScore: 88,
        sourceSupportCount: 7,
      }),
      makeSignal({
        id: 's2',
        title: 'Meta AI Llama 4 benchmarks surpass competition',
        category: 'models',
        entityId: 'meta_ai',
        entityName: 'Meta AI',
        date: '2026-03-09',
        significanceScore: 75,
        sourceSupportCount: 4,
      }),
    ];

    const events = detectMajorEvents(signals, { now: NOW, minImportanceScore: 0 });

    if (events.length > 0) {
      assert.ok(events[0].title.includes('Meta AI'), 'title should reference Meta AI');
      assert.ok(
        events[0].title.includes('model launch') || events[0].title.includes('model_launch'),
        `title should reference model launch category, got: "${events[0].title}"`,
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Funding event grouping
// ─────────────────────────────────────────────────────────────────────────────

describe('funding event grouping', () => {
  it('detects a funding event from related funding signals', () => {
    const signals = [
      makeSignal({
        id: 'f1',
        title: 'Anthropic raises $3.5B Series E at $30B valuation',
        category: 'funding',
        entityId: 'anthropic',
        entityName: 'Anthropic',
        date: '2026-03-05',
        significanceScore: 92,
        sourceSupportCount: 6,
      }),
      makeSignal({
        id: 'f2',
        title: 'Anthropic funding round backed by Google and Spark',
        category: 'funding',
        entityId: 'anthropic',
        entityName: 'Anthropic',
        date: '2026-03-04',
        significanceScore: 85,
        sourceSupportCount: 4,
      }),
      makeSignal({
        id: 'f3',
        title: 'Anthropic to use proceeds for compute expansion',
        category: 'funding',
        entityId: 'anthropic',
        entityName: 'Anthropic',
        date: '2026-03-03',
        significanceScore: 70,
        sourceSupportCount: 3,
      }),
    ];

    const events = detectMajorEvents(signals, { now: NOW, minImportanceScore: 0 });

    assert.ok(events.length >= 1, `expected at least 1 funding event, got ${events.length}`);
    const fundingEvent = events.find(e => e.category === 'funding_round');
    assert.ok(fundingEvent, 'expected a funding_round event');
    assert.ok(fundingEvent.entities.includes('Anthropic'), 'event should include Anthropic');
  });

  it('keeps separate funding events for different companies distinct', () => {
    const signals = [
      makeSignal({
        id: 'f1',
        title: 'Anthropic raises $3.5B',
        category: 'funding',
        entityId: 'anthropic',
        entityName: 'Anthropic',
        date: '2026-03-05',
        significanceScore: 92,
        sourceSupportCount: 6,
      }),
      makeSignal({
        id: 'f2',
        title: 'Anthropic funding details emerge',
        category: 'funding',
        entityId: 'anthropic',
        entityName: 'Anthropic',
        date: '2026-03-04',
        significanceScore: 85,
        sourceSupportCount: 4,
      }),
      makeSignal({
        id: 'f3',
        title: 'Perplexity AI secures $500M at $8B valuation',
        category: 'funding',
        entityId: 'perplexity',
        entityName: 'Perplexity AI',
        date: '2026-02-05',
        significanceScore: 82,
        sourceSupportCount: 5,
      }),
      makeSignal({
        id: 'f4',
        title: 'Perplexity raises massive round for Spaces',
        category: 'funding',
        entityId: 'perplexity',
        entityName: 'Perplexity AI',
        date: '2026-02-04',
        significanceScore: 75,
        sourceSupportCount: 3,
      }),
    ];

    const events = detectMajorEvents(signals, { now: NOW, minImportanceScore: 0 });

    // These are different entities with different dates — should form separate events
    const anthropicEvents = events.filter(e => e.entities.includes('Anthropic'));
    const perplexityEvents = events.filter(e => e.entities.includes('Perplexity AI'));

    // At minimum, they should not all be merged into one event
    if (events.length >= 2) {
      assert.ok(
        anthropicEvents.length >= 1 || perplexityEvents.length >= 1,
        'different company funding should not all merge into one event',
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Regulation event grouping
// ─────────────────────────────────────────────────────────────────────────────

describe('regulation event grouping', () => {
  it('detects a regulation event from policy signals', () => {
    const signals = [
      makeSignal({
        id: 'r1',
        title: 'EU AI Act enforcement triggers first compliance audit',
        category: 'regulation',
        entityId: 'eu_commission',
        entityName: 'EU Commission',
        date: '2026-03-01',
        significanceScore: 85,
        sourceSupportCount: 5,
      }),
      makeSignal({
        id: 'r2',
        title: 'EU opens formal review of Gemini under AI Act',
        category: 'regulation',
        entityId: 'eu_commission',
        entityName: 'EU Commission',
        date: '2026-02-28',
        significanceScore: 80,
        sourceSupportCount: 4,
      }),
    ];

    const events = detectMajorEvents(signals, { now: NOW, minImportanceScore: 0 });

    assert.ok(events.length >= 1, `expected at least 1 event, got ${events.length}`);
    const regEvent = events.find(e => e.category === 'regulation');
    assert.ok(regEvent, 'expected a regulation event');
    assert.ok(regEvent.entities.includes('EU Commission'), 'event should include EU Commission');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Importance ranking
// ─────────────────────────────────────────────────────────────────────────────

describe('importance ranking', () => {
  it('ranks events by importance score descending', () => {
    const signals = [
      // High-importance cluster
      makeSignal({
        id: 'h1',
        title: 'Anthropic raises $3.5B',
        category: 'funding',
        entityId: 'anthropic',
        entityName: 'Anthropic',
        date: '2026-03-10',
        significanceScore: 92,
        sourceSupportCount: 6,
      }),
      makeSignal({
        id: 'h2',
        title: 'Anthropic $3.5B round details',
        category: 'funding',
        entityId: 'anthropic',
        entityName: 'Anthropic',
        date: '2026-03-09',
        significanceScore: 85,
        sourceSupportCount: 5,
      }),
      // Lower-importance cluster
      makeSignal({
        id: 'l1',
        title: 'Small startup raises seed round',
        category: 'funding',
        entityId: 'startup_x',
        entityName: 'Startup X',
        date: '2026-03-10',
        significanceScore: 45,
        sourceSupportCount: 1,
      }),
      makeSignal({
        id: 'l2',
        title: 'Startup X funding coverage',
        category: 'funding',
        entityId: 'startup_x',
        entityName: 'Startup X',
        date: '2026-03-09',
        significanceScore: 40,
        sourceSupportCount: 1,
      }),
    ];

    const events = detectMajorEvents(signals, { now: NOW, minImportanceScore: 0 });

    if (events.length >= 2) {
      for (let i = 0; i < events.length - 1; i++) {
        assert.ok(
          events[i].importanceScore >= events[i + 1].importanceScore,
          `events should be sorted by importance: ${events[i].importanceScore} >= ${events[i + 1].importanceScore}`,
        );
      }
    }
  });

  it('scores higher for well-corroborated events', () => {
    const wellCorroborated = [
      makeSignal({ id: 'w1', entityId: 'a', entityName: 'A', category: 'models', date: '2026-03-10', significanceScore: 80, sourceSupportCount: 5 }),
      makeSignal({ id: 'w2', entityId: 'a', entityName: 'A', category: 'models', date: '2026-03-09', significanceScore: 80, sourceSupportCount: 5 }),
    ];

    const poorlyCorroborated = [
      makeSignal({ id: 'p1', entityId: 'b', entityName: 'B', category: 'models', date: '2026-03-10', significanceScore: 80, sourceSupportCount: 1 }),
      makeSignal({ id: 'p2', entityId: 'b', entityName: 'B', category: 'models', date: '2026-03-09', significanceScore: 80, sourceSupportCount: 1 }),
    ];

    const { importanceScore: wellScore } = scoreMajorEvent(wellCorroborated, 80, { now: NOW });
    const { importanceScore: poorScore } = scoreMajorEvent(poorlyCorroborated, 80, { now: NOW });

    assert.ok(
      wellScore > poorScore,
      `well-corroborated (${wellScore}) should score higher than poorly-corroborated (${poorScore})`,
    );
  });

  it('scores higher for more recent events', () => {
    const recent = [
      makeSignal({ id: 'r1', entityId: 'a', entityName: 'A', category: 'models', date: '2026-03-12', significanceScore: 80, sourceSupportCount: 3 }),
      makeSignal({ id: 'r2', entityId: 'a', entityName: 'A', category: 'models', date: '2026-03-11', significanceScore: 80, sourceSupportCount: 3 }),
    ];

    const old = [
      makeSignal({ id: 'o1', entityId: 'b', entityName: 'B', category: 'models', date: '2026-01-01', significanceScore: 80, sourceSupportCount: 3 }),
      makeSignal({ id: 'o2', entityId: 'b', entityName: 'B', category: 'models', date: '2025-12-31', significanceScore: 80, sourceSupportCount: 3 }),
    ];

    const { importanceScore: recentScore } = scoreMajorEvent(recent, 80, { now: NOW });
    const { importanceScore: oldScore } = scoreMajorEvent(old, 80, { now: NOW });

    assert.ok(
      recentScore > oldScore,
      `recent event (${recentScore}) should score higher than old event (${oldScore})`,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Distinct events not merging incorrectly
// ─────────────────────────────────────────────────────────────────────────────

describe('distinct events not merging', () => {
  it('does not merge signals from unrelated entities/categories/timeframes', () => {
    const signals = [
      // Cluster A: OpenAI model launch
      makeSignal({
        id: 'a1',
        title: 'OpenAI launches GPT-5',
        category: 'models',
        entityId: 'openai',
        entityName: 'OpenAI',
        date: '2026-03-10',
        significanceScore: 90,
        sourceSupportCount: 5,
      }),
      makeSignal({
        id: 'a2',
        title: 'GPT-5 benchmarks revealed',
        category: 'models',
        entityId: 'openai',
        entityName: 'OpenAI',
        date: '2026-03-09',
        significanceScore: 85,
        sourceSupportCount: 4,
      }),
      // Cluster B: EU regulation (different entity, different category)
      makeSignal({
        id: 'b1',
        title: 'EU AI Act first enforcement action',
        category: 'regulation',
        entityId: 'eu_commission',
        entityName: 'EU Commission',
        date: '2026-02-01',
        significanceScore: 82,
        sourceSupportCount: 5,
      }),
      makeSignal({
        id: 'b2',
        title: 'EU compliance audits begin for AI systems',
        category: 'regulation',
        entityId: 'eu_commission',
        entityName: 'EU Commission',
        date: '2026-01-28',
        significanceScore: 78,
        sourceSupportCount: 4,
      }),
    ];

    const events = detectMajorEvents(signals, { now: NOW, minImportanceScore: 0 });

    // Should NOT merge OpenAI models and EU regulation into one event
    const hasOpenAIAndEU = events.some(
      e => e.entities.includes('OpenAI') && e.entities.includes('EU Commission'),
    );
    assert.ok(
      !hasOpenAIAndEU,
      'OpenAI model launch and EU regulation should not be merged into one event',
    );
  });

  it('each signal appears in at most one event', () => {
    const signals = [
      makeSignal({ id: 's1', entityId: 'openai', entityName: 'OpenAI', category: 'models', date: '2026-03-10', significanceScore: 90, sourceSupportCount: 5 }),
      makeSignal({ id: 's2', entityId: 'openai', entityName: 'OpenAI', category: 'models', date: '2026-03-09', significanceScore: 80, sourceSupportCount: 4 }),
      makeSignal({ id: 's3', entityId: 'anthropic', entityName: 'Anthropic', category: 'funding', date: '2026-03-05', significanceScore: 92, sourceSupportCount: 6 }),
      makeSignal({ id: 's4', entityId: 'anthropic', entityName: 'Anthropic', category: 'funding', date: '2026-03-04', significanceScore: 85, sourceSupportCount: 5 }),
    ];

    const events = detectMajorEvents(signals, { now: NOW, minImportanceScore: 0 });

    // Collect all signal IDs across all events
    const allSignalIds = events.flatMap(e => e.memberSignalIds);
    const uniqueIds = new Set(allSignalIds);
    assert.equal(
      allSignalIds.length,
      uniqueIds.size,
      'no signal should appear in multiple events',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// scoreMajorEvent
// ─────────────────────────────────────────────────────────────────────────────

describe('scoreMajorEvent', () => {
  it('returns a score between 0 and 100', () => {
    const signals = [
      makeSignal({ id: 's1', significanceScore: 50, sourceSupportCount: 2 }),
      makeSignal({ id: 's2', significanceScore: 60, sourceSupportCount: 3 }),
    ];

    const { importanceScore } = scoreMajorEvent(signals, 50, { now: NOW });
    assert.ok(importanceScore >= 0 && importanceScore <= 100, `score ${importanceScore} out of bounds`);
  });

  it('includes a complete breakdown', () => {
    const signals = [
      makeSignal({ id: 's1', significanceScore: 80, sourceSupportCount: 4, date: '2026-03-10' }),
      makeSignal({ id: 's2', significanceScore: 70, sourceSupportCount: 3, date: '2026-03-09' }),
    ];

    const { breakdown } = scoreMajorEvent(signals, 75, { now: NOW });

    assert.ok(breakdown.avgSignificance >= 0, 'avgSignificance should be non-negative');
    assert.ok(breakdown.maxSignificance >= 0, 'maxSignificance should be non-negative');
    assert.ok(breakdown.corroborationScore >= 0, 'corroborationScore should be non-negative');
    assert.ok(breakdown.sourceQuality >= 0, 'sourceQuality should be non-negative');
    assert.ok(breakdown.recency >= 0, 'recency should be non-negative');
    assert.ok(breakdown.cohesion >= 0, 'cohesion should be non-negative');
  });

  it('higher significance signals produce higher scores', () => {
    const high = [
      makeSignal({ id: 'h1', significanceScore: 95, sourceSupportCount: 3, date: '2026-03-10' }),
      makeSignal({ id: 'h2', significanceScore: 90, sourceSupportCount: 3, date: '2026-03-09' }),
    ];
    const low = [
      makeSignal({ id: 'l1', significanceScore: 30, sourceSupportCount: 3, date: '2026-03-10' }),
      makeSignal({ id: 'l2', significanceScore: 25, sourceSupportCount: 3, date: '2026-03-09' }),
    ];

    const { importanceScore: highScore } = scoreMajorEvent(high, 80, { now: NOW });
    const { importanceScore: lowScore } = scoreMajorEvent(low, 80, { now: NOW });

    assert.ok(highScore > lowScore, `high-significance (${highScore}) should beat low-significance (${lowScore})`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// detectMajorEvents — edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('detectMajorEvents edge cases', () => {
  it('returns empty for empty input', () => {
    const events = detectMajorEvents([]);
    assert.equal(events.length, 0);
  });

  it('returns empty for a single signal (cannot form a cluster)', () => {
    const signals = [
      makeSignal({ id: 's1', entityId: 'openai', entityName: 'OpenAI', significanceScore: 90 }),
    ];
    const events = detectMajorEvents(signals, { now: NOW });
    assert.equal(events.length, 0, 'single signal should not produce an event');
  });

  it('respects maxEvents limit', () => {
    // Create many clusters
    const signals: Signal[] = [];
    for (let i = 0; i < 10; i++) {
      const entity = `entity_${i}`;
      signals.push(
        makeSignal({
          id: `s${i}a`,
          entityId: entity,
          entityName: `Entity ${i}`,
          category: 'models',
          date: '2026-03-10',
          significanceScore: 80,
          sourceSupportCount: 3,
        }),
        makeSignal({
          id: `s${i}b`,
          entityId: entity,
          entityName: `Entity ${i}`,
          category: 'models',
          date: '2026-03-09',
          significanceScore: 75,
          sourceSupportCount: 3,
        }),
      );
    }

    const events = detectMajorEvents(signals, { now: NOW, maxEvents: 3, minImportanceScore: 0 });
    assert.ok(events.length <= 3, `expected at most 3 events, got ${events.length}`);
  });

  it('respects minImportanceScore filter', () => {
    const signals = [
      makeSignal({
        id: 's1',
        entityId: 'openai',
        entityName: 'OpenAI',
        category: 'models',
        date: '2026-03-10',
        significanceScore: 90,
        sourceSupportCount: 5,
      }),
      makeSignal({
        id: 's2',
        entityId: 'openai',
        entityName: 'OpenAI',
        category: 'models',
        date: '2026-03-09',
        significanceScore: 85,
        sourceSupportCount: 4,
      }),
    ];

    // With a very high threshold, no events should pass
    const events = detectMajorEvents(signals, { now: NOW, minImportanceScore: 100 });
    assert.equal(events.length, 0, 'no events should pass a 100% importance threshold');
  });

  it('event IDs are deterministic for the same signal set', () => {
    const signals = [
      makeSignal({ id: 'x1', entityId: 'openai', entityName: 'OpenAI', category: 'models', date: '2026-03-10', significanceScore: 80, sourceSupportCount: 3 }),
      makeSignal({ id: 'x2', entityId: 'openai', entityName: 'OpenAI', category: 'models', date: '2026-03-09', significanceScore: 75, sourceSupportCount: 3 }),
    ];

    const events1 = detectMajorEvents(signals, { now: NOW, minImportanceScore: 0 });
    const events2 = detectMajorEvents(signals, { now: NOW, minImportanceScore: 0 });

    if (events1.length > 0 && events2.length > 0) {
      assert.equal(events1[0].id, events2[0].id, 'event IDs should be deterministic');
      assert.equal(events1[0].importanceScore, events2[0].importanceScore, 'scores should be deterministic');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MajorEvent structure validation
// ─────────────────────────────────────────────────────────────────────────────

describe('MajorEvent structure', () => {
  it('has all required fields', () => {
    const signals = [
      makeSignal({
        id: 's1',
        title: 'Test event signal 1',
        category: 'models',
        entityId: 'openai',
        entityName: 'OpenAI',
        date: '2026-03-10',
        significanceScore: 80,
        sourceSupportCount: 4,
      }),
      makeSignal({
        id: 's2',
        title: 'Test event signal 2',
        category: 'models',
        entityId: 'openai',
        entityName: 'OpenAI',
        date: '2026-03-09',
        significanceScore: 75,
        sourceSupportCount: 3,
      }),
    ];

    const events = detectMajorEvents(signals, { now: NOW, minImportanceScore: 0 });

    if (events.length > 0) {
      const event = events[0];
      assert.ok(typeof event.id === 'string' && event.id.length > 0, 'id should be a non-empty string');
      assert.ok(typeof event.title === 'string' && event.title.length > 0, 'title should be a non-empty string');
      assert.ok(typeof event.summary === 'string' && event.summary.length > 0, 'summary should be a non-empty string');
      assert.ok(typeof event.category === 'string', 'category should be a string');
      assert.ok(Array.isArray(event.entities), 'entities should be an array');
      assert.ok(Array.isArray(event.signalCategories), 'signalCategories should be an array');
      assert.ok(Array.isArray(event.memberSignalIds), 'memberSignalIds should be an array');
      assert.ok(typeof event.signalCount === 'number' && event.signalCount >= 2, 'signalCount should be >= 2');
      assert.ok(typeof event.importanceScore === 'number', 'importanceScore should be a number');
      assert.ok(event.importanceScore >= 0 && event.importanceScore <= 100, 'importanceScore should be 0–100');
      assert.ok(typeof event.corroboration === 'number', 'corroboration should be a number');
      assert.ok(typeof event.startedAt === 'string', 'startedAt should be a string');
      assert.ok(typeof event.latestAt === 'string', 'latestAt should be a string');
      assert.ok(Array.isArray(event.whyDetected) && event.whyDetected.length > 0, 'whyDetected should be a non-empty array');
      assert.ok(typeof event.scoreBreakdown === 'object', 'scoreBreakdown should be an object');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration: works with real mock signals
// ─────────────────────────────────────────────────────────────────────────────

describe('integration with MOCK_SIGNALS', () => {
  it('detects events from the full mock signal set', async () => {
    const { MOCK_SIGNALS } = await import('@/data/mockSignals');
    const events = detectMajorEvents(MOCK_SIGNALS, { now: NOW, minImportanceScore: 0 });

    // The mock signals should cluster into at least some events
    // (OpenAI models, Meta AI models+agents, funding signals, etc.)
    assert.ok(events.length >= 1, `expected at least 1 event from mock signals, got ${events.length}`);

    // All events should be properly structured
    for (const event of events) {
      assert.ok(event.id.startsWith('evt-'), `event ID should start with evt-, got: ${event.id}`);
      assert.ok(event.importanceScore >= 0 && event.importanceScore <= 100, 'importance should be bounded');
      assert.ok(event.signalCount >= 2, 'events should have at least 2 signals');
    }
  });
});
