/**
 * Omterminal — Normalization Helpers
 *
 * Centralized text, URL, timestamp, and source-name normalization utilities
 * shared across all ingestion paths (RSS, GNews, harvester).
 *
 * These helpers ensure that data entering the intelligence pipeline has a
 * consistent, predictable shape regardless of which upstream source produced it.
 */

// ─────────────────────────────────────────────────────────────────────────────
// URL normalization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tracking / analytics query parameters that should be stripped from URLs.
 * Removing these improves dedup accuracy since the same article can appear
 * with different tracking parameters across feeds.
 */
const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'ref',
  'source',
  'fbclid',
  'gclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'oly_anon_id',
  'oly_enc_id',
  '_hsenc',
  '_hsmi',
  'vero_id',
]);

/**
 * Canonicalizes a URL for consistent storage and dedup:
 *   1. Strips tracking/analytics query parameters
 *   2. Removes trailing slashes from the path (unless path is just "/")
 *   3. Lowercases the hostname
 *   4. Removes default ports (80 for http, 443 for https)
 *   5. Removes the fragment/hash
 *
 * Returns the original string if the URL is malformed.
 */
export function canonicalizeUrl(url: string): string {
  if (!url) return url;
  try {
    const parsed = new URL(url.trim());

    // Strip tracking params
    const keysToDelete: string[] = [];
    parsed.searchParams.forEach((_, key) => {
      if (TRACKING_PARAMS.has(key.toLowerCase())) {
        keysToDelete.push(key);
      }
    });
    for (const key of keysToDelete) {
      parsed.searchParams.delete(key);
    }

    // Remove fragment
    parsed.hash = '';

    // Remove trailing slash from path (keep root "/" as-is)
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    }

    return parsed.toString();
  } catch {
    return url.trim();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Text cleanup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Common HTML entity replacements.
 * Covers the entities most frequently encountered in RSS/Atom content.
 */
const HTML_ENTITIES: Record<string, string> = {
  '&amp;':   '&',
  '&lt;':    '<',
  '&gt;':    '>',
  '&quot;':  '"',
  '&#39;':   "'",
  '&apos;':  "'",
  '&#x27;':  "'",
  '&nbsp;':  ' ',
  '&#160;':  ' ',
  '&mdash;': '—',
  '&ndash;': '–',
  '&hellip;': '…',
  '&lsquo;': '\u2018',
  '&rsquo;': '\u2019',
  '&ldquo;': '\u201C',
  '&rdquo;': '\u201D',
};

/**
 * Decodes named and numeric HTML entities commonly found in RSS content.
 */
function decodeHtmlEntities(text: string): string {
  // Named entities
  let result = text;
  for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
    result = result.replaceAll(entity, char);
  }
  // Numeric decimal entities: &#123;
  result = result.replace(/&#(\d+);/g, (_, code) => {
    const n = parseInt(code, 10);
    return n > 0 && n < 0x10FFFF ? String.fromCodePoint(n) : '';
  });
  // Numeric hex entities: &#x1F;
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    const n = parseInt(hex, 16);
    return n > 0 && n < 0x10FFFF ? String.fromCodePoint(n) : '';
  });
  return result;
}

/**
 * Strips HTML tags from a string.
 * This is a simple regex-based approach suitable for RSS content cleanup.
 * Not intended as an XSS sanitizer — use escapeHtml() for output encoding.
 */
function stripHtmlTags(text: string): string {
  return text.replace(/<[^>]*>/g, ' ');
}

/**
 * Cleans a text field for storage:
 *   1. Strips HTML tags
 *   2. Decodes HTML entities
 *   3. Collapses whitespace (spaces, tabs, newlines) into single spaces
 *   4. Trims leading/trailing whitespace
 *
 * Returns empty string for null/undefined input.
 */
