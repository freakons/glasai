/**
 * Tests for the relationship intelligence engine.
 *
 * Run with: npx tsx --test src/lib/__tests__/relationshipIntelligence.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeRelationshipStrength,
  computeAllRelationships,
  getEntityConnections,
  type EntityRelationship,
} from '../relationshipIntelligence';
import type { Signal } from '@/data/mockSignals';
import type { AiEvent } from '@/data/mockEvents';
import type { EntityProfile } from '@/data/mockEntities';

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────────

const REF_DATE = new Date('2026-03-13T00:00:00Z');

function makeSignal(overrides: Partial<Signal> & { id: string; entityId: string }): Signal {
  return {
    title: 'Test signal',
    category: 'research',
    entityName: overrides.entityId,
    summary: 'Test',
    date: '2026-03-10',
    confidence: 80,
    ...overrides,
  };
}

function makeEvent(overrides: Partial<AiEvent> & { id: string; entityId: string }): AiEvent {
  return {
    type: 'announcement',
    entityName: overrides.entityId,
    title: 'Test event',
    description: 'Test',
    date: '2026-03-10',
    ...overrides,
  };
}

function makeEntity(id: string, name?: string): EntityProfile {
  return {
    id,
    name: name ?? id,
    sector: 'Foundation Models',
    country: 'US',
    founded: 2020,
    website: '',
    signalCount: 0,
    eventCount30d: 0,
    latestSignal: '',
    lastEventDate: '',
    riskLevel: 'low',
    summary: '',
    tags: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// computeRelationshipStrength
// ─────────────────────────────────────────────────────────────────────────────

describe('computeRelationshipStrength', () => {
  it('returns zero for empty shared signals', () => {
    const result = computeRelationshipStrength([], new Map(), REF_DATE);
    assert.equal(result.strength, 0);
    assert.equal(result.avgSignificance, 0);
    assert.equal(result.lastInteraction, null);
  });

  it('computes strength for shared signals with significance', () => {
    const signals = new Map<string, Signal>([
      ['sig-1', makeSignal({ id: 'sig-1', entityId: 'openai', significanceScore: 80, date: '2026-03-10' })],
      ['sig-2', makeSignal({ id: 'sig-2', entityId: 'openai', significanceScore: 60, date: '2026-03-08' })],
    ]);

    const result = computeRelationshipStrength(['sig-1', 'sig-2'], signals, REF_DATE);

    assert.ok(result.strength > 0, `expected positive strength, got ${result.strength}`);
    assert.equal(result.avgSignificance, 70); // (80+60)/2
    assert.equal(result.lastInteraction, new Date('2026-03-10').toISOString());
  });

  it('recent interactions produce higher strength than old ones', () => {
    const recentSignal = new Map<string, Signal>([
      ['sig-r', makeSignal({ id: 'sig-r', entityId: 'a', significanceScore: 50, date: '2026-03-12' })],
    ]);
    const oldSignal = new Map<string, Signal>([
      ['sig-o', makeSignal({ id: 'sig-o', entityId: 'a', significanceScore: 50, date: '2025-12-01' })],
    ]);

    const recent = computeRelationshipStrength(['sig-r'], recentSignal, REF_DATE);
    const old = computeRelationshipStrength(['sig-o'], oldSignal, REF_DATE);

    assert.ok(recent.strength > old.strength,
      `recent (${recent.strength}) should be stronger than old (${old.strength})`);
  });

  it('more shared signals produce higher strength', () => {
    const signals = new Map<string, Signal>();
    for (let i = 1; i <= 5; i++) {
      signals.set(`sig-${i}`, makeSignal({
        id: `sig-${i}`,
        entityId: 'a',
        significanceScore: 70,
        date: '2026-03-10',
      }));
    }

    const one = computeRelationshipStrength(['sig-1'], signals, REF_DATE);
    const five = computeRelationshipStrength(
      ['sig-1', 'sig-2', 'sig-3', 'sig-4', 'sig-5'],
      signals,
      REF_DATE,
    );

    assert.ok(five.strength > one.strength,
      `five signals (${five.strength}) should be stronger than one (${one.strength})`);
  });

  it('strength is bounded to 0–100', () => {
    const signals = new Map<string, Signal>();
    for (let i = 1; i <= 20; i++) {
      signals.set(`sig-${i}`, makeSignal({
        id: `sig-${i}`,
        entityId: 'a',
        significanceScore: 100,
        date: '2026-03-13',
      }));
    }

    const ids = Array.from({ length: 20 }, (_, i) => `sig-${i + 1}`);
    const result = computeRelationshipStrength(ids, signals, REF_DATE);

    assert.ok(result.strength >= 0 && result.strength <= 100,
      `strength ${result.strength} out of bounds`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeAllRelationships
// ─────────────────────────────────────────────────────────────────────────────

describe('computeAllRelationships', () => {
  it('finds relationships between entities sharing signals', () => {
    const entities = [makeEntity('openai', 'OpenAI'), makeEntity('microsoft', 'Microsoft')];
    const signals = [
      makeSignal({ id: 'sig-shared', entityId: 'openai', significanceScore: 80, date: '2026-03-10' }),
    ];
    const events = [
      makeEvent({ id: 'evt-1', entityId: 'microsoft', signalIds: ['sig-shared'] }),
    ];

    const relationships = computeAllRelationships({
      entities,
      signals,
      events,
      referenceDate: REF_DATE,
    });

    assert.equal(relationships.length, 1);
    assert.ok(relationships[0].sharedSignalCount >= 1);
    assert.ok(relationships[0].strength > 0);
    assert.deepEqual(relationships[0].sharedSignalIds, ['sig-shared']);
  });

  it('returns empty array when no entities share signals', () => {
    const entities = [makeEntity('openai'), makeEntity('nvidia')];
    const signals = [
      makeSignal({ id: 'sig-1', entityId: 'openai', date: '2026-03-10' }),
      makeSignal({ id: 'sig-2', entityId: 'nvidia', date: '2026-03-10' }),
    ];

    const relationships = computeAllRelationships({
      entities,
      signals,
      events: [],
      referenceDate: REF_DATE,
    });

    assert.equal(relationships.length, 0);
  });

  it('sorts relationships by strength descending', () => {
    const entities = [
      makeEntity('a'), makeEntity('b'), makeEntity('c'),
    ];
    // a and b share 3 signals, a and c share 1
    const signals = [
      makeSignal({ id: 's1', entityId: 'a', significanceScore: 90, date: '2026-03-12' }),
      makeSignal({ id: 's2', entityId: 'a', significanceScore: 80, date: '2026-03-11' }),
      makeSignal({ id: 's3', entityId: 'a', significanceScore: 70, date: '2026-03-10' }),
      makeSignal({ id: 's4', entityId: 'a', significanceScore: 60, date: '2026-02-01' }),
    ];
    const events = [
      makeEvent({ id: 'e1', entityId: 'b', signalIds: ['s1', 's2', 's3'] }),
      makeEvent({ id: 'e2', entityId: 'c', signalIds: ['s4'] }),
    ];

    const relationships = computeAllRelationships({
      entities, signals, events, referenceDate: REF_DATE,
    });

    assert.equal(relationships.length, 2);
    assert.ok(relationships[0].strength >= relationships[1].strength);
  });

  it('deduplicates entity pairs (A↔B = B↔A)', () => {
    const entities = [makeEntity('x'), makeEntity('y')];
    const signals = [makeSignal({ id: 's1', entityId: 'x', date: '2026-03-10' })];
    const events = [makeEvent({ id: 'e1', entityId: 'y', signalIds: ['s1'] })];

    const relationships = computeAllRelationships({
      entities, signals, events, referenceDate: REF_DATE,
    });

    assert.equal(relationships.length, 1);
  });

  it('assigns correct tier labels', () => {
    const entities = [makeEntity('a'), makeEntity('b')];
    const signals: Signal[] = [];
    const events: AiEvent[] = [];

    // Build enough shared signals for a strong relationship
    for (let i = 0; i < 8; i++) {
      const sig = makeSignal({
        id: `sig-${i}`,
        entityId: 'a',
        significanceScore: 90,
        date: '2026-03-12',
      });
      signals.push(sig);
      events.push(makeEvent({ id: `evt-${i}`, entityId: 'b', signalIds: [`sig-${i}`] }));
    }

    const relationships = computeAllRelationships({
      entities, signals, events, referenceDate: REF_DATE,
    });

    assert.equal(relationships.length, 1);
    assert.equal(relationships[0].tier, 'strong');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getEntityConnections
// ─────────────────────────────────────────────────────────────────────────────

describe('getEntityConnections', () => {
  const relationships: EntityRelationship[] = [
    {
      sourceEntityId: 'anthropic',
      targetEntityId: 'openai',
      sharedSignalCount: 3,
      sharedEventCount: 2,
      lastInteraction: '2026-03-10T00:00:00.000Z',
      avgSignificance: 85,
      strength: 72,
      tier: 'strong',
      sharedSignalIds: ['s1', 's2', 's3'],
    },
    {
      sourceEntityId: 'anthropic',
      targetEntityId: 'nvidia',
      sharedSignalCount: 1,
      sharedEventCount: 1,
      lastInteraction: '2026-02-15T00:00:00.000Z',
      avgSignificance: 65,
      strength: 28,
      tier: 'weak',
      sharedSignalIds: ['s4'],
    },
    {
      sourceEntityId: 'meta_ai',
      targetEntityId: 'openai',
      sharedSignalCount: 2,
      sharedEventCount: 1,
      lastInteraction: '2026-03-05T00:00:00.000Z',
      avgSignificance: 70,
      strength: 45,
      tier: 'moderate',
      sharedSignalIds: ['s5', 's6'],
    },
  ];

  const nameMap = new Map([
    ['anthropic', 'Anthropic'],
    ['openai', 'OpenAI'],
    ['nvidia', 'NVIDIA'],
    ['meta_ai', 'Meta AI'],
  ]);

  it('returns connections for a specific entity', () => {
    const profile = getEntityConnections('anthropic', relationships, nameMap);

    assert.equal(profile.entityId, 'anthropic');
    assert.equal(profile.entityName, 'Anthropic');
    assert.equal(profile.connectionCount, 2);
    assert.equal(profile.relationships.length, 2);
  });

  it('identifies the strongest connection', () => {
    const profile = getEntityConnections('anthropic', relationships, nameMap);
    assert.equal(profile.strongestConnectionId, 'openai');
  });

  it('computes average strength correctly', () => {
    const profile = getEntityConnections('anthropic', relationships, nameMap);
    assert.equal(profile.avgStrength, 50); // (72+28)/2 = 50
  });

  it('returns empty profile for entity with no connections', () => {
    const profile = getEntityConnections('unknown', relationships, nameMap);
    assert.equal(profile.connectionCount, 0);
    assert.equal(profile.avgStrength, 0);
    assert.equal(profile.strongestConnectionId, null);
  });
});
