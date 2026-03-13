/**
 * Tests for the centralized entity resolver.
 *
 * Run with: npx tsx --test src/lib/__tests__/entityResolver.test.ts
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEntityName,
  resolveEntityMentions,
  canonicalizeEntityName,
  detectAndLinkEntities,
  _resetLookupIndex,
} from '../entityResolver';

// Reset index before each test to ensure clean state
beforeEach(() => {
  _resetLookupIndex();
});

// ─────────────────────────────────────────────────────────────────────────────
// normalizeEntityName
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeEntityName', () => {
  it('lowercases and trims', () => {
    assert.equal(normalizeEntityName('  OpenAI  '), 'openai');
  });

  it('strips hyphens and periods', () => {
    assert.equal(normalizeEntityName('GPT-4o'), 'gpt4o');
    assert.equal(normalizeEntityName('Claude 3.5'), 'claude 35');
  });

  it('collapses whitespace', () => {
    assert.equal(normalizeEntityName('Hugging  Face'), 'hugging face');
  });

  it('strips smart quotes and dashes', () => {
    assert.equal(normalizeEntityName('OpenAI\u2019s'), 'openais');
    assert.equal(normalizeEntityName('GPT\u20144'), 'gpt4');
  });

  it('handles empty and whitespace-only input', () => {
    assert.equal(normalizeEntityName(''), '');
    assert.equal(normalizeEntityName('   '), '');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// canonicalizeEntityName
// ─────────────────────────────────────────────────────────────────────────────

describe('canonicalizeEntityName', () => {
  it('resolves exact canonical name', () => {
    const result = canonicalizeEntityName('OpenAI');
    assert.equal(result.canonicalName, 'OpenAI');
    assert.equal(result.id, 'openai');
    assert.equal(result.category, 'company');
  });

  it('resolves alias to canonical name', () => {
    const result = canonicalizeEntityName('Open AI');
    assert.equal(result.canonicalName, 'OpenAI');
    assert.equal(result.id, 'openai');
  });

  it('resolves case-insensitive', () => {
    const result = canonicalizeEntityName('openai');
    assert.equal(result.canonicalName, 'OpenAI');
  });

  it('resolves with punctuation variation', () => {
    const result = canonicalizeEntityName('GPT-4o');
    assert.equal(result.canonicalName, 'GPT-4o');
    assert.equal(result.category, 'model');
  });

  it('resolves model aliases', () => {
    const result = canonicalizeEntityName('gpt-4o');
    assert.equal(result.canonicalName, 'GPT-4o');
  });

  it('resolves investor aliases', () => {
    const result = canonicalizeEntityName('a16z');
    assert.equal(result.canonicalName, 'Andreessen Horowitz');
    assert.equal(result.category, 'investor');
  });

  it('returns original name for unknown entities', () => {
    const result = canonicalizeEntityName('SomeUnknownCompany');
    assert.equal(result.canonicalName, 'SomeUnknownCompany');
    assert.equal(result.id, null);
    assert.equal(result.category, null);
  });

  it('resolves by registry ID', () => {
    const result = canonicalizeEntityName('anthropic');
    assert.equal(result.canonicalName, 'Anthropic');
    assert.equal(result.id, 'anthropic');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveEntityMentions — company detection
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveEntityMentions — companies', () => {
  it('detects company by canonical name in title', () => {
    const results = resolveEntityMentions('OpenAI announces new product', '');
    const openai = results.find((r) => r.id === 'openai');
    assert.ok(openai, 'Should detect OpenAI');
    assert.equal(openai.canonicalName, 'OpenAI');
    assert.equal(openai.category, 'company');
    assert.equal(openai.matchLocation, 'title');
    assert.equal(openai.confidence, 'high');
  });

  it('detects company by alias', () => {
    const results = resolveEntityMentions('', 'DeepMind publishes new research');
    const gd = results.find((r) => r.id === 'google_deepmind');
    assert.ok(gd, 'Should detect Google DeepMind via alias DeepMind');
    assert.equal(gd.canonicalName, 'Google DeepMind');
    assert.equal(gd.matchedAs, 'DeepMind');
  });

  it('detects company in both title and content', () => {
    const results = resolveEntityMentions(
      'Anthropic raises funding',
      'Anthropic secured a new round of investment'
    );
    const a = results.find((r) => r.id === 'anthropic');
    assert.ok(a);
    assert.equal(a.matchLocation, 'both');
    assert.equal(a.confidence, 'high');
  });

  it('does not false-positive Meta inside Metadata', () => {
    const results = resolveEntityMentions('', 'The metadata field was updated');
    const meta = results.find((r) => r.id === 'meta_ai');
    assert.ok(!meta, 'Should not match Meta inside Metadata');
  });

  it('detects multiple companies', () => {
    const results = resolveEntityMentions(
      'OpenAI and Anthropic compete for enterprise customers',
      'NVIDIA provides the chips that power both.'
    );
    const ids = results.map((r) => r.id);
    assert.ok(ids.includes('openai'));
    assert.ok(ids.includes('anthropic'));
    assert.ok(ids.includes('nvidia'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveEntityMentions — model detection
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveEntityMentions — models', () => {
  it('detects model by canonical name', () => {
    const results = resolveEntityMentions('GPT-4o sets new benchmark record', '');
    const model = results.find((r) => r.id === 'gpt4o');
    assert.ok(model, 'Should detect GPT-4o');
    assert.equal(model.category, 'model');
  });

  it('detects model by alias', () => {
    const results = resolveEntityMentions('', 'The claude-3-5-sonnet model performs well');
    const model = results.find((r) => r.id === 'claude3_5_sonnet');
    assert.ok(model, 'Should detect Claude 3.5 Sonnet via alias');
  });

  it('detects model variant names', () => {
    const results = resolveEntityMentions('LLaMA 3 outperforms competitors', '');
    const model = results.find((r) => r.id === 'llama3');
    assert.ok(model, 'Should detect Llama 3 via LLaMA 3 alias');
  });

  it('detects DeepSeek models', () => {
    const results = resolveEntityMentions('DeepSeek-R1 challenges OpenAI o1', '');
    const r1 = results.find((r) => r.id === 'deepseek_r1');
    assert.ok(r1, 'Should detect DeepSeek-R1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveEntityMentions — investor detection
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveEntityMentions — investors', () => {
  it('detects investor by canonical name', () => {
    const results = resolveEntityMentions('Sequoia Capital leads new round', '');
    const inv = results.find((r) => r.id === 'sequoia');
    assert.ok(inv, 'Should detect Sequoia Capital');
    assert.equal(inv.category, 'investor');
  });

  it('detects investor by alias', () => {
    const results = resolveEntityMentions('', 'a16z and Lightspeed participated in the round');
    const a16z = results.find((r) => r.id === 'a16z');
    assert.ok(a16z, 'Should detect Andreessen Horowitz via a16z');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Ambiguous short token safety
// ─────────────────────────────────────────────────────────────────────────────

describe('ambiguous short token handling', () => {
  it('does not link "Scale" in body text without title context', () => {
    const results = resolveEntityMentions(
      'New AI research published',
      'Researchers achieved scale in their experiments.'
    );
    const scaleAi = results.find((r) => r.id === 'scale_ai');
    // Scale is ambiguous — should not match in body when title has no context
    assert.ok(!scaleAi, 'Should not link "scale" as Scale AI in generic body text');
  });

  it('links "Scale" when in title (higher context)', () => {
    const results = resolveEntityMentions(
      'Scale AI raises $1B funding round',
      'The company will use the money for growth.'
    );
    // Scale AI (canonical name) should match
    const scaleAi = results.find((r) => r.id === 'scale_ai');
    assert.ok(scaleAi, 'Should detect Scale AI when canonical name is in title');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// detectAndLinkEntities convenience wrapper
// ─────────────────────────────────────────────────────────────────────────────

describe('detectAndLinkEntities', () => {
  it('groups results by category', () => {
    const result = detectAndLinkEntities(
      'OpenAI launches GPT-4o',
      'Sequoia Capital invested in the round.'
    );
    assert.ok(result.companies.includes('OpenAI'));
    assert.ok(result.models.includes('GPT-4o'));
    assert.ok(result.investors.includes('Sequoia Capital'));
  });

  it('returns empty arrays for no matches', () => {
    const result = detectAndLinkEntities('Generic news article', 'Nothing specific here.');
    assert.equal(result.companies.length, 0);
    assert.equal(result.models.length, 0);
    assert.equal(result.investors.length, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Normalized matching (punctuation/casing variants)
// ─────────────────────────────────────────────────────────────────────────────

describe('normalized matching', () => {
  it('matches Nvidia despite casing difference from NVIDIA', () => {
    const results = resolveEntityMentions('Nvidia reports strong Q4 earnings', '');
    const nvidia = results.find((r) => r.id === 'nvidia');
    assert.ok(nvidia, 'Should detect NVIDIA via Nvidia alias');
  });

  it('matches HuggingFace (no space) to Hugging Face', () => {
    const results = resolveEntityMentions('', 'HuggingFace released a new library');
    const hf = results.find((r) => r.id === 'hugging_face');
    assert.ok(hf, 'Should detect Hugging Face via HuggingFace alias');
  });

  it('matches GPT4 (no hyphen) to GPT-4', () => {
    const results = resolveEntityMentions('GPT4 benchmark results', '');
    const model = results.find((r) => r.id === 'gpt4');
    assert.ok(model, 'Should detect GPT-4 via normalized match on GPT4');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Source-aware detection (official announcements)
// ─────────────────────────────────────────────────────────────────────────────

describe('title-first extraction', () => {
  it('prioritizes title mention over content-only mention', () => {
    const results = resolveEntityMentions(
      'Anthropic launches Claude 4',
      'The model builds on previous work by OpenAI and Google DeepMind.'
    );
    // Anthropic should be first (in title)
    const anthropic = results.find((r) => r.id === 'anthropic');
    assert.ok(anthropic);
    assert.ok(
      anthropic.matchLocation === 'title' || anthropic.matchLocation === 'both',
      'Anthropic should be matched in title'
    );
    assert.equal(anthropic.confidence, 'high');
  });
});
