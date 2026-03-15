/**
 * Omterminal — RSS Ingester
 *
 * Primary ingestion source for the intelligence pipeline. Fetches articles
 * from a curated set of RSS feeds, classifies them, persists them to the
 * articles table, and derives events for the signals engine.
 *
 * This is the HIGH-FREQUENCY source — no API quota limits.
 * GNews is the secondary/supplementary source with strict quota awareness.
 *
 * Pipeline position:
 *   rssIngester → articleStore → eventStore → signals engine
 *
 * Observability:
 *   - Logs per-source fetch results (articles found vs empty vs failed)
 *   - Detects 429 / rate-limit responses and logs them explicitly
 *   - Distinguishes between source failure, source empty, and source deduped
 *   - Returns structured RssIngestResult for the pipeline run record
 */

import { fetchArticlesFromSources } from './rssFetcher';
import { saveArticle } from '../storage/articleStore';
import { saveEvent } from '../storage/eventStore';
import { classifyArticle } from '../intelligence/classifier';
import { INTELLIGENCE_SOURCES } from '../../config/intelligenceSources';
import { getEnabledSources, getHighPrioritySources } from '../../config/sources/index';
import type { Event } from '@/types/intelligence';
import {
  canonicalizeUrl,
  cleanText,
  normalizeSourceName,
  normalizeTimestamp,
  generateArticleId,
  generateStableEventId,
  generateTitleFingerprint,
  categoryToEventType,
  categoryToDbCategory,
} from '../normalization/helpers';
import { detectAndLinkEntities } from '@/lib/entityResolver';

// ─────────────────────────────────────────────────────────────────────────────
// Primary source selection
//
// Sources are driven by the modular registry in src/config/sources/.
// All enabled sources are ingested; high-priority sources (reliability >= 8)
// are fetched first. Add/remove sources in the category files only.
// ─────────────────────────────────────────────────────────────────────────────

// Per-source article limit per pipeline run
const ARTICLES_PER_SOURCE = 15;

// ─────────────────────────────────────────────────────────────────────────────
// Result type
// ─────────────────────────────────────────────────────────────────────────────

export interface RssIngestResult {
  sourcesAttempted: number;
  sourcesFailed: number;
  sourcesRateLimited: number;
  sourcesEmpty: number;
  articlesNew: number;
  articlesDeduped: number;
  eventsNew: number;
  eventsDeduped: number;
}

// ID / category helpers are now imported from normalization/helpers.ts

// ─────────────────────────────────────────────────────────────────────────────
// Main ingestion function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ingest articles from the primary RSS source list.
 *
 * For each source:
 *   1. Fetch articles via rssFetcher (real rss-parser implementation)
 *   2. Classify each article using the intelligence classifier
 *   3. Write to articles table (saveArticle — ON CONFLICT url DO NOTHING)
 *   4. Derive an event and write to events table (saveEvent — ON CONFLICT id DO NOTHING)
 *
 * Individual source failures and DB errors are caught and logged without
 * aborting the entire batch. The result exposes per-category counts for
 * observability.
 *
 * @returns Structured ingestion result for the pipeline run record.
 */
