import { classifyArticle } from '../intelligence/classifier';
import { dbQuery as query } from '../../db/client';

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

export async function ingestGNews(): Promise<{ ingested: number; skipped: number }> {
  const key = process.env.GNEWS_API_KEY;
  if (!key) {
    console.warn('[ingest] GNEWS_API_KEY not set');
    return { ingested: 0, skipped: 0 };
  }

  let ingested = 0;
  let skipped = 0;

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
        const category = classifyArticle(
          article.title + ' ' + (article.description || '')
        );

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
          ingested++;
        } catch {
          skipped++;
        }
      }
    } catch (err) {
      console.error(`[ingest] fetch error for "${q}":`, err);
    }
  }

  console.log(`[ingest] Done. ingested=${ingested} skipped=${skipped}`);
  return { ingested, skipped };
}
