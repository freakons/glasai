/**
 * Tests for the source trust scoring module.
 *
 * Run with: npx tsx --test src/lib/__tests__/sourceTrust.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSourceTrust,
  computeAverageSourceTrust,
  computeWeightedSourceTrust,
  inferSourceType,
  scoreToTier,
  SOURCE_TYPE_BASELINES,
  type SourceType,
  type TrustTier,
} from '../sourceTrust';

// ─────────────────────────────────────────────────────────────────────────────
// scoreToTier
// ─────────────────────────────────────────────────────────────────────────────

describe('scoreToTier', () => {
  it('maps 85+ to authoritative', () => {
    assert.equal(scoreToTier(85), 'authoritative');
    assert.equal(scoreToTier(100), 'authoritative');
  });

  it('maps 70–84 to high', () => {
    assert.equal(scoreToTier(70), 'high');
    assert.equal(scoreToTier(84), 'high');
  });

  it('maps 50–69 to standard', () => {
    assert.equal(scoreToTier(50), 'standard');
    assert.equal(scoreToTier(69), 'standard');
  });

  it('maps 25–49 to low', () => {
    assert.equal(scoreToTier(25), 'low');
    assert.equal(scoreToTier(49), 'low');
  });

  it('maps 0–24 to unknown', () => {
    assert.equal(scoreToTier(0), 'unknown');
    assert.equal(scoreToTier(24), 'unknown');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// inferSourceType
// ─────────────────────────────────────────────────────────────────────────────

describe('inferSourceType', () => {
  it('identifies government sources', () => {
    assert.equal(inferSourceType('whitehouse.gov/ostp'), 'government');
    assert.equal(inferSourceType('nist.gov'), 'government');
    assert.equal(inferSourceType('ec.europa.eu'), 'government');
  });

  it('identifies academic sources', () => {
    assert.equal(inferSourceType('arxiv.org/abs/1234'), 'academic');
    assert.equal(inferSourceType('MIT CSAIL'), 'academic');
    assert.equal(inferSourceType('stanford.edu'), 'academic');
  });

  it('identifies primary official sources', () => {
    assert.equal(inferSourceType('openai.com/blog'), 'primary_official');
    assert.equal(inferSourceType('anthropic.com'), 'primary_official');
    assert.equal(inferSourceType('nvidia.com/blog'), 'primary_official');
  });

  it('identifies major media', () => {
    assert.equal(inferSourceType('techcrunch.com'), 'major_media');
    assert.equal(inferSourceType('VentureBeat AI'), 'major_media');
    assert.equal(inferSourceType('reuters.com'), 'major_media');
  });

  it('identifies specialist sources', () => {
    assert.equal(inferSourceType('importai.substack.com'), 'specialist');
    assert.equal(inferSourceType('stratechery.com'), 'specialist');
  });

  it('identifies aggregators', () => {
    assert.equal(inferSourceType('crunchbase.com'), 'aggregator');
    assert.equal(inferSourceType('Hacker News (hackernews)'), 'aggregator');
  });

  it('returns unknown for unrecognized sources', () => {
    assert.equal(inferSourceType('random-blog.xyz'), 'unknown');
    assert.equal(inferSourceType(''), 'unknown');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeSourceTrust — registered sources
// ─────────────────────────────────────────────────────────────────────────────

describe('computeSourceTrust — registered sources', () => {
  it('scores OpenAI Blog (model_lab, reliability=10) as authoritative', () => {
    const result = computeSourceTrust('openai_blog');
    assert.ok(result.isRegistered, 'should be registered');
    assert.equal(result.sourceType, 'primary_official');
    assert.equal(result.trustTier, 'authoritative');
    // baseline=85 * 0.4 + (10/10*100) * 0.6 = 34 + 60 = 94
    assert.equal(result.trustScore, 94);
  });

  it('scores EU AI Office (policy, reliability=10) as authoritative', () => {
    const result = computeSourceTrust('eu_ai_office');
    assert.ok(result.isRegistered);
    assert.equal(result.sourceType, 'government');
    assert.equal(result.trustTier, 'authoritative');
    // baseline=90 * 0.4 + (10/10*100) * 0.6 = 36 + 60 = 96
    assert.equal(result.trustScore, 96);
  });

  it('scores arXiv (research, reliability=9) highly', () => {
    const result = computeSourceTrust('arxiv_ai');
    assert.ok(result.isRegistered);
    assert.equal(result.sourceType, 'academic');
    // baseline=82 * 0.4 + (9/10*100) * 0.6 = 32.8 + 54 = 86.8 → 87
    assert.equal(result.trustScore, 87);
  });

  it('scores VentureBeat (industry_analysis, reliability=8)', () => {
    const result = computeSourceTrust('venturebeat_ai');
    assert.ok(result.isRegistered);
    assert.equal(result.sourceType, 'major_media');
    // baseline=70 * 0.4 + (8/10*100) * 0.6 = 28 + 48 = 76
    assert.equal(result.trustScore, 76);
  });

  it('scores Perplexity Blog (model_lab, reliability=7)', () => {
    const result = computeSourceTrust('perplexity_blog');
    assert.ok(result.isRegistered);
    assert.equal(result.sourceType, 'primary_official');
    // baseline=85 * 0.4 + (7/10*100) * 0.6 = 34 + 42 = 76
    assert.equal(result.trustScore, 76);
  });

  it('looks up by name (case-insensitive)', () => {
    const result = computeSourceTrust('openai blog');
    assert.ok(result.isRegistered, 'should match by name');
    assert.equal(result.sourceType, 'primary_official');
  });

  it('provides a reason string', () => {
    const result = computeSourceTrust('openai_blog');
    assert.ok(result.reason.length > 0);
    assert.ok(result.reason.includes('Registered'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeSourceTrust — unregistered sources
// ─────────────────────────────────────────────────────────────────────────────

describe('computeSourceTrust — unregistered sources', () => {
  it('infers government type for .gov domains', () => {
    const result = computeSourceTrust('https://some-agency.gov/reports');
    assert.ok(!result.isRegistered);
    assert.equal(result.sourceType, 'government');
    assert.equal(result.trustScore, SOURCE_TYPE_BASELINES.government);
  });

  it('infers academic type for .edu domains', () => {
    const result = computeSourceTrust('https://cs.someuniversity.edu/blog');
    assert.ok(!result.isRegistered);
    assert.equal(result.sourceType, 'academic');
    assert.equal(result.trustScore, SOURCE_TYPE_BASELINES.academic);
  });

  it('defaults to unknown for completely unrecognized sources', () => {
    const result = computeSourceTrust('random-blog-xyz');
    assert.ok(!result.isRegistered);
    assert.equal(result.sourceType, 'unknown');
    assert.equal(result.trustScore, SOURCE_TYPE_BASELINES.unknown);
    assert.equal(result.trustTier, 'low');
  });

  it('handles empty input gracefully', () => {
    const result = computeSourceTrust('');
    assert.equal(result.sourceType, 'unknown');
    assert.equal(result.trustScore, SOURCE_TYPE_BASELINES.unknown);
  });

  it('handles whitespace-only input', () => {
    const result = computeSourceTrust('   ');
    assert.equal(result.sourceType, 'unknown');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Score ordering — registered sources should respect the hierarchy
// ─────────────────────────────────────────────────────────────────────────────

describe('trust score ordering', () => {
  it('government > major_media > unknown for same reliability level', () => {
    const gov = computeSourceTrust('eu_ai_office');       // government, rel=10
    const media = computeSourceTrust('venturebeat_ai');   // major_media, rel=8
    const unknown = computeSourceTrust('random-blog-xyz');

    assert.ok(gov.trustScore > media.trustScore,
      `government (${gov.trustScore}) should be > major_media (${media.trustScore})`);
    assert.ok(media.trustScore > unknown.trustScore,
      `major_media (${media.trustScore}) should be > unknown (${unknown.trustScore})`);
  });

  it('primary_official source (rel=10) scores higher than specialist (rel=7)', () => {
    const primary = computeSourceTrust('openai_blog');         // primary, rel=10
    const specialist = computeSourceTrust('general_catalyst_blog'); // vc→specialist, rel=7

    assert.ok(primary.trustScore > specialist.trustScore,
      `primary (${primary.trustScore}) should be > specialist (${specialist.trustScore})`);
  });

  it('all scores are within [0, 100]', () => {
    const testSources = [
      'openai_blog', 'eu_ai_office', 'venturebeat_ai', 'arxiv_ai',
      'random-unknown', '', 'https://example.com',
    ];
    for (const source of testSources) {
      const result = computeSourceTrust(source);
      assert.ok(result.trustScore >= 0 && result.trustScore <= 100,
        `${source}: score ${result.trustScore} out of range`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Batch helpers
// ─────────────────────────────────────────────────────────────────────────────

describe('computeAverageSourceTrust', () => {
  it('returns unknown baseline for empty array', () => {
    assert.equal(computeAverageSourceTrust([]), SOURCE_TYPE_BASELINES.unknown);
  });

  it('returns single source score for single-element array', () => {
    const single = computeSourceTrust('openai_blog').trustScore;
    assert.equal(computeAverageSourceTrust(['openai_blog']), single);
  });

  it('averages multiple source scores', () => {
    const avg = computeAverageSourceTrust(['openai_blog', 'random-blog-xyz']);
    const s1 = computeSourceTrust('openai_blog').trustScore;
    const s2 = computeSourceTrust('random-blog-xyz').trustScore;
    assert.equal(avg, Math.round((s1 + s2) / 2));
  });
});

describe('computeWeightedSourceTrust', () => {
  it('returns unknown baseline for empty array', () => {
    assert.equal(computeWeightedSourceTrust([]), SOURCE_TYPE_BASELINES.unknown);
  });

  it('returns single source score for single-element array', () => {
    const single = computeSourceTrust('openai_blog').trustScore;
    const result = computeWeightedSourceTrust(['openai_blog']);
    // max * 0.6 + mean * 0.4 = single * 0.6 + single * 0.4 = single
    assert.equal(result, single);
  });

  it('weighted score >= average (max pulls it up)', () => {
    const weighted = computeWeightedSourceTrust(['openai_blog', 'random-blog-xyz']);
    const average = computeAverageSourceTrust(['openai_blog', 'random-blog-xyz']);
    assert.ok(weighted >= average,
      `weighted (${weighted}) should be >= average (${average})`);
  });
});