export async function ingestRss(): Promise<RssIngestResult> {
  // Build the source list from the structured registry.
  // High-priority sources come first so they are fetched even if the
  // pipeline times out before reaching the tail of the list.
  const highPriority = getHighPrioritySources();
  const allEnabled = getEnabledSources();
  const highPriorityIds = new Set(highPriority.map((s) => s.id));
  const normalPriority = allEnabled.filter((s) => !highPriorityIds.has(s.id));

  // Map canonical sources to legacy Source shape for rssFetcher compatibility
  const sourceIds = [...highPriority, ...normalPriority].map((s) => s.id);
  const sources = INTELLIGENCE_SOURCES.filter((s) => sourceIds.includes(s.id));

  if (sources.length === 0) {
    console.warn('[rssIngester] No enabled sources found — check sources registry');
    return {
      sourcesAttempted: 0,
      sourcesFailed: 0,
      sourcesRateLimited: 0,
      sourcesEmpty: 0,
      articlesNew: 0,
      articlesDeduped: 0,
      eventsNew: 0,
      eventsDeduped: 0,
    };
  }

  console.log(`[rssIngester] Fetching from ${sources.length} sources (${sources.map((s) => s.id).join(', ')})`);

  const result: RssIngestResult = {
    sourcesAttempted: sources.length,
    sourcesFailed: 0,
    sourcesRateLimited: 0,
    sourcesEmpty: 0,
    articlesNew: 0,
    articlesDeduped: 0,
    eventsNew: 0,
    eventsDeduped: 0,
  };

  // Fetch all sources in parallel (each has its own 10s timeout in rssFetcher)
  const fetchResults = await fetchArticlesFromSources(sources, ARTICLES_PER_SOURCE);

  for (const fetchResult of fetchResults) {
    // ── Source-level error handling ──────────────────────────────────────────
    if (fetchResult.error) {
      const err = fetchResult.error;
      if (err.includes('429') || err.toLowerCase().includes('rate limit')) {
        console.warn(`[rssIngester] RATE_LIMITED source="${fetchResult.sourceId}" error="${err}"`);
        result.sourcesRateLimited++;
      } else {
        console.warn(`[rssIngester] FAILED source="${fetchResult.sourceId}" error="${err}"`);
        result.sourcesFailed++;
      }
      continue;
    }

    if (fetchResult.articles.length === 0) {
      console.log(
        `[rssIngester] EMPTY source="${fetchResult.sourceId}" rawItems=${fetchResult.rawItemCount}` +
        (fetchResult.rawItemCount > 0 ? ' (all items filtered/invalid)' : ' (feed returned 0 items)')
      );
      result.sourcesEmpty++;
      continue;
    }

    console.log(
      `[rssIngester] source="${fetchResult.sourceId}" articles=${fetchResult.articles.length} rawItems=${fetchResult.rawItemCount}`
    );

    // ── Article + event persistence ──────────────────────────────────────────
    for (const article of fetchResult.articles) {
      if (!article.url || !article.title) continue;

      // ── Normalize fields before classification and storage ──────────────
      const cleanTitle   = cleanText(article.title);
      const cleanContent = cleanText(article.content);
      const cleanExcerpt = cleanText(article.excerpt);
      const cleanUrl     = canonicalizeUrl(article.url);
      const sourceName   = normalizeSourceName(article.source);
      const publishedAt  = normalizeTimestamp(article.publishedAt);

      if (!cleanTitle || !cleanUrl) continue;

      // Classify on title + content/excerpt
      const classifyText = cleanTitle + ' ' + (cleanContent || cleanExcerpt);
      const intelligenceCategory = classifyArticle(classifyText);
      const dbCategory = categoryToDbCategory(intelligenceCategory);
      const eventType = categoryToEventType(intelligenceCategory);

      const articleId = generateArticleId(cleanUrl);
      const eventId = generateStableEventId(cleanUrl);
      const titleFingerprint = generateTitleFingerprint(cleanTitle);

      // Step 1: Write to articles table first.
      // Must succeed before writing the event — events.source_article_id
      // has a FK reference to articles.id (ON DELETE SET NULL).
      let articleInserted = false;
      try {
        articleInserted = await saveArticle({
          id: articleId,
          title: cleanTitle,
          source: sourceName,
          url: cleanUrl,
          publishedAt,
          category: dbCategory,
          titleFingerprint,
        });

        if (articleInserted) {
          result.articlesNew++;
        } else {
          result.articlesDeduped++;
        }
      } catch (err) {
        console.error(
          `[rssIngester] Article save failed source="${fetchResult.sourceId}" url="${cleanUrl}":`,
          err
        );
        // Do not attempt event insert if article write failed
        continue;
      }

      // Step 2: Derive and persist event.
      // source_article_id references the article we just wrote above.
      // Use entity detection to assign the correct company instead of sourceName.
      const detected = detectAndLinkEntities(cleanTitle, cleanContent || cleanExcerpt);
      const primaryCompany = detected.companies[0] ?? sourceName;
      const entityTags = [
        ...detected.companies,
        ...detected.models,
        ...detected.investors,
      ];
      const mergedTags = Array.from(new Set([...(article.tags ?? []), ...entityTags]));

      const event: Event = {
        id: eventId,
        type: eventType,
        company: primaryCompany,
        relatedModel: detected.models[0],
        title: cleanTitle,
        description: (cleanExcerpt || cleanContent).slice(0, 500),
        timestamp: publishedAt,
        tags: mergedTags.length > 0 ? mergedTags : article.tags,
        sourceArticle: {
          id: articleId,
          title: cleanTitle,
          url: cleanUrl,
          source: sourceName,
        },
      };

      try {
        const eventInserted = await saveEvent(event);
        if (eventInserted) {
          result.eventsNew++;
        } else {
          result.eventsDeduped++;
        }
      } catch (err) {
        console.error(
          `[rssIngester] Event save failed source="${fetchResult.sourceId}" url="${cleanUrl}":`,
          err
        );
      }
    }
  }

  // ── Summary log ─────────────────────────────────────────────────────────────
  const starvationWarning =
    result.articlesNew === 0 && result.sourcesFailed >= result.sourcesAttempted / 2;

  console.log(
    `[rssIngester] Done. ` +
    `sources=${result.sourcesAttempted} failed=${result.sourcesFailed} ` +
    `rateLimited=${result.sourcesRateLimited} empty=${result.sourcesEmpty} ` +
    `articlesNew=${result.articlesNew} articlesDeduped=${result.articlesDeduped} ` +
    `eventsNew=${result.eventsNew} eventsDeduped=${result.eventsDeduped}` +
    (starvationWarning ? ' — WARNING: source starvation detected' : '')
  );

  return result;
}
