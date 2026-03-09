import { normalizeSignal } from './normalizer';
import { sendSignal } from './sender';
import { processSignal } from '@/intelligence/processor';
import { scoreSignal } from '@/intelligence/scoring';
import { isDuplicate } from '@/intelligence/deduplicator';
import { getSources } from './sources/registry';

const MIN_SCORE = 40;

// ── Orchestration ─────────────────────────────────────────────────────────────
export async function runHarvester(): Promise<void> {
  const sources = getSources();
  console.log(`[harvester/runner] Harvester running with ${sources.length} sources`);

  let totalFetched = 0;
  let totalProcessed = 0;
  let duplicatesSkipped = 0;
  let lowScoreSkipped = 0;
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
      } catch (err) {
        console.error(`[harvester/runner] processing failed for "${normalized.title}":`, err);
        continue;
      }

      const score = scoreSignal(normalized, intelligence);

      if (await isDuplicate(normalized)) {
        console.log(`[harvester/runner] duplicate skipped: "${normalized.title}"`);
        duplicatesSkipped++;
        continue;
      }

      if (score < MIN_SCORE) {
        console.log(`[harvester/runner] low score skipped: "${normalized.title}" (score: ${score})`);
        lowScoreSkipped++;
        continue;
      }

      console.log(`[harvester/runner] processed: "${normalized.title}" → ${intelligence.category} (score: ${score})`);

      try {
        await sendSignal(normalized, intelligence);
        totalSent++;
      } catch {
        // error already logged in sendSignal — continue processing remaining signals
      }
    }
  }

  console.log(
    `[harvester/runner] done — signals fetched: ${totalFetched}, signals processed: ${totalProcessed}, ` +
    `duplicates skipped: ${duplicatesSkipped}, low score skipped: ${lowScoreSkipped}, signals sent: ${totalSent}`,
  );
}
