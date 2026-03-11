/**
 * Omterminal — Article Store
 *
 * Persistence layer for raw articles ingested from RSS and news sources.
 * Articles are the foundation of the intelligence pipeline — events and
 * signals are derived from them.
 *
 * Pipeline position:
 *   RSS/GNews ingestion → articleStore → eventStore → signals engine
 *
 * articles table schema (src/db/schema.sql):
 *   id           TEXT PRIMARY KEY
 *   title        TEXT NOT NULL
 *   source       TEXT NOT NULL
 *   url          TEXT NOT NULL UNIQUE
 *   published_at TIMESTAMPTZ NOT NULL
 *   category     TEXT NOT NULL
 *   created_at   TIMESTAMPTZ DEFAULT NOW()
 *
 * Note: category column stores DB-friendly values: 'models' | 'funding' |
 * 'regulation' | 'research' | 'product' | 'agents' — matching the frontend
 * ArticleCat type used by getArticles() in db/queries.ts.
 */

import { dbQuery } from '@/db/client';

// ─────────────────────────────────────────────────────────────────────────────
// Input type
// ─────────────────────────────────────────────────────────────────────────────

export interface ArticleInput {
  /** Stable article ID, e.g. art_<urlhash16> */
  id: string;
  /** Article headline */
  title: string;
  /** Publisher / source name, e.g. "VentureBeat" */
  source: string;
  /** Canonical article URL */
  url: string;
  /** ISO 8601 publication timestamp */
  publishedAt: string;
  /**
   * DB-friendly category: 'models' | 'funding' | 'regulation' |
   * 'research' | 'product' | 'agents'
   * (not the ArticleCategory type from intelligence.ts)
   */
  category: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist a single article to the articles table.
 *
 * Deduplication is on the UNIQUE url column — inserting the same URL twice
 * is safe and idempotent (ON CONFLICT DO NOTHING).
 *
 * Must be called BEFORE saveEvent() for the corresponding event so the
 * events.source_article_id FK reference is satisfied.
 *
 * @returns true if the row was newly inserted, false if already existed.
 */
export async function saveArticle(article: ArticleInput): Promise<boolean> {
  const rows = await dbQuery<{ id: string }>`
    INSERT INTO articles (id, title, source, url, published_at, category)
    VALUES (
      ${article.id},
      ${article.title},
      ${article.source},
      ${article.url},
      ${article.publishedAt},
      ${article.category}
    )
    ON CONFLICT (url) DO NOTHING
    RETURNING id
  `;
  return rows.length > 0;
}

/**
 * Persist an array of articles in parallel, skipping duplicates.
 *
 * Individual failures are caught and logged; they do not abort the batch.
 *
 * @returns Counts of newly inserted vs. already-existing (deduped) articles.
 */
export async function saveArticles(
  articles: ArticleInput[],
): Promise<{ inserted: number; deduped: number }> {
  if (articles.length === 0) return { inserted: 0, deduped: 0 };

  const results = await Promise.allSettled(articles.map(saveArticle));

  let inserted = 0;
  let deduped = 0;
  for (const result of results) {
    if (result.status === 'fulfilled') {
      if (result.value) inserted++;
      else deduped++;
    } else {
      console.error('[articleStore] Failed to save article:', result.reason);
    }
  }

  console.log(`[articleStore] saveArticles: ${inserted} inserted, ${deduped} deduped (of ${articles.length} total)`);
  return { inserted, deduped };
}
