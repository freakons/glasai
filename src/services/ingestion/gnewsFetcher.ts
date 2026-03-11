/**
 * Omterminal — GNews Fetcher
 *
 * Secondary/supplementary ingestion source. Fetches AI-focused articles from
 * the GNews API and writes them to the articles and events tables.
 *
 * GNews free-tier budget: ~100 requests/day.
 * This module is rate-limited by design:
 *   - Default: 3 queries per pipeline run (GNEWS_MAX_QUERIES env, max 10)
 *   - Queries run in parallel to minimise wall-clock time
 *   - 429 responses are detected explicitly and never silently swallowed
 *
 * Pipeline position:
 *   gnewsFetcher → articleStore → eventStore → signals engine
 *
 * Article persistence:
 *   Each GNews article is written to the articles table BEFORE the
 *   corresponding event is written. This satisfies the FK constraint
 *   events.source_article_id → articles.id and ensures articles table
 *   is populated for the intelligence/snapshot read paths.
 */

import { classifyArticle, type IntelligenceCategory } from '../intelligence/classifier';
import { dbQuery as query } from '../../db/client';
import { saveEvent } from '../storage/eventStore';
import { saveArticle } from '../storage/articleStore';
import type { Event, EventType } from '@/types/intelligence';

// ─────────────────────────────────────────────────────────────────────────────
// GNews API types
// ─────────────────────────────────────────────────────────────────────────────

interface GNewsArticle {
  title: string;
  description: string;
  url: string;
  source: { name: string };
  publishedAt: string;
}

