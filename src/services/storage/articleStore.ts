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
 * Deduplication strategy (layered):
 *   1. Exact URL match   — UNIQUE constraint on `url` column (DB-enforced)
 *   2. Near-duplicate     — title_fingerprint + 48h publish window (app-level)
 *
 * articles table schema (src/db/schema.sql):
 *   id                TEXT PRIMARY KEY
 *   title             TEXT NOT NULL
 *   source            TEXT NOT NULL
 *   url               TEXT NOT NULL UNIQUE
 *   published_at      TIMESTAMPTZ NOT NULL
 *   category          TEXT NOT NULL
 *   title_fingerprint TEXT           -- nullable for backward compat
 *   created_at        TIMESTAMPTZ DEFAULT NOW()
 */

import { dbQuery } from '@/db/client';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Time window (hours) for title-fingerprint near-duplicate detection.
 * Articles with the same title fingerprint published within this window
 * are considered duplicates. 48 hours is conservative enough to avoid
 * collapsing genuinely different stories that happen to share a title.
 */
const NEAR_DEDUP_WINDOW_HOURS = 48;

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
  /**
   * Title fingerprint for near-duplicate detection.
   * Generated via generateTitleFingerprint() in normalization/helpers.ts.
   * Nullable for backward compatibility with older ingestion paths.
   */
  titleFingerprint?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Near-duplicate detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Checks if a near-duplicate article already exists based on title fingerprint
 * and publish-time proximity.
 *
 * Returns the URL of the existing duplicate if found, or null if no match.
 * This is a conservative check — it requires BOTH:
 *   - Exact title fingerprint match
 *   - Published within ±NEAR_DEDUP_WINDOW_HOURS of the candidate
 */
async function findNearDuplicate(
  titleFingerprint: string,
  publishedAt: string,
): Promise<string | null> {
  if (!titleFingerprint) return null;

  // Compute the time window boundaries in JS to avoid SQL interval interpolation issues
  const pubDate = new Date(publishedAt);
  const windowMs = NEAR_DEDUP_WINDOW_HOURS * 60 * 60 * 1000;
  const windowStart = new Date(pubDate.getTime() - windowMs).toISOString();
  const windowEnd = new Date(pubDate.getTime() + windowMs).toISOString();

  const rows = await dbQuery<{ url: string }>`
    SELECT url FROM articles
    WHERE title_fingerprint = ${titleFingerprint}
      AND published_at >= ${windowStart}
      AND published_at <= ${windowEnd}
    LIMIT 1
  `;

  return rows.length > 0 ? rows[0].url : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist a single article to the articles table.
 *
 * Deduplication is layered:
 *   1. Near-duplicate check (title fingerprint + time window) — app-level
 *   2. Exact URL match — UNIQUE constraint on `url` (DB-enforced)
 *
 * Must be called BEFORE saveEvent() for the corresponding event so the
 * events.source_article_id FK reference is satisfied.
 *
 * @returns true if the row was newly inserted, false if already existed or
 *          was detected as a near-duplicate.
 */
export async function saveArticle(article: ArticleInput): Promise<boolean> {
  // Layer 1: Near-duplicate detection via title fingerprint
  if (article.titleFingerprint) {
    const existingUrl = await findNearDuplicate(
      article.titleFingerprint,
      article.publishedAt,
    );
    if (existingUrl) {
      console.log(
        `[articleStore] Near-duplicate detected: "${article.title}" ` +
        `matches existing article at ${existingUrl}`
      );
      return false;
    }
  }

  // Layer 2: Exact URL dedup via DB UNIQUE constraint
  const rows = await dbQuery<{ id: string }>`
    INSERT INTO articles (id, title, source, url, published_at, category, title_fingerprint)
    VALUES (
      ${article.id},
      ${article.title},
      ${article.source},
      ${article.url},
      ${article.publishedAt},
      ${article.category},
      ${article.titleFingerprint ?? null}
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
