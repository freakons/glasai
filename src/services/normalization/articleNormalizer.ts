/**
 * Omterminal — Article Normalizer
 *
 * Transforms a raw Article (as produced by the ingestion layer) into a
 * fully normalised Article ready for the intelligence / event-extraction engine.
 *
 * Normalization responsibilities:
 *   1. Clean title and content (whitespace, tracking params)
 *   2. Map the raw ArticleCategory to a canonical NormalizedCategory
 *   3. Detect entities (companies, models, investors) and attach as tags
 *
 * Architecture:
 *   RSS ingestion → normalizeArticle() → event extraction pipeline
 */

import type { Article, ArticleCategory, NormalizedCategory } from '../../types/intelligence';
import { detectEntities } from './entityDetector';

// ─────────────────────────────────────────────────────────────────────────────
// Category mapping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps raw ArticleCategory values to the canonical NormalizedCategory vocabulary.
 * The normalization layer collapses the broader set into a smaller, stable set.
 */
const CATEGORY_MAP: Record<ArticleCategory, NormalizedCategory> = {
  model_release:    'model_release',
  funding:          'funding',
  regulation:       'regulation',
  policy:           'regulation',   // policy → regulation (same downstream treatment)
  research:         'research',
  company_strategy: 'company_news',
  product:          'company_news',
  other:            'analysis',
};

/**
 * Converts a raw ArticleCategory to its canonical NormalizedCategory.
 * Falls back to 'analysis' for any unmapped values.
 */
function normalizeCategory(raw: ArticleCategory): NormalizedCategory {
  return CATEGORY_MAP[raw] ?? 'analysis';
}

// ─────────────────────────────────────────────────────────────────────────────
// Text cleaning
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Collapses multiple consecutive whitespace characters (spaces, tabs, newlines)
 * into a single space and trims leading/trailing whitespace.
 */
function cleanWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Strips common UTM and analytics tracking parameters from a URL.
 * Preserves all other query parameters and the URL structure.
 *
 * Removed params: utm_source, utm_medium, utm_campaign, utm_term,
 *                 utm_content, ref, source, fbclid, gclid, msclkid
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
]);

function stripTrackingParams(url: string): string {
  try {
    const parsed = new URL(url);
    const keysToDelete: string[] = [];

    parsed.searchParams.forEach((_, key) => {
      if (TRACKING_PARAMS.has(key.toLowerCase())) {
        keysToDelete.push(key);
      }
    });

    for (const key of keysToDelete) {
      parsed.searchParams.delete(key);
    }

    return parsed.toString();
  } catch {
    // Return original if URL is malformed
    return url;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core normalizer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalises a raw Article from the ingestion layer.
 *
 * Returns a new Article object (does not mutate the input) with:
 * - Cleaned title and content
 * - Tracking parameters stripped from the URL
 * - A canonical `normalizedCategory`
 * - Entity tags populated: `detectedCompanies`, `detectedModels`, `detectedInvestors`
 * - Existing `tags` merged with detected entity names
 *
 * @param article  Raw Article from the ingestion layer.
 * @returns        Normalised Article ready for the intelligence pipeline.
 *
 * @example
 * ```ts
 * import { normalizeArticle } from '../normalization/articleNormalizer';
 * const normalized = normalizeArticle(rawArticle);
 * console.log(normalized.normalizedCategory);   // e.g. "funding"
 * console.log(normalized.detectedCompanies);    // e.g. ["OpenAI", "Anthropic"]
 * ```
 */
export function normalizeArticle(article: Article): Article {
  // ── 1. Clean text fields ──────────────────────────────────────────────────
  const cleanTitle   = cleanWhitespace(article.title);
  const cleanContent = cleanWhitespace(article.content);
  const cleanUrl     = stripTrackingParams(article.url);
  const cleanExcerpt = article.excerpt ? cleanWhitespace(article.excerpt) : article.excerpt;

  // ── 2. Normalize category ─────────────────────────────────────────────────
  const normalizedCategory = normalizeCategory(article.category);

  // ── 3. Detect entities ────────────────────────────────────────────────────
  const { companies, models, investors } = detectEntities(cleanTitle, cleanContent);

  const detectedCompanies  = companies.map((c) => c.name);
  const detectedModels     = models.map((m) => m.name);
  const detectedInvestors  = investors.map((i) => i.name);

  // ── 4. Merge entity names into tags (deduped) ─────────────────────────────
  const entityTags = [...detectedCompanies, ...detectedModels, ...detectedInvestors];
  const existingTags = article.tags ?? [];
  const mergedTags = Array.from(new Set([...existingTags, ...entityTags]));

  // ── 5. Return normalised article (non-mutating) ───────────────────────────
  return {
    ...article,
    title:               cleanTitle,
    content:             cleanContent,
    url:                 cleanUrl,
    excerpt:             cleanExcerpt,
    normalizedCategory,
    detectedCompanies:   detectedCompanies.length > 0 ? detectedCompanies : undefined,
    detectedModels:      detectedModels.length > 0 ? detectedModels : undefined,
    detectedInvestors:   detectedInvestors.length > 0 ? detectedInvestors : undefined,
    tags:                mergedTags.length > 0 ? mergedTags : undefined,
  };
}

/**
 * Normalises an array of Articles, returning a new array.
 * Errors in individual articles are caught and logged; the failing article
 * is returned unmodified to avoid dropping data from the pipeline.
 *
 * @param articles  Array of raw Articles from the ingestion layer.
 * @returns         Array of normalised Articles.
 */
export function normalizeArticles(articles: Article[]): Article[] {
  return articles.map((article) => {
    try {
      return normalizeArticle(article);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[articleNormalizer] Failed to normalize article "${article.id}": ${message}`);
      return article;
    }
  });
}
