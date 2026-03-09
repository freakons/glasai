import { SourceAdapter } from './sources/sourceAdapter';
import { RssSource } from './sources/rssSource';
import { normalizeSignal } from './normalizer';
import { sendSignal } from './sender';

// ── Register sources ──────────────────────────────────────────────────────────
const sources: SourceAdapter[] = [
  new RssSource('https://news.ycombinator.com/rss'),
];

// ── Orchestration ─────────────────────────────────────────────────────────────
export async function runHarvester(): Promise<void> {
  console.log(`[harvester/runner] starting — ${sources.length} source(s) registered`);

  let totalCollected = 0;
  let totalSent = 0;

  for (const source of sources) {
    console.log(`[harvester/runner] fetching from: ${source.name || 'unknown'}`);

    let rawSignals;
    try {
      rawSignals = await source.fetchSignals();
    } catch (err) {
      console.error(`[harvester/runner] failed to fetch from ${source.name}:`, err);
      continue;
    }

    console.log(`[harvester/runner] collected ${rawSignals.length} signal(s) from ${source.name}`);
    totalCollected += rawSignals.length;

    for (const raw of rawSignals) {
      const normalized = normalizeSignal(raw);
      try {
        await sendSignal(normalized);
        totalSent++;
      } catch {
        // error already logged in sendSignal — continue processing remaining signals
      }
    }
  }

  console.log(`[harvester/runner] done — collected: ${totalCollected}, sent: ${totalSent}`);
}
