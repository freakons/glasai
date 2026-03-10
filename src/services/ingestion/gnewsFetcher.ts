import { classifyArticle, type IntelligenceCategory } from '../intelligence/classifier';
import { dbQuery as query } from '../../db/client';
import { saveEvent } from '../storage/eventStore';
import type { Event, EventType } from '@/types/intelligence';

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

// AI-focused search queries for the intelligence terminal
const QUERIES = [
  'artificial intelligence regulation',
  'AI model release',
  'AI funding investment',
  'AI policy government',
  'machine learning research',
  'large language model',
  'AI startup acquisition',
  'AI safety regulation',
  'generative AI enterprise',
  'AI chip semiconductor',
];

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs = 15000
): Promise<T> {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('ingestion timeout')), timeoutMs)
  );
  return Promise.race([promise, timeout]) as Promise<T>;
}

/** Map the classifier's IntelligenceCategory → canonical EventType for the events table. */
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

/** Deterministic event ID from URL so duplicates are idempotent. */
function urlToEventId(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = (hash << 5) - hash + url.charCodeAt(i);
    hash |= 0;
  }
  return `gnews_${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

export async function ingestGNews(): Promise<{ ingested: number; skipped: number; total: number }> {
  const key = process.env.GNEWS_API_KEY;
  if (!key) {
    console.warn('[ingest] GNEWS_API_KEY not set');
    return { ingested: 0, skipped: 0, total: 0 };
  }

  let ingested = 0;
  let skipped = 0;
  let total = 0;

  for (const q of QUERIES) {
    try {
      const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(q)}&lang=en&sortby=publishedAt&max=10&apikey=${key}`;
      let res: Response;
      try {
        res = await withTimeout(fetch(url));
      } catch {
        console.warn('[ingest] gnews timeout');
        continue;
      }

      if (!res.ok) {
        console.warn(`[ingest] GNews error for query "${q}":`, res.status);
        continue;
      }

      const data = (await res.json()) as GNewsResponse;
      const articles = data.articles || [];

      for (const article of articles) {
        total++;
        const category = classifyArticle(
          article.title + ' ' + (article.description || '')
        );
        const eventType = categoryToEventType(category);

        // Build a canonical Event and write to the events table
        const event: Event = {
          id:          urlToEventId(article.url),
          type:        eventType,
          company:     article.source.name,
          title:       article.title,
          description: article.description || '',
          timestamp:   article.publishedAt,
          tags:        [q],
          sourceArticle: {
            id:     urlToEventId(article.url),
            title:  article.title,
            url:    article.url,
            source: article.source.name,
          },
        };

        try {
          const inserted = await saveEvent(event);
          if (inserted) {
            ingested++;
          } else {
            skipped++; // duplicate, ON CONFLICT DO NOTHING
          }
        } catch {
          skipped++;
        }

        // Also write to intelligence_events for backward compatibility
        // (snapshot reads from this table). This is a transitional write
        // that can be removed once /api/snapshot is migrated.
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
    } catch (err) {
      console.error(`[ingest] fetch error for "${q}":`, err);
    }
  }

  console.log(`[ingest] Done. total=${total} ingested=${ingested} skipped=${skipped}`);
  return { ingested, skipped, total };
}