export function cleanText(text: string | null | undefined): string {
  if (!text) return '';
  return decodeHtmlEntities(stripHtmlTags(text))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Cleans text without stripping HTML tags.
 * Useful when HTML has already been stripped by an upstream parser (e.g.
 * rss-parser's contentSnippet) but entities and whitespace still need cleanup.
 */
export function cleanPlainText(text: string | null | undefined): string {
  if (!text) return '';
  return decodeHtmlEntities(text)
    .replace(/\s+/g, ' ')
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Source name normalization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalizes a source/publisher name:
 *   1. Trims whitespace
 *   2. Collapses internal whitespace
 *   3. Strips common suffixes like "RSS", "Feed", "Blog"
 *      (only when they appear as a trailing word after a separator)
 *
 * Returns 'Unknown' for empty/null input.
 */
export function normalizeSourceName(name: string | null | undefined): string {
  if (!name) return 'Unknown';
  const cleaned = name.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Unknown';
  // Strip trailing noise like " - RSS Feed", " | Blog Feed"
  return cleaned
    .replace(/[\s\-|]+(?:RSS|Atom|Feed|XML)\s*$/i, '')
    .trim() || cleaned;
}

// ─────────────────────────────────────────────────────────────────────────────
// Timestamp normalization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalizes a date string to ISO 8601 UTC format.
 *
 * Handles:
 *   - ISO 8601 strings (with or without timezone)
 *   - RFC 2822 date strings (common in RSS)
 *   - Epoch timestamps (seconds or milliseconds)
 *
 * Falls back to the current time if the input is missing, empty, or
 * unparseable. This ensures the pipeline always has a valid timestamp
 * rather than storing null/undefined.
 */
export function normalizeTimestamp(raw: string | null | undefined): string {
  if (!raw || !raw.trim()) return new Date().toISOString();

  const trimmed = raw.trim();

  // Check for numeric epoch timestamps
  const numeric = Number(trimmed);
  if (!isNaN(numeric) && isFinite(numeric)) {
    // Distinguish seconds vs milliseconds epoch
    const ms = numeric > 1e12 ? numeric : numeric * 1000;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  const parsed = new Date(trimmed);
  return isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// ID generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes a simple 32-bit integer hash from a string.
 * Uses the djb2-like hash (shift-5 subtract) found throughout the codebase.
 *
 * This is NOT a cryptographic hash — it is used only for generating
 * deterministic, collision-resistant short IDs from URLs.
 */
export function stringHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Generates a stable article ID from its canonical URL: `art_<hash>`.
 * The URL should be canonicalized first via canonicalizeUrl() for
 * maximum dedup effectiveness.
 */
export function generateArticleId(url: string): string {
  return `art_${stringHash(url)}`;
}

/**
 * Generates a stable event ID: `<prefix>_<hash>`.
 * @param url     The source article URL (should be canonicalized).
 * @param prefix  ID prefix, e.g. 'rss', 'gnews', 'evt'.
 */
export function generateEventId(url: string, prefix: string): string {
  return `${prefix}_${stringHash(url)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Category mapping
// ─────────────────────────────────────────────────────────────────────────────

import type { IntelligenceCategory } from '../intelligence/classifier';
import type { EventType } from '@/types/intelligence';

/**
 * Maps IntelligenceCategory → canonical EventType.
 * Shared between RSS and GNews ingestion paths.
 */
export function categoryToEventType(category: IntelligenceCategory): EventType {
  switch (category) {
    case 'MODEL_RELEASE': return 'model_release';
    case 'FUNDING':       return 'funding';
    case 'REGULATION':    return 'regulation';
    case 'POLICY':        return 'policy';
    case 'RESEARCH':      return 'research_breakthrough';
    case 'COMPANY_MOVE':  return 'company_strategy';
    default:              return 'other';
  }
}

/**
 * Maps IntelligenceCategory → DB-friendly category string used by
 * getArticles() in db/queries.ts (matches frontend ArticleCat type).
 * Shared between RSS and GNews ingestion paths.
 */
export function categoryToDbCategory(category: IntelligenceCategory): string {
  switch (category) {
    case 'MODEL_RELEASE': return 'models';
    case 'FUNDING':       return 'funding';
    case 'REGULATION':    return 'regulation';
    case 'POLICY':        return 'regulation';
    case 'RESEARCH':      return 'research';
    case 'COMPANY_MOVE':  return 'product';
    default:              return 'research';
  }
}
