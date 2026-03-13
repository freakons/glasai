/**
 * Deduplication-focused tests for normalization helpers.
 *
 * Covers URL canonicalization edge cases, title fingerprinting, and
 * cross-source ID stability that underpin the article dedup strategy.
 *
 * Run with: npx tsx --test src/services/normalization/__tests__/dedup.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalizeUrl,
  normalizeTitle,
  generateTitleFingerprint,
  generateArticleId,
  generateStableEventId,
  generateEventId,
  stringHash,
} from '../helpers';

// ─────────────────────────────────────────────────────────────────────────────
// URL canonicalization — dedup-critical edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('canonicalizeUrl — dedup edge cases', () => {
  it('normalizes http to https', () => {
    assert.equal(
      canonicalizeUrl('http://example.com/article'),
      canonicalizeUrl('https://example.com/article')
    );
  });

  it('strips www prefix', () => {
    assert.equal(
      canonicalizeUrl('https://www.example.com/article'),
      canonicalizeUrl('https://example.com/article')
    );
  });

  it('strips www + normalizes http together', () => {
    assert.equal(
      canonicalizeUrl('http://www.example.com/article'),
      canonicalizeUrl('https://example.com/article')
    );
  });

  it('same article with different tracking params produces same URL', () => {
    const base = 'https://techcrunch.com/2024/03/openai-funding';
    const withUtm = base + '?utm_source=twitter&utm_medium=social';
    const withFbclid = base + '?fbclid=abc123';
    const withGclid = base + '?gclid=def456&dclid=xyz';
    const clean = canonicalizeUrl(base);
    assert.equal(canonicalizeUrl(withUtm), clean);
    assert.equal(canonicalizeUrl(withFbclid), clean);
    assert.equal(canonicalizeUrl(withGclid), clean);
  });

  it('sorts query parameters for consistent ordering', () => {
    assert.equal(
      canonicalizeUrl('https://example.com/article?b=2&a=1'),
      canonicalizeUrl('https://example.com/article?a=1&b=2')
    );
  });

  it('strips new tracking params (dclid, twclid, etc.)', () => {
    const url = 'https://example.com/page?twclid=abc&li_fat_id=def&ttclid=ghi&id=42';
    const result = canonicalizeUrl(url);
    assert.ok(!result.includes('twclid'));
    assert.ok(!result.includes('li_fat_id'));
    assert.ok(!result.includes('ttclid'));
    assert.ok(result.includes('id=42'));
  });

  it('strips _ga and _gl analytics params', () => {
    const url = 'https://example.com/article?_ga=2.123.456&_gl=1*abc*def';
    const result = canonicalizeUrl(url);
    assert.ok(!result.includes('_ga'));
    assert.ok(!result.includes('_gl'));
  });

  it('RSS vs GNews same article URL produces same canonical form', () => {
    // RSS often preserves the original URL; GNews sometimes adds tracking
    const rssUrl = 'https://venturebeat.com/ai/openai-raises-6b';
    const gnewsUrl = 'https://www.venturebeat.com/ai/openai-raises-6b?source=gnews';
    assert.equal(canonicalizeUrl(rssUrl), canonicalizeUrl(gnewsUrl));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Title fingerprinting
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeTitle', () => {
  it('lowercases and strips punctuation', () => {
    assert.equal(
      normalizeTitle('OpenAI Releases GPT-5!'),
      'openai releases gpt5'
    );
  });

  it('collapses whitespace', () => {
    assert.equal(
      normalizeTitle('  OpenAI   Releases   GPT-5  '),
      'openai releases gpt5'
    );
  });

  it('treats differently-punctuated titles as equal', () => {
    assert.equal(
      normalizeTitle('OpenAI Releases GPT-5: A New Era'),
      normalizeTitle("OpenAI releases GPT-5 — A new era")
    );
  });

  it('returns empty for empty/null input', () => {
    assert.equal(normalizeTitle(''), '');
  });
});

describe('generateTitleFingerprint', () => {
  it('returns tfp_ prefixed fingerprint', () => {
    const fp = generateTitleFingerprint('OpenAI Releases GPT-5');
    assert.ok(fp.startsWith('tfp_'));
  });

  it('is deterministic', () => {
    const fp1 = generateTitleFingerprint('OpenAI Releases GPT-5');
    const fp2 = generateTitleFingerprint('OpenAI Releases GPT-5');
    assert.equal(fp1, fp2);
  });

  it('same title with different punctuation produces same fingerprint', () => {
    const fp1 = generateTitleFingerprint('OpenAI Releases GPT-5!');
    const fp2 = generateTitleFingerprint('OpenAI releases GPT-5');
    assert.equal(fp1, fp2);
  });

  it('syndicated copy with slightly different title differs if words differ', () => {
    const fp1 = generateTitleFingerprint('OpenAI Releases GPT-5');
    const fp2 = generateTitleFingerprint('OpenAI Launches GPT-5 Model');
    assert.notEqual(fp1, fp2);
  });

  it('returns empty for empty input', () => {
    assert.equal(generateTitleFingerprint(''), '');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cross-source event ID stability
// ─────────────────────────────────────────────────────────────────────────────

describe('generateStableEventId', () => {
  it('always uses evt_ prefix', () => {
    const id = generateStableEventId('https://example.com/article');
    assert.ok(id.startsWith('evt_'));
  });

  it('same URL produces same ID regardless of source', () => {
    const url = 'https://example.com/article';
    const stableId = generateStableEventId(url);
    // Old source-specific IDs would differ:
    const rssId = generateEventId(url, 'rss');
    const gnewsId = generateEventId(url, 'gnews');
    assert.notEqual(rssId, gnewsId); // old behavior: different IDs
    // New behavior: stable ID is the same regardless of source
    assert.equal(generateStableEventId(url), stableId);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Article ID stability with new URL canonicalization
// ─────────────────────────────────────────────────────────────────────────────

describe('article ID dedup across URL variants', () => {
  it('same article via http and https gets same ID', () => {
    const id1 = generateArticleId(canonicalizeUrl('http://example.com/article'));
    const id2 = generateArticleId(canonicalizeUrl('https://example.com/article'));
    assert.equal(id1, id2);
  });

  it('same article with and without www gets same ID', () => {
    const id1 = generateArticleId(canonicalizeUrl('https://www.example.com/article'));
    const id2 = generateArticleId(canonicalizeUrl('https://example.com/article'));
    assert.equal(id1, id2);
  });

  it('same article with different tracking params gets same ID', () => {
    const id1 = generateArticleId(canonicalizeUrl('https://example.com/article?utm_source=rss'));
    const id2 = generateArticleId(canonicalizeUrl('https://example.com/article?fbclid=abc'));
    const id3 = generateArticleId(canonicalizeUrl('https://example.com/article'));
    assert.equal(id1, id2);
    assert.equal(id2, id3);
  });

  it('different articles remain distinct', () => {
    const id1 = generateArticleId(canonicalizeUrl('https://example.com/openai-gpt5'));
    const id2 = generateArticleId(canonicalizeUrl('https://example.com/anthropic-claude4'));
    assert.notEqual(id1, id2);
  });

  it('different domains with same path remain distinct', () => {
    const id1 = generateArticleId(canonicalizeUrl('https://techcrunch.com/funding'));
    const id2 = generateArticleId(canonicalizeUrl('https://venturebeat.com/funding'));
    assert.notEqual(id1, id2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios: different stories should stay separate
// ─────────────────────────────────────────────────────────────────────────────

describe('distinct stories remain separate', () => {
  it('different titles produce different fingerprints', () => {
    const fp1 = generateTitleFingerprint('OpenAI raises $6B in new funding round');
    const fp2 = generateTitleFingerprint('Anthropic raises $4B from Google');
    assert.notEqual(fp1, fp2);
  });

  it('similar topic but different articles stay distinct', () => {
    const fp1 = generateTitleFingerprint('EU passes AI Act with strict requirements');
    const fp2 = generateTitleFingerprint('US Congress proposes AI regulation bill');
    assert.notEqual(fp1, fp2);
  });

  it('different URLs on same domain stay distinct', () => {
    const id1 = generateArticleId(canonicalizeUrl('https://reuters.com/tech/ai-regulation-eu'));
    const id2 = generateArticleId(canonicalizeUrl('https://reuters.com/tech/ai-regulation-us'));
    assert.notEqual(id1, id2);
  });
});
