import { SourceAdapter } from './sources/sourceAdapter';
import { RssSource } from './sources/rssSource';
import { normalizeSignal } from './normalizer';
import { sendSignal } from './sender';
import { processSignal } from '@/intelligence/processor';

// ── Register sources ──────────────────────────────────────────────────────────
const sources: SourceAdapter[] = [
  new RssSource('https://news.ycombinator.com/rss'),
];

// ── Orchestration ─────────────────────────────────────────────────────────────
export async function runHarvester(): Promise<void> {
  console.log(`[harvester/runner] starting — ${sources.length} source(s) registered`);

  let totalFetched = 0;
  let totalProcessed = 0;
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

    console.log(`[harvester/runner] signals fetched: ${rawSignals.length} from ${source.name}`);
    totalFetched += rawSignals.length;

    for (const raw of rawSignals) {
      const normalized = normalizeSignal(raw);

      let intelligence;
      try {
        intelligence = await processSignal(normalized);
        totalProcessed++;
        console.log(`[harvester/runner] processed: "${normalized.title}" → ${intelligence.category} (confidence: ${intelligence.confidence})`);
      } catch (err) {
        console.error(`[harvester/runner] processing failed for "${normalized.title}":`, err);
      }

      try {
        await sendSignal(normalized, intelligence);
        totalSent++;
      } catch {
        // error already logged in sendSignal — continue processing remaining signals
      }
    }
  }

  console.log(`[harvester/runner] done — signals fetched: ${totalFetched}, signals processed: ${totalProcessed}, signals sent: ${totalSent}`);
}
