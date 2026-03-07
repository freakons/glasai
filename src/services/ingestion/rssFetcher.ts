/**
 * Omterminal — RSS Fetcher
 *
 * Defines the interface and placeholder logic for fetching and normalising
 * articles from RSS/Atom feeds tracked in the source registry.
 *
 * This module is intentionally structural at this stage.
 * Full RSS parsing (xml2js / fast-xml-parser) will be wired in a future step.
 *
 * Architecture:
 *   Source (registry) → fetchArticlesFromSource() → Article[]
 *
 * The returned Article objects conform to the canonical Article type defined
 * in src/types/intelligence.ts, making them ready for the classifier and
 * event extraction pipeline.
 */

import type { Source } from '../../config/intelligenceSources';
import type { Article, ArticleCategory } from '../../types/intelligence';

// ─────────────────────────────────────────────────────────────────────────────
// Internal RSS types (raw feed shapes before normalisation)
// ─────────────────────────────────────────────────────────────────────────────

/** Represents a single item as parsed from an RSS 2.0 or Atom feed. */
interface RawFeedItem {
  title: string;
  link: string;
  pubDate?: string;
  description?: string;
  content?: string;
  author?: string;
  categories?: string[];
}

/** Parsed representation of a full RSS/Atom feed. */
interface ParsedFeed {
  title: string;
  items: RawFeedItem[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Result type
// ─────────────────────────────────────────────────────────────────────────────

export interface FetchResult {
  /** Source that was fetched */
  sourceId: string;
  /** Normalised articles ready for the pipeline */
  articles: Article[];
  /** Number of raw items returned by the feed */
  rawItemCount: number;
  /** ISO timestamp of when the fetch occurred */
  fetchedAt: string;
  /** Error message if the fetch failed, undefined on success */
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches articles from a single RSS/Atom source and returns normalised
 * Article objects ready for the intelligence pipeline.
 *
 * @param source  A Source object from the INTELLIGENCE_SOURCES registry.
 * @param limit   Maximum number of articles to return (default: 20).
 * @returns       A FetchResult containing normalised articles or an error.
 *
 * @example
 * ```ts
 * import { getSourceById } from '../../config/intelligenceSources';
 * const source = getSourceById('openai_blog')!;
 * const result = await fetchArticlesFromSource(source);
 * console.log(result.articles);
 * ```
 */
export async function fetchArticlesFromSource(
  source: Source,
  limit = 20
): Promise<FetchResult> {
  const fetchedAt = new Date().toISOString();

  try {
    // ── Step 1: Fetch the raw RSS feed ───────────────────────────────────────
    const feed = await fetchRawFeed(source.rss);

    // ── Step 2: Normalise each item into an Article ──────────────────────────
    const articles: Article[] = feed.items
      .slice(0, limit)
      .map((item) => normaliseItem(item, source));

    return {
      sourceId: source.id,
      articles,
      rawItemCount: feed.items.length,
      fetchedAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[rssFetcher] Failed to fetch source "${source.id}": ${message}`);
    return {
      sourceId: source.id,
      articles: [],
      rawItemCount: 0,
      fetchedAt,
      error: message,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch fetcher
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches articles from multiple sources in parallel.
 * Failures for individual sources are caught and returned as error results
 * without halting the entire batch.
 *
 * @param sources  Array of Source objects to fetch.
 * @param limit    Per-source article limit (default: 20).
 * @returns        Array of FetchResults (one per source).
 */
export async function fetchArticlesFromSources(
  sources: Source[],
  limit = 20
): Promise<FetchResult[]> {
  return Promise.all(sources.map((source) => fetchArticlesFromSource(source, limit)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers (placeholder implementations)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches and parses an RSS/Atom feed from a URL.
 *
 * TODO: Replace this placeholder with a real XML parser.
 *       Recommended libraries: fast-xml-parser, @extractus/feed-extractor
 *
 * @param url  RSS/Atom feed URL.
 */
async function fetchRawFeed(url: string): Promise<ParsedFeed> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Omterminal/1.0 (AI Intelligence Platform; +https://omterminal.com)',
      Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
    },
    // Abort slow feeds after 10 seconds
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching RSS feed: ${url}`);
  }

  // Placeholder: return empty feed until XML parser is wired in.
  // The real implementation will parse response.text() here.
  void (await response.text());

  return {
    title: '',
    items: [],
  };
}

/**
 * Maps a raw RSS item to the canonical Article type.
 *
 * Infers the ArticleCategory from the source category where possible;
 * the classifier in src/services/intelligence/classifier.ts will refine
 * this during pipeline processing.
 */
function normaliseItem(item: RawFeedItem, source: Source): Article {
  const id = generateArticleId(item.link);

  return {
    id,
    title: item.title.trim(),
    source: source.name,
    url: item.link,
    publishedAt: parseDate(item.pubDate),
    content: item.content || item.description || '',
    excerpt: item.description?.slice(0, 300),
    category: inferCategory(source),
    authors: item.author ? [item.author] : undefined,
    tags: item.categories,
  };
}

/**
 * Generates a stable article id from its URL using a simple hash.
 * Avoids importing a full crypto library for now.
 */
function generateArticleId(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = (hash << 5) - hash + url.charCodeAt(i);
    hash |= 0; // Convert to 32-bit int
  }
  return `art_${Math.abs(hash).toString(36)}`;
}

/**
 * Parses a date string from the feed into an ISO 8601 string.
 * Falls back to now() if the date is missing or unparseable.
 */
function parseDate(raw?: string): string {
  if (!raw) return new Date().toISOString();
  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

/**
 * Infers a broad ArticleCategory from the source's category.
 * The intelligence classifier will apply more precise categorisation later.
 */
function inferCategory(source: Source): ArticleCategory {
  const map: Record<string, ArticleCategory> = {
    model_lab: 'model_release',
    big_tech: 'other',
    research: 'research',
    policy: 'policy',
    venture_capital: 'funding',
    industry_analysis: 'other',
  };
  return map[source.category] ?? 'other';
}
