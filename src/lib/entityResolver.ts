/**
 * Omterminal — Canonical Entity Resolver
 *
 * Centralized entity name normalization and linking module.
 * Resolves free-text entity mentions to canonical internal entities from
 * the company, model, and investor registries.
 *
 * Design principles:
 *   - One canonical identity per entity, with multiple aliases
 *   - Deterministic, inspectable matching rules (no fuzzy magic)
 *   - Precision over recall: ambiguous mentions are not force-linked
 *   - Title-first weighting: mentions in titles get higher confidence
 *   - Short-token safety: ambiguous short names require context
 *
 * Usage:
 *   import { resolveEntityMentions } from '@/lib/entityResolver';
 *   const results = resolveEntityMentions(title, content);
 */

import { COMPANIES, type CompanyEntity } from '@/data/entities/companies';
import { MODELS, type ModelEntity } from '@/data/entities/models';
import { INVESTORS, type InvestorEntity } from '@/data/entities/investors';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type EntityCategory = 'company' | 'model' | 'investor';

export interface ResolvedEntity {
  /** Stable internal ID from the registry (e.g. 'openai', 'gpt4o') */
  id: string;
  /** Canonical display name (e.g. 'OpenAI', 'GPT-4o') */
  canonicalName: string;
  /** Entity category */
  category: EntityCategory;
  /** The alias or name that actually matched in the text */
  matchedAs: string;
  /** Where the match was found */
  matchLocation: 'title' | 'content' | 'both';
  /** Confidence: 'high' if matched on canonical name or in title; 'medium' otherwise */
  confidence: 'high' | 'medium';
  /** Human-readable reason for the match */
  matchReason: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Name normalization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalizes an entity name for comparison purposes:
 *   1. Lowercase
 *   2. Trim whitespace
 *   3. Collapse internal whitespace to single space
 *   4. Strip common punctuation that varies across sources (hyphens, periods, commas)
 *   5. Normalize unicode quotes/dashes to ASCII equivalents
 *
 * Examples:
 *   "GPT-4o"          → "gpt4o"
 *   "Open AI"         → "open ai"
 *   "Claude 3.5"      → "claude 35"
 *   "Hugging  Face"   → "hugging face"
 *   "Stable Diffusion" → "stable diffusion"
 */
export function normalizeEntityName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[\u2018\u2019\u201C\u201D]/g, '') // smart quotes
    .replace(/[\u2013\u2014]/g, '')              // em/en dashes
    .replace(/[-_.,:;'"\u00B7]/g, '')            // punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Ambiguous short-token set
//
// These tokens are too short or common to safely link without contextual
// support (e.g. appearing alongside a longer alias, or appearing in a title
// about AI companies). They are ONLY matched if they appear in the title
// or if another entity from the same parent already matched.
// ─────────────────────────────────────────────────────────────────────────────

const AMBIGUOUS_SHORT_TOKENS = new Set([
  'ai',       // too generic
  'gc',       // General Catalyst alias - too short
  'gv',       // Google Ventures alias - too short
  'scale',    // Scale AI alias - common word
  'together', // Together AI alias - common word
  'spark',    // Spark Capital alias - common word
  'insight',  // Insight Partners alias - common word
  'accel',    // common word fragment
  'fair',     // Facebook AI Research alias - common word
  'cohere',   // borderline: could be verb "cohere"
]);

/**
 * Returns true if a match term is considered ambiguous (too short or
 * too common) and should only be linked with extra context.
 */
function isAmbiguousTerm(term: string): boolean {
  return AMBIGUOUS_SHORT_TOKENS.has(normalizeEntityName(term));
}

// ─────────────────────────────────────────────────────────────────────────────
// Whole-word matching
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if `term` appears as a whole-word match inside `text`.
 * Whole-word matching avoids false positives like "Meta" inside "Metadata".
 */
function containsWholeWord(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?<![a-zA-Z0-9])${escaped}(?![a-zA-Z0-9])`, 'i');
  return pattern.test(text);
}

/**
 * Returns true if `normalizedTerm` appears as a normalized match in `normalizedText`.
 * Used as a fallback when exact matching fails, to catch punctuation/casing variants.
 */
function containsNormalizedMatch(normalizedText: string, normalizedTerm: string): boolean {
  if (normalizedTerm.length < 3) return false; // too short for substring matching
  const idx = normalizedText.indexOf(normalizedTerm);
  if (idx === -1) return false;

  // Check word boundaries in normalized text
  const before = idx > 0 ? normalizedText[idx - 1] : ' ';
  const after = idx + normalizedTerm.length < normalizedText.length
    ? normalizedText[idx + normalizedTerm.length]
    : ' ';

  return /\s/.test(before) || idx === 0 ? (/\s/.test(after) || idx + normalizedTerm.length === normalizedText.length) : false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lookup index (built once, reused)
// ─────────────────────────────────────────────────────────────────────────────

interface LookupEntry {
  id: string;
  canonicalName: string;
  category: EntityCategory;
  /** All searchable terms: canonical name + aliases */
  terms: string[];
}

let _lookupIndex: LookupEntry[] | null = null;

function getLookupIndex(): LookupEntry[] {
  if (_lookupIndex) return _lookupIndex;

  _lookupIndex = [];

  for (const c of COMPANIES) {
    _lookupIndex.push({
      id: c.id,
      canonicalName: c.name,
      category: 'company',
      terms: [c.name, ...(c.aliases ?? [])],
    });
  }

  for (const m of MODELS) {
    _lookupIndex.push({
      id: m.id,
      canonicalName: m.name,
      category: 'model',
      terms: [m.name, ...(m.aliases ?? [])],
    });
  }

  for (const i of INVESTORS) {
    _lookupIndex.push({
      id: i.id,
      canonicalName: i.name,
      category: 'investor',
      terms: [i.name, ...(i.aliases ?? [])],
    });
  }

  // Sort by term length descending so longer (more specific) matches are found first
  _lookupIndex.sort((a, b) => {
    const aMax = Math.max(...a.terms.map((t) => t.length));
    const bMax = Math.max(...b.terms.map((t) => t.length));
    return bMax - aMax;
  });

  return _lookupIndex;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves entity mentions from title and content text against the canonical
 * entity registries (companies, models, investors).
 *
 * Matching strategy (in priority order):
 *   1. Exact whole-word match on canonical name
 *   2. Exact whole-word match on aliases
 *   3. Normalized match (handles punctuation/casing variants)
 *
 * Ambiguous short tokens are only linked if found in the title.
 *
 * @param title    Article or signal headline.
 * @param content  Article body or signal description.
 * @returns        Array of resolved entities, deduplicated by ID.
 */
export function resolveEntityMentions(
  title: string,
  content: string,
): ResolvedEntity[] {
  const index = getLookupIndex();
  const results: ResolvedEntity[] = [];
  const seenIds = new Set<string>();

  const normalizedTitle = normalizeEntityName(title);
  const normalizedContent = normalizeEntityName(content);
  const normalizedFull = normalizedTitle + ' ' + normalizedContent;

  for (const entry of index) {
    if (seenIds.has(entry.id)) continue;

    let matchedTerm: string | null = null;
    let inTitle = false;
    let inContent = false;
    let matchMethod = '';

    // Try each term for this entity
    for (const term of entry.terms) {
      const ambiguous = isAmbiguousTerm(term);

      // Strategy 1: Exact whole-word match in title
      if (containsWholeWord(title, term)) {
        if (ambiguous) {
          // Ambiguous terms only count if in title
          matchedTerm = term;
          inTitle = true;
          matchMethod = 'title-exact (ambiguous term)';
          break;
        }
        inTitle = true;
        if (containsWholeWord(content, term)) {
          inContent = true;
        }
        matchedTerm = term;
        matchMethod = 'exact';
        break;
      }

      // Strategy 2: Exact whole-word match in content only
      if (!ambiguous && containsWholeWord(content, term)) {
        inContent = true;
        matchedTerm = term;
        matchMethod = 'exact';
        break;
      }

      // Strategy 3: Normalized match (catches punctuation/casing variants)
      if (!ambiguous) {
        const normalizedTerm = normalizeEntityName(term);
        if (normalizedTerm.length >= 4) { // require minimum length for normalized matching
          if (containsNormalizedMatch(normalizedTitle, normalizedTerm)) {
            inTitle = true;
            matchedTerm = term;
            matchMethod = 'normalized';
            // Also check content for normalized match
            if (containsNormalizedMatch(normalizedContent, normalizedTerm)) {
              inContent = true;
            }
            break;
          }
          if (containsNormalizedMatch(normalizedContent, normalizedTerm)) {
            inContent = true;
            matchedTerm = term;
            matchMethod = 'normalized';
            break;
          }
        }
      }
    }

    if (matchedTerm && (inTitle || inContent)) {
      seenIds.add(entry.id);

      const matchLocation: ResolvedEntity['matchLocation'] =
        inTitle && inContent ? 'both' :
        inTitle ? 'title' :
        'content';

      // Confidence is high if matched on canonical name or found in title
      const isCanonicalMatch = matchedTerm === entry.canonicalName;
      const confidence: ResolvedEntity['confidence'] =
        (isCanonicalMatch || inTitle) ? 'high' : 'medium';

      results.push({
        id: entry.id,
        canonicalName: entry.canonicalName,
        category: entry.category,
        matchedAs: matchedTerm,
        matchLocation,
        confidence,
        matchReason: `Matched via ${matchMethod} on "${matchedTerm}" in ${matchLocation}`,
      });
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience: resolve a single free-text name to canonical
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves a single free-text entity name to its canonical form.
 * Returns the canonical name if found, or the original name if not in registry.
 *
 * This is useful for normalizing entity names from LLM output before storing.
 */
export function canonicalizeEntityName(name: string): {
  canonicalName: string;
  id: string | null;
  category: EntityCategory | null;
} {
  const normalized = normalizeEntityName(name);
  const index = getLookupIndex();

  for (const entry of index) {
    // Check exact match on ID
    if (entry.id === normalized) {
      return { canonicalName: entry.canonicalName, id: entry.id, category: entry.category };
    }

    // Check each term
    for (const term of entry.terms) {
      if (normalizeEntityName(term) === normalized) {
        return { canonicalName: entry.canonicalName, id: entry.id, category: entry.category };
      }
    }
  }

  return { canonicalName: name.trim(), id: null, category: null };
}

/**
 * Convenience wrapper: returns just the entity names (canonical) from
 * resolveEntityMentions, grouped by category.
 */
export function detectAndLinkEntities(
  title: string,
  content: string,
): {
  companies: string[];
  models: string[];
  investors: string[];
  all: ResolvedEntity[];
} {
  const resolved = resolveEntityMentions(title, content);
  return {
    companies: resolved.filter((r) => r.category === 'company').map((r) => r.canonicalName),
    models: resolved.filter((r) => r.category === 'model').map((r) => r.canonicalName),
    investors: resolved.filter((r) => r.category === 'investor').map((r) => r.canonicalName),
    all: resolved,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Entity matching identity
//
// Canonical rule for entity identity across the platform:
//   - display identity  = entity_name as stored (preserves original casing)
//   - routing identity  = slugify(entity_name)  (lowercase, alphanumeric, dashes)
//   - matching identity = normalizeEntityForMatching(name) (lowercase, trimmed)
//
// All entity comparisons (watchlist ↔ signal, alert targeting, digest queries,
// search results) MUST use normalizeEntityForMatching() or LOWER() in SQL to
// avoid case-sensitivity mismatches.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalizes an entity name for matching/comparison purposes.
 * This is the single source of truth for case-insensitive entity comparison.
 *
 * Use this in JS code when comparing entity names across systems
 * (watchlist ↔ signals, alerts, digests, trends).
 *
 * The SQL equivalent is: LOWER(entity_name)
 */
export function normalizeEntityForMatching(name: string): string {
  return name.toLowerCase().trim();
}

/**
 * Case-insensitive entity name comparison.
 * Returns true if both names refer to the same entity.
 */
export function entityNamesMatch(a: string, b: string): boolean {
  return normalizeEntityForMatching(a) === normalizeEntityForMatching(b);
}

/**
 * Build a case-insensitive lookup map from entity names to values.
 * Keys are lowercased; use normalizeEntityForMatching() to look up.
 */
export function buildEntityMatchMap<T>(entries: [string, T][]): Map<string, T> {
  const map = new Map<string, T>();
  for (const [name, value] of entries) {
    map.set(normalizeEntityForMatching(name), value);
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reset for testing
// ─────────────────────────────────────────────────────────────────────────────

/** @internal Clear cached lookup index — for testing only. */
export function _resetLookupIndex(): void {
  _lookupIndex = null;
}
