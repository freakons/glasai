/**
 * Lightweight tests for normalization helpers.
 *
 * Run with: npx tsx --test src/services/normalization/__tests__/helpers.test.ts
 * Or with Node's built-in test runner: node --import tsx --test src/services/normalization/__tests__/helpers.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalizeUrl,
  cleanText,
  cleanPlainText,
  normalizeSourceName,
  normalizeTimestamp,
  stringHash,
  generateArticleId,
  generateEventId,
  categoryToEventType,
  categoryToDbCategory,
} from '../helpers';

// ─────────────────────────────────────────────────────────────────────────────
// canonicalizeUrl
// ─────────────────────────────────────────────────────────────────────────────

describe('canonicalizeUrl', () => {
  it('strips UTM tracking parameters', () => {
    const url = 'https://example.com/article?utm_source=twitter&utm_medium=social&id=123';
    const result = canonicalizeUrl(url);
    assert.ok(!result.includes('utm_source'));
    assert.ok(!result.includes('utm_medium'));
    assert.ok(result.includes('id=123'));
  });

  it('strips fbclid and gclid', () => {
    const url = 'https://example.com/page?fbclid=abc123&gclid=def456';
    const result = canonicalizeUrl(url);
    assert.ok(!result.includes('fbclid'));
    assert.ok(!result.includes('gclid'));
  });

  it('removes trailing slashes', () => {
    const url = 'https://example.com/article/';
    const result = canonicalizeUrl(url);
    assert.equal(result, 'https://example.com/article');
  });

  it('preserves root path slash', () => {
    const url = 'https://example.com/';
    const result = canonicalizeUrl(url);
    assert.equal(result, 'https://example.com/');
  });

  it('removes fragment/hash', () => {
    const url = 'https://example.com/article#section-2';
    const result = canonicalizeUrl(url);
    assert.ok(!result.includes('#section-2'));
  });

  it('returns original for malformed URLs', () => {
    const url = 'not-a-url';
    assert.equal(canonicalizeUrl(url), 'not-a-url');
  });

  it('trims whitespace', () => {
    assert.equal(canonicalizeUrl('  https://example.com  '), 'https://example.com/');
  });

  it('returns empty for empty input', () => {
    assert.equal(canonicalizeUrl(''), '');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cleanText
// ─────────────────────────────────────────────────────────────────────────────

describe('cleanText', () => {
  it('strips HTML tags', () => {
    assert.equal(cleanText('<p>Hello <b>world</b></p>'), 'Hello world');
  });

  it('decodes HTML entities', () => {
    assert.equal(cleanText('AT&amp;T &mdash; news'), 'AT&T — news');
  });

  it('collapses whitespace', () => {
    assert.equal(cleanText('  hello   world  \n  foo  '), 'hello world foo');
  });

  it('handles null/undefined', () => {
    assert.equal(cleanText(null), '');
    assert.equal(cleanText(undefined), '');
    assert.equal(cleanText(''), '');
  });

  it('decodes numeric entities', () => {
    assert.equal(cleanText('&#8220;quoted&#8221;'), '\u201Cquoted\u201D');
  });

  it('decodes hex entities', () => {
    assert.equal(cleanText('&#x27;hello&#x27;'), "'hello'");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cleanPlainText
// ─────────────────────────────────────────────────────────────────────────────

describe('cleanPlainText', () => {
  it('preserves angle brackets (does not strip tags)', () => {
    // cleanPlainText should NOT strip HTML since it's for pre-stripped text
    const result = cleanPlainText('a < b and c > d');
    assert.ok(result.includes('<'));
    assert.ok(result.includes('>'));
  });

  it('decodes entities', () => {
    assert.equal(cleanPlainText('AT&amp;T'), 'AT&T');
  });

  it('collapses whitespace', () => {
    assert.equal(cleanPlainText('  foo   bar  '), 'foo bar');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// normalizeSourceName
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeSourceName', () => {
  it('trims and collapses whitespace', () => {
    assert.equal(normalizeSourceName('  VentureBeat   AI  '), 'VentureBeat AI');
  });

  it('strips trailing RSS/Feed noise', () => {
    assert.equal(normalizeSourceName('TechCrunch - RSS Feed'), 'TechCrunch');
    assert.equal(normalizeSourceName('Ars Technica | RSS'), 'Ars Technica');
  });

  it('returns Unknown for null/empty', () => {
    assert.equal(normalizeSourceName(null), 'Unknown');
    assert.equal(normalizeSourceName(''), 'Unknown');
    assert.equal(normalizeSourceName(undefined), 'Unknown');
  });

  it('preserves normal names', () => {
    assert.equal(normalizeSourceName('OpenAI Blog'), 'OpenAI Blog');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// normalizeTimestamp
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeTimestamp', () => {
  it('converts valid ISO 8601 to UTC ISO string', () => {
    const result = normalizeTimestamp('2024-03-15T10:30:00Z');
    assert.equal(result, '2024-03-15T10:30:00.000Z');
  });

  it('converts RFC 2822 dates', () => {
    const result = normalizeTimestamp('Fri, 15 Mar 2024 10:30:00 GMT');
    assert.ok(result.startsWith('2024-03-15'));
  });

  it('falls back to now() for null/undefined/empty', () => {
    const before = Date.now();
    const result = normalizeTimestamp(null);
    const after = Date.now();
    const ts = new Date(result).getTime();
    assert.ok(ts >= before && ts <= after);
  });

  it('falls back to now() for garbage input', () => {
    const before = Date.now();
    const result = normalizeTimestamp('not-a-date');
    const after = Date.now();
    const ts = new Date(result).getTime();
    assert.ok(ts >= before && ts <= after);
  });

  it('handles epoch seconds', () => {
    const result = normalizeTimestamp('1710500000');
    assert.ok(result.startsWith('2024-03-15'));
  });

  it('handles epoch milliseconds', () => {
    const result = normalizeTimestamp('1710500000000');
    assert.ok(result.startsWith('2024-03-15'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ID generation
// ─────────────────────────────────────────────────────────────────────────────

describe('stringHash', () => {
  it('returns deterministic 8-char hex', () => {
    const h1 = stringHash('https://example.com/article');
    const h2 = stringHash('https://example.com/article');
    assert.equal(h1, h2);
    assert.ok(/^[0-9a-f]{8,}$/.test(h1));
  });

  it('different inputs yield different hashes', () => {
    assert.notEqual(
      stringHash('https://example.com/a'),
      stringHash('https://example.com/b')
    );
  });
});

describe('generateArticleId', () => {
  it('returns art_ prefixed ID', () => {
    const id = generateArticleId('https://example.com/article');
    assert.ok(id.startsWith('art_'));
  });

  it('is deterministic', () => {
    const id1 = generateArticleId('https://example.com/article');
    const id2 = generateArticleId('https://example.com/article');
    assert.equal(id1, id2);
  });
});

describe('generateEventId', () => {
  it('uses provided prefix', () => {
    const id = generateEventId('https://example.com/article', 'gnews');
    assert.ok(id.startsWith('gnews_'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Category mappings
// ─────────────────────────────────────────────────────────────────────────────

describe('categoryToEventType', () => {
  it('maps MODEL_RELEASE to model_release', () => {
    assert.equal(categoryToEventType('MODEL_RELEASE'), 'model_release');
  });

  it('maps FUNDING to funding', () => {
    assert.equal(categoryToEventType('FUNDING'), 'funding');
  });

  it('maps POLICY to policy', () => {
    assert.equal(categoryToEventType('POLICY'), 'policy');
  });

  it('defaults to other for unknown', () => {
    assert.equal(categoryToEventType('UNKNOWN' as any), 'other');
  });
});

describe('categoryToDbCategory', () => {
  it('maps MODEL_RELEASE to models', () => {
    assert.equal(categoryToDbCategory('MODEL_RELEASE'), 'models');
  });

  it('maps POLICY to regulation', () => {
    assert.equal(categoryToDbCategory('POLICY'), 'regulation');
  });

  it('maps COMPANY_MOVE to product', () => {
    assert.equal(categoryToDbCategory('COMPANY_MOVE'), 'product');
  });

  it('defaults to research for unknown', () => {
    assert.equal(categoryToDbCategory('UNKNOWN' as any), 'research');
  });
});
