import { NormalizedSignal } from './types';
import { IntelligenceResult } from '@/intelligence/types';

const INGEST_URL = process.env.INGEST_URL ?? 'http://localhost:3000/api/intelligence/ingest';

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

  let res: Response;
  try {
    res = await fetch(INGEST_URL, {
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
