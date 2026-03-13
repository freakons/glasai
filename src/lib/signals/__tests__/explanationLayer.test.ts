/**
 * Tests for the Signal Explanation Layer.
 *
 * Run with: npx tsx --test src/lib/signals/__tests__/explanationLayer.test.ts
 *
 * Covers:
 *   - High-significance multi-source signals
 *   - Low-confidence early signals
 *   - Entity-rich signals with context
 *   - Major event explanations
 *   - Stable, deterministic label generation
 *   - Edge cases (null fields, missing data)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Signal } from '@/data/mockSignals';
import type { MajorEvent, EventScoreBreakdown } from '../eventDetector';
import {
  explainSignal,
  explainMajorEvent,
  attachSignalExplanations,
  attachEventExplanations,
  deriveImportanceLabel,
  deriveCorroborationLabel,
  deriveConfidenceLabel,
  deriveAffectedLabel,
} from '../explanationLayer';

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────────

const HIGH_SIG_SIGNAL: Signal = {
  id: 'sig-test-001',
  title: 'Anthropic raises $3.5B Series E at $30B valuation',
  category: 'funding',
  entityId: 'anthropic',
  entityName: 'Anthropic',
  summary: 'Round led by Google and Spark Capital.',
  date: '2026-03-01',
  confidence: 96,
  significanceScore: 92,
  sourceSupportCount: 6,
  relatedIds: ['sig-test-002'],
};

const EARLY_SIGNAL: Signal = {
  id: 'sig-test-002',
  title: 'Rumoured partnership between xAI and Samsung',
  category: 'product',
  entityId: 'xai',
  entityName: 'xAI',
  summary: 'Unconfirmed reports of hardware collaboration.',
  date: '2026-03-10',
  confidence: 35,
  significanceScore: 25,
  sourceSupportCount: 1,
};

const SIGNAL_WITH_CONTEXT: Signal = {
  id: 'sig-test-003',
  title: 'EU AI Act enforcement triggers first compliance audit',
  category: 'regulation',
  entityId: 'google_deepmind',
  entityName: 'Google DeepMind',
  summary: 'European AI Office opens formal review.',
  date: '2026-02-28',
  confidence: 91,
  significanceScore: 85,
  sourceSupportCount: 5,
  context: {
    id: 'ctx-001',
    signalId: 'sig-test-003',
    summary: 'First enforcement action under EU AI Act.',
    whyItMatters: 'This sets a precedent for how the EU will regulate frontier AI models.',
    affectedEntities: [
      { name: 'Google DeepMind', type: 'company', role: 'audit target' },
      { name: 'European AI Office', type: 'regulator', role: 'enforcer' },
    ],
    implications: ['Other frontier labs may face similar audits.'],
    confidenceExplanation: 'Multiple official EU sources confirm.',
    sourceBasis: 'EU AI Office press release, Reuters, Financial Times.',
    modelProvider: 'openai',
    modelName: 'gpt-4o',
    promptVersion: '1.0.0',
    status: 'ready',
    generationError: null,
    createdAt: '2026-02-28T12:00:00Z',
  },
};

const LEGACY_SIGNAL: Signal = {
  id: 'sig-test-004',
  title: 'Legacy signal without scoring',
  category: 'research',
  entityId: 'unknown',
  entityName: '',
  summary: 'A signal from before scoring was introduced.',
  date: '2025-12-01',
  confidence: 70,
};

function makeMajorEvent(overrides?: Partial<MajorEvent>): MajorEvent {
  const breakdown: EventScoreBreakdown = {
    avgSignificance: 80,
    maxSignificance: 92,
    corroborationScore: 65,
    sourceQuality: 70,
    recency: 85,
    cohesion: 55,
    ...(overrides?.scoreBreakdown ?? {}),
  };
  return {
    id: 'evt-test-001',
    title: 'Anthropic: funding round',
    summary: 'Major funding event corroborated by 3 signals.',
    category: 'funding_round',
    entities: ['Anthropic', 'Google'],
    signalCategories: ['funding'],
    memberSignalIds: ['sig-001', 'sig-002', 'sig-003'],
    signalCount: 3,
    importanceScore: 75,
    corroboration: 70,
    startedAt: '2026-02-25',
    latestAt: '2026-03-05',
    whyDetected: ['3 related signals clustered'],
    scoreBreakdown: breakdown,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Label derivation tests
// ─────────────────────────────────────────────────────────────────────────────

describe('deriveImportanceLabel', () => {
  it('returns "Standard" for null/undefined', () => {
    assert.equal(deriveImportanceLabel(null), 'Standard');
    assert.equal(deriveImportanceLabel(undefined), 'Standard');
  });

  it('returns "Critical Development" for score >= 85', () => {
    assert.equal(deriveImportanceLabel(92), 'Critical Development');
    assert.equal(deriveImportanceLabel(85), 'Critical Development');
  });

  it('returns "High Importance" for score 70–84', () => {
    assert.equal(deriveImportanceLabel(78), 'High Importance');
    assert.equal(deriveImportanceLabel(70), 'High Importance');
  });

  it('returns "Notable" for score 55–69', () => {
    assert.equal(deriveImportanceLabel(60), 'Notable');
    assert.equal(deriveImportanceLabel(55), 'Notable');
  });

  it('returns "Standard" for score 35–54', () => {
    assert.equal(deriveImportanceLabel(40), 'Standard');
    assert.equal(deriveImportanceLabel(35), 'Standard');
  });

  it('returns "Early Signal" for score < 35', () => {
    assert.equal(deriveImportanceLabel(25), 'Early Signal');
    assert.equal(deriveImportanceLabel(0), 'Early Signal');
  });
});

describe('deriveCorroborationLabel', () => {
  it('returns "Unverified" for null/undefined/0', () => {
    assert.equal(deriveCorroborationLabel(null), 'Unverified');
    assert.equal(deriveCorroborationLabel(undefined), 'Unverified');
    assert.equal(deriveCorroborationLabel(0), 'Unverified');
  });

  it('returns "Single Source" for count 1', () => {
    assert.equal(deriveCorroborationLabel(1), 'Single Source');
  });

  it('returns "Corroborated" for count 2–3', () => {
    assert.equal(deriveCorroborationLabel(2), 'Corroborated');
    assert.equal(deriveCorroborationLabel(3), 'Corroborated');
  });

  it('returns "Multiple Sources Confirm" for count 4–5', () => {
    assert.equal(deriveCorroborationLabel(4), 'Multiple Sources Confirm');
    assert.equal(deriveCorroborationLabel(5), 'Multiple Sources Confirm');
  });

  it('returns "Widely Confirmed" for count >= 6', () => {
    assert.equal(deriveCorroborationLabel(6), 'Widely Confirmed');
    assert.equal(deriveCorroborationLabel(10), 'Widely Confirmed');
  });
});

describe('deriveConfidenceLabel', () => {
  it('returns "Moderate Confidence" for null', () => {
    assert.equal(deriveConfidenceLabel(null), 'Moderate Confidence');
  });

  it('maps confidence scores to correct labels', () => {
    assert.equal(deriveConfidenceLabel(96), 'Very High Confidence');
    assert.equal(deriveConfidenceLabel(90), 'Very High Confidence');
    assert.equal(deriveConfidenceLabel(85), 'High Confidence');
    assert.equal(deriveConfidenceLabel(75), 'High Confidence');
    assert.equal(deriveConfidenceLabel(60), 'Moderate Confidence');
    assert.equal(deriveConfidenceLabel(35), 'Low Confidence');
  });
});

describe('deriveAffectedLabel', () => {
  it('returns empty string for no entities', () => {
    assert.equal(deriveAffectedLabel([]), '');
  });

  it('formats single entity', () => {
    assert.equal(deriveAffectedLabel(['OpenAI']), 'Affects OpenAI');
  });

  it('formats two entities', () => {
    assert.equal(deriveAffectedLabel(['OpenAI', 'Anthropic']), 'Affects OpenAI and Anthropic');
  });

  it('formats three+ entities', () => {
    assert.equal(
      deriveAffectedLabel(['OpenAI', 'Anthropic', 'Google']),
      'Affects OpenAI, Anthropic +1 more',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Signal explanation tests
// ─────────────────────────────────────────────────────────────────────────────

describe('explainSignal', () => {
  it('explains a high-significance multi-source signal', () => {
    const explanation = explainSignal(HIGH_SIG_SIGNAL);

    assert.equal(explanation.importanceLabel, 'Critical Development');
    assert.equal(explanation.confidenceLabel, 'Very High Confidence');
    assert.ok(explanation.affectedEntities.includes('Anthropic'));
    assert.deepEqual(explanation.supportingSignals, ['sig-test-002']);
    assert.ok(explanation.corroborationSummary.includes('6'));
    assert.ok(explanation.whyThisMatters.includes('critical'));
    assert.ok(explanation.whyThisMatters.includes('Anthropic'));
    assert.ok(explanation.explanationFactors.length >= 3);
  });

  it('explains a low-confidence early signal', () => {
    const explanation = explainSignal(EARLY_SIGNAL);

    assert.equal(explanation.importanceLabel, 'Early Signal');
    assert.equal(explanation.confidenceLabel, 'Low Confidence');
    assert.ok(explanation.corroborationSummary.toLowerCase().includes('single source'));
    assert.ok(explanation.whyThisMatters.includes('early-stage'));
    assert.ok(explanation.whyThisMatters.includes('xAI'));
  });

  it('uses pre-generated context whyItMatters when available', () => {
    const explanation = explainSignal(SIGNAL_WITH_CONTEXT);

    assert.equal(
      explanation.whyThisMatters,
      'This sets a precedent for how the EU will regulate frontier AI models.',
    );
    assert.ok(explanation.affectedEntities.includes('Google DeepMind'));
    assert.ok(explanation.affectedEntities.includes('European AI Office'));
    assert.equal(explanation.importanceLabel, 'Critical Development');
  });

  it('handles legacy signal with no scoring data', () => {
    const explanation = explainSignal(LEGACY_SIGNAL);

    assert.equal(explanation.importanceLabel, 'Standard');
    assert.equal(explanation.confidenceLabel, 'Moderate Confidence');
    assert.deepEqual(explanation.affectedEntities, []);
    assert.deepEqual(explanation.supportingSignals, []);
    assert.ok(explanation.corroborationSummary.toLowerCase().includes('unknown'));
  });

  it('is deterministic — same input always produces same output', () => {
    const a = explainSignal(HIGH_SIG_SIGNAL);
    const b = explainSignal(HIGH_SIG_SIGNAL);
    assert.deepEqual(a, b);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Major event explanation tests
// ─────────────────────────────────────────────────────────────────────────────

describe('explainMajorEvent', () => {
  it('explains a high-importance event', () => {
    const event = makeMajorEvent({ importanceScore: 75 });
    const explanation = explainMajorEvent(event);

    assert.equal(explanation.importanceLabel, 'High Importance');
    assert.deepEqual(explanation.affectedEntities, ['Anthropic', 'Google']);
    assert.equal(explanation.signalCount, 3);
    assert.ok(explanation.whyThisMatters.includes('major'));
    assert.ok(explanation.whyThisMatters.includes('funding'));
    assert.ok(explanation.explanationFactors.length >= 3);
  });

  it('explains a moderate-importance event', () => {
    const event = makeMajorEvent({ importanceScore: 50, signalCount: 2 });
    const explanation = explainMajorEvent(event);

    assert.equal(explanation.importanceLabel, 'Standard');
    assert.ok(explanation.whyThisMatters.includes('2 related signals'));
  });

  it('is deterministic', () => {
    const event = makeMajorEvent();
    const a = explainMajorEvent(event);
    const b = explainMajorEvent(event);
    assert.deepEqual(a, b);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Batch helpers
// ─────────────────────────────────────────────────────────────────────────────

describe('attachSignalExplanations', () => {
  it('attaches explanation to each signal', () => {
    const result = attachSignalExplanations([HIGH_SIG_SIGNAL, EARLY_SIGNAL]);

    assert.equal(result.length, 2);
    assert.equal(result[0].explanation.importanceLabel, 'Critical Development');
    assert.equal(result[1].explanation.importanceLabel, 'Early Signal');
    assert.equal(result[0].id, 'sig-test-001');
    assert.equal(result[1].id, 'sig-test-002');
  });

  it('returns empty array for empty input', () => {
    assert.deepEqual(attachSignalExplanations([]), []);
  });
});

describe('attachEventExplanations', () => {
  it('attaches explanation to each event', () => {
    const events = [makeMajorEvent(), makeMajorEvent({ id: 'evt-002', importanceScore: 50 })];
    const result = attachEventExplanations(events);

    assert.equal(result.length, 2);
    assert.equal(result[0].explanation.importanceLabel, 'High Importance');
    assert.equal(result[1].explanation.importanceLabel, 'Standard');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Explanation factor tests
// ─────────────────────────────────────────────────────────────────────────────

describe('explanation factors', () => {
  it('high-sig signal includes significance, corroboration, confidence, entity factors', () => {
    const { explanationFactors } = explainSignal(HIGH_SIG_SIGNAL);
    const types = explanationFactors.map(f => f.type);

    assert.ok(types.includes('significance'));
    assert.ok(types.includes('corroboration'));
    assert.ok(types.includes('confidence'));
    assert.ok(types.includes('entity'));
  });

  it('signal with context has a context factor', () => {
    const { explanationFactors } = explainSignal(SIGNAL_WITH_CONTEXT);
    const contextFactor = explanationFactors.find(f => f.type === 'context');

    assert.ok(contextFactor);
    assert.equal(contextFactor!.label, 'Analyst context available');
  });

  it('legacy signal has limited factors', () => {
    const { explanationFactors } = explainSignal(LEGACY_SIGNAL);
    const types = explanationFactors.map(f => f.type);

    assert.ok(types.includes('confidence'));
    assert.ok(!types.includes('significance'));
  });
});
