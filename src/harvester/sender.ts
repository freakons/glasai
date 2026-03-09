import { NormalizedSignal } from './types';

const INGEST_URL = process.env.INGEST_URL ?? 'http://localhost:3000/api/intelligence/ingest';

// Default confidence for harvester-sourced signals (mid-range pending trust evaluation).
const HARVESTER_CONFIDENCE = 50;

export async function sendSignal(signal: NormalizedSignal): Promise<void> {
  const payload = {
    title: signal.title,
    summary: signal.description,
    source: signal.source,
    url: signal.url,
    ai_model: signal.ai_model,
    confidence: HARVESTER_CONFIDENCE,
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

  console.log(`[harvester/sender] sent: "${signal.title}" (${signal.source})`);
}
