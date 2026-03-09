import { NormalizedSignal } from './types';
import { IntelligenceResult } from '@/intelligence/types';

/**
 * Resolve the ingest endpoint URL.
 *
 * Priority:
 *   1. INGEST_URL env var (explicit override)
 *   2. VERCEL_URL (set automatically by Vercel on every deployment)
 *   3. NEXT_PUBLIC_APP_URL (explicit app URL for custom domains)
 *   4. localhost fallback for local development
 */
function getIngestUrl(): string {
  if (process.env.INGEST_URL) return process.env.INGEST_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}/api/intelligence/ingest`;
  if (process.env.NEXT_PUBLIC_APP_URL) return `${process.env.NEXT_PUBLIC_APP_URL}/api/intelligence/ingest`;
  return 'http://localhost:3000/api/intelligence/ingest';
}

export async function sendSignal(
  signal: NormalizedSignal,
  intelligence?: IntelligenceResult,
): Promise<void> {
  const payload = {
    title: signal.title,
    description: signal.description,
    summary: intelligence?.summary ?? signal.description,
    category: intelligence?.category,
    entities: intelligence?.entities,
    source: signal.source,
    url: signal.url,
    ai_model: signal.ai_model,
    confidence: intelligence?.confidence ?? 50,
  };

  const ingestUrl = getIngestUrl();
  let res: Response;
  try {
    res = await fetch(ingestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('[harvester/sender] network error sending signal:', signal.title, err);
    throw err;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`[harvester/sender] ingest returned ${res.status} for "${signal.title}":`, text);
    throw new Error(`Ingest API error: ${res.status}`);
  }

  console.log(`[harvester/sender] sent: "${signal.title}" (${signal.source}) [${intelligence?.category ?? 'unprocessed'}]`);
}
