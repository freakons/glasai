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
import { classifyArticle, type IntelligenceCategory } from '../intelligence/classifier';
import { INTELLIGENCE_SOURCES } from '../../config/intelligenceSources';
import type { Event, EventType } from '@/types/intelligence';

// ─────────────────────────────────────────────────────────────────────────────
// Primary source selection
//
// Curated subset of INTELLIGENCE_SOURCES used in main pipeline runs.
// Criteria: publicly accessible without auth, updates frequently, high signal.
// Avoids paywalled sources (The Information, Stratechery).
// ─────────────────────────────────────────────────────────────────────────────

const PRIMARY_SOURCE_IDS: string[] = [
  'venturebeat_ai',    // Multiple articles/day — broad AI coverage
  'mit_tech_review_ai', // Quality AI analysis
  'arxiv_ai',          // High-volume research papers — feeds RESEARCH_MOMENTUM
  'crunchbase_ai',     // Funding news — feeds CAPITAL_ACCELERATION
  'semafor_ai',        // Daily AI news
  'openai_blog',       // Model releases — feeds MODEL_RELEASE_WAVE
  'anthropic_news',    // Model releases
  'interconnects',     // Independent AI research analysis
];

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

// ─────────────────────────────────────────────────────────────────────────────
// ID / category helpers
// ─────────────────────────────────────────────────────────────────────────────

function urlHash(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = (hash << 5) - hash + url.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/** Stable article ID matching the articleStore convention: art_<urlhash16> */
function urlToArticleId(url: string): string {
  return `art_${urlHash(url)}`;
}

/** Stable event ID for RSS-derived events: rss_<urlhash16> */
function urlToEventId(url: string): string {
  return `rss_${urlHash(url)}`;
}

/** Map IntelligenceCategory → canonical EventType for the events table */
function categoryToEventType(cat: IntelligenceCategory): EventType {
  switch (cat) {
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
 * Map IntelligenceCategory → DB-friendly category string used by
 * getArticles() in db/queries.ts (matches frontend ArticleCat type).
 */
function categoryToDbCategory(cat: IntelligenceCategory): string {
  switch (cat) {
    case 'MODEL_RELEASE': return 'models';
    case 'FUNDING':       return 'funding';
    case 'REGULATION':    return 'regulation';
    case 'POLICY':        return 'regulation';
    case 'RESEARCH':      return 'research';
    case 'COMPANY_MOVE':  return 'product';
    default:              return 'research';
  }
}

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
  const sources = INTELLIGENCE_SOURCES.filter((s) =>
    PRIMARY_SOURCE_IDS.includes(s.id)
  );

  if (sources.length === 0) {
    console.warn('[rssIngester] No primary sources found — check PRIMARY_SOURCE_IDS against intelligenceSources registry');
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

      // Classify on title + content/excerpt
      const classifyText = article.title + ' ' + (article.content || article.excerpt || '');
      const intelligenceCategory = classifyArticle(classifyText);
      const dbCategory = categoryToDbCategory(intelligenceCategory);
      const eventType = categoryToEventType(intelligenceCategory);

      const articleId = urlToArticleId(article.url);
      const eventId = urlToEventId(article.url);

      // Step 1: Write to articles table first.
      // Must succeed before writing the event — events.source_article_id
      // has a FK reference to articles.id (ON DELETE SET NULL).
      let articleInserted = false;
      try {
        articleInserted = await saveArticle({
          id: articleId,
          title: article.title,
          source: article.source,
          url: article.url,
          publishedAt: article.publishedAt,
          category: dbCategory,
        });

        if (articleInserted) {
          result.articlesNew++;
        } else {
          result.articlesDeduped++;
        }
      } catch (err) {
        console.error(
          `[rssIngester] Article save failed source="${fetchResult.sourceId}" url="${article.url}":`,
          err
        );
        // Do not attempt event insert if article write failed
        continue;
      }

      // Step 2: Derive and persist event.
      // source_article_id references the article we just wrote above.
      const event: Event = {
        id: eventId,
        type: eventType,
        company: article.source,
        title: article.title,
        description: (article.excerpt || article.content || '').slice(0, 500),
        timestamp: article.publishedAt,
        tags: article.tags,
        sourceArticle: {
          id: articleId,
          title: article.title,
          url: article.url,
          source: article.source,
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
          `[rssIngester] Event save failed source="${fetchResult.sourceId}" url="${article.url}":`,
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