interface GNewsResponse {
  articles: GNewsArticle[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Query list (ordered by signal value — most useful queries first)
// ─────────────────────────────────────────────────────────────────────────────

const ALL_QUERIES = [
  'AI funding investment',        // → CAPITAL_ACCELERATION signals
  'AI model release launch',      // → MODEL_RELEASE_WAVE signals
  'artificial intelligence regulation', // → REGULATION_ACTIVITY signals
  'AI startup acquisition',       // → COMPANY_EXPANSION signals
  'machine learning research breakthrough', // → RESEARCH_MOMENTUM signals
  'large language model GPT Claude',
  'AI policy government',
  'generative AI enterprise',
  'AI safety regulation',
  'AI chip semiconductor',
];

/**
 * How many GNews queries to run per pipeline invocation.
 * Configured via GNEWS_MAX_QUERIES env (default: 3).
 * Free-tier safe: 3 queries × 24 runs/day = 72 requests/day (< 100 limit).
 */
function getMaxQueries(): number {
  const env = parseInt(process.env.GNEWS_MAX_QUERIES ?? '3', 10);
  return Math.max(1, Math.min(isNaN(env) ? 3 : env, ALL_QUERIES.length));
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

/** Stable event ID for GNews-derived events: gnews_<urlhash16> */
function urlToEventId(url: string): string {
  return `gnews_${urlHash(url)}`;
}

/** Stable article ID matching the articleStore convention: art_<urlhash16> */
function urlToArticleId(url: string): string {
  return `art_${urlHash(url)}`;
}

/** Map IntelligenceCategory → canonical EventType */
function categoryToEventType(category: IntelligenceCategory): EventType {
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
 * Map IntelligenceCategory → DB-friendly category matching frontend ArticleCat.
 */
function categoryToDbCategory(category: IntelligenceCategory): string {
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

async function withTimeout<T>(promise: Promise<T>, timeoutMs = 15000): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('fetch timeout')), timeoutMs)
  );
  return Promise.race([promise, timeout]) as Promise<T>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Result type
// ─────────────────────────────────────────────────────────────────────────────

export interface GNewsIngestResult {
  ingested: number;
  skipped: number;
  total: number;
  /** True if any query received a 429 rate-limit response */
  rateLimited: boolean;
  queriesAttempted: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main ingestion function
// ─────────────────────────────────────────────────────────────────────────────

export async function ingestGNews(): Promise<GNewsIngestResult> {
  const key = process.env.GNEWS_API_KEY;
  if (!key) {
    console.warn('[ingest:gnews] GNEWS_API_KEY not set — skipping GNews ingestion');
    return { ingested: 0, skipped: 0, total: 0, rateLimited: false, queriesAttempted: 0 };
  }

  const maxQueries = getMaxQueries();
  const queries = ALL_QUERIES.slice(0, maxQueries);

  console.log(
    `[ingest:gnews] Starting ${queries.length} queries in parallel` +
    ` (GNEWS_MAX_QUERIES=${maxQueries}, free-tier budget ~${queries.length}/run)`
  );

  let ingested = 0;
  let skipped = 0;
  let total = 0;
  let rateLimited = false;

  // ── Fetch all queries in parallel ──────────────────────────────────────────
  const queryResults = await Promise.allSettled(
    queries.map(async (q) => {
      const url =
        `https://gnews.io/api/v4/search?q=${encodeURIComponent(q)}` +
        `&lang=en&sortby=publishedAt&max=10&apikey=${key}`;

      let res: Response;
      try {
        res = await withTimeout(fetch(url));
      } catch {
        console.warn(`[ingest:gnews] Timeout on query "${q}"`);
        return { q, articles: [] as GNewsArticle[], error: 'timeout' as const };
      }

      // Explicit 429 detection — never swallow quota exhaustion silently
      if (res.status === 429) {
        console.warn(
          `[ingest:gnews] RATE_LIMITED (429) on query "${q}" — GNews free-tier quota likely exhausted.` +
          ` Reduce GNEWS_MAX_QUERIES or pipeline frequency.`
        );
        return { q, articles: [] as GNewsArticle[], error: 'rate_limited' as const };
      }

      if (!res.ok) {
        console.warn(`[ingest:gnews] HTTP ${res.status} on query "${q}"`);
        return { q, articles: [] as GNewsArticle[], error: `http_${res.status}` as const };
      }

      const data = (await res.json()) as GNewsResponse;
      const articles = data.articles || [];

      if (articles.length === 0) {
        console.log(`[ingest:gnews] No articles for query "${q}"`);
      } else {
        console.log(`[ingest:gnews] ${articles.length} articles for query "${q}"`);
      }

      return { q, articles, error: null };
    })
  );

  // ── Process results ──────────────────────────────────────────────────────
  for (const result of queryResults) {
    if (result.status === 'rejected') {
      console.error('[ingest:gnews] Query promise rejected:', result.reason);
      continue;
    }

    const { q, articles, error } = result.value;

    if (error === 'rate_limited') {
      rateLimited = true;
      continue;
    }

    if (error || articles.length === 0) continue;

    for (const article of articles) {
      total++;
      const category = classifyArticle(
        article.title + ' ' + (article.description || '')
      );
      const eventType = categoryToEventType(category);
      const dbCategory = categoryToDbCategory(category);
      const articleId = urlToArticleId(article.url);
      const eventId = urlToEventId(article.url);

      // Step 1: Write to articles table first.
      // This must succeed before the event insert to satisfy the FK constraint:
      //   events.source_article_id → articles.id
      // If articles is empty and source_article_id is non-null, the event
      // insert would silently fail with a FK violation caught by dbQuery.
      try {
        await saveArticle({
          id: articleId,
          title: article.title,
          source: article.source.name,
          url: article.url,
          publishedAt: article.publishedAt,
          category: dbCategory,
        });
      } catch (err) {
        console.error(`[ingest:gnews] Article save failed for "${article.url}":`, err);
        skipped++;
        continue;
      }

      // Step 2: Write event with valid source_article_id reference
      const event: Event = {
        id: eventId,
        type: eventType,
        company: article.source.name,
        title: article.title,
        description: article.description || '',
        timestamp: article.publishedAt,
        tags: [q],
        sourceArticle: {
          id: articleId,
          title: article.title,
          url: article.url,
          source: article.source.name,
        },
      };

      try {
        const inserted = await saveEvent(event);
        if (inserted) {
          ingested++;
        } else {
          skipped++; // duplicate (ON CONFLICT DO NOTHING)
        }
      } catch {
        skipped++;
      }

      // Legacy backward-compat write to intelligence_events.
      // Non-critical — failure here does not block article or event write.
      try {
        await query`
          INSERT INTO intelligence_events (
            title, summary, source_url, source_name,
            category, published_at
          ) VALUES (
            ${article.title},
            ${article.description || ''},
            ${article.url},
            ${article.source.name},
            ${category},
            ${article.publishedAt}
          )
          ON CONFLICT (source_url) DO NOTHING
        `;
      } catch {
        // Non-critical — intelligence_events is a legacy silo
      }
    }
  }

  if (rateLimited) {
    console.warn(
      '[ingest:gnews] GNews quota exhausted — pipeline relying on RSS sources this run.' +
      ' Consider setting GNEWS_MAX_QUERIES=1 or reducing pipeline cron frequency.'
    );
  }

  console.log(
    `[ingest:gnews] Done. queries=${queries.length} total=${total}` +
    ` ingested=${ingested} skipped=${skipped} rateLimited=${rateLimited}`
  );

  return { ingested, skipped, total, rateLimited, queriesAttempted: queries.length };
}
