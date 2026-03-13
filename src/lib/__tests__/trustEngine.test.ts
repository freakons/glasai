/**
 * Tests for the signal trust engine (v2 with source trust integration).
 *
 * Run with: npx tsx --test src/lib/__tests__/trustEngine.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSignalTrust, type TrustResult } from '../trustEngine';

// ─────────────────────────────────────────────────────────────────────────────
// Publishing status tiers (unchanged from v1)
// ─────────────────────────────────────────────────────────────────────────────

describe('evaluateSignalTrust — publishing status', () => {
  it('returns auto for confidence >= 90', () => {
    assert.equal(evaluateSignalTrust({ confidence: 90 }).status, 'auto');
    assert.equal(evaluateSignalTrust({ confidence: 100 }).status, 'auto');
  });

  it('returns published for confidence 75–89', () => {
    assert.equal(evaluateSignalTrust({ confidence: 75 }).status, 'published');
    assert.equal(evaluateSignalTrust({ confidence: 89 }).status, 'published');
  });

  it('returns review for confidence 60–74', () => {
    assert.equal(evaluateSignalTrust({ confidence: 60 }).status, 'review');
    assert.equal(evaluateSignalTrust({ confidence: 74 }).status, 'review');
  });

  it('returns internal for confidence < 60', () => {
    assert.equal(evaluateSignalTrust({ confidence: 59 }).status, 'internal');
    assert.equal(evaluateSignalTrust({ confidence: 0 }).status, 'internal');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Trust score — without source (backward compatibility)
// ─────────────────────────────────────────────────────────────────────────────

describe('evaluateSignalTrust — no source (v1 compat)', () => {
  it('high-confidence signal gets high trust score', () => {
    const result = evaluateSignalTrust({ confidence: 95 });
    // confidenceComponent=95 * 0.7 + neutral(50) * 0.3 = 66.5 + 15 = 81.5 → 82
    assert.equal(result.trust_score, 82);
    assert.equal(result.source_trust, undefined);
  });

  it('low-confidence signal gets low trust score', () => {
    const result = evaluateSignalTrust({ confidence: 30 });
    // confidenceComponent=50 * 0.7 + neutral(50) * 0.3 = 35 + 15 = 50
    assert.equal(result.trust_score, 50);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Trust score — with source
// ─────────────────────────────────────────────────────────────────────────────

describe('evaluateSignalTrust — with source', () => {
  it('high-trust source boosts trust score', () => {
    const withSource = evaluateSignalTrust({
      confidence: 80,
      source: 'openai_blog',  // trustScore ~94
    });
    const withoutSource = evaluateSignalTrust({
      confidence: 80,
    });

    assert.ok(withSource.trust_score > withoutSource.trust_score,
      `with authoritative source (${withSource.trust_score}) should exceed no source (${withoutSource.trust_score})`);
    assert.ok(withSource.source_trust !== undefined, 'should include source_trust breakdown');
    assert.equal(withSource.source_trust!.sourceType, 'primary_official');
  });

  it('low-trust source lowers trust score', () => {
    const withLowSource = evaluateSignalTrust({
      confidence: 80,
      source: 'random-unknown-blog',  // trustScore ~40
    });
    const withoutSource = evaluateSignalTrust({
      confidence: 80,
    });

    assert.ok(withLowSource.trust_score < withoutSource.trust_score,
      `with low-trust source (${withLowSource.trust_score}) should be below no source (${withoutSource.trust_score})`);
  });

  it('trust score is always bounded [0, 100]', () => {
    const configs = [
      { confidence: 100, source: 'eu_ai_office' },
      { confidence: 0, source: 'random-unknown' },
      { confidence: 50 },
      { confidence: 90, source: 'openai_blog' },
    ];
    for (const config of configs) {
      const result = evaluateSignalTrust(config);
      assert.ok(result.trust_score >= 0 && result.trust_score <= 100,
        `trust_score ${result.trust_score} out of range for ${JSON.stringify(config)}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Source trust breakdown in result
// ─────────────────────────────────────────────────────────────────────────────

describe('evaluateSignalTrust — source trust breakdown', () => {
  it('includes isRegistered=true for known sources', () => {
    const result = evaluateSignalTrust({ confidence: 80, source: 'arxiv_ai' });
    assert.ok(result.source_trust);
    assert.equal(result.source_trust!.isRegistered, true);
    assert.equal(result.source_trust!.sourceType, 'academic');
  });

  it('includes isRegistered=false for unknown sources', () => {
    const result = evaluateSignalTrust({ confidence: 80, source: 'unknown-blog' });
    assert.ok(result.source_trust);
    assert.equal(result.source_trust!.isRegistered, false);
  });

  it('includes reason string', () => {
    const result = evaluateSignalTrust({ confidence: 80, source: 'openai_blog' });
    assert.ok(result.source_trust!.reason.length > 0);
  });
});
