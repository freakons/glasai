import { TrendSignal, TrendResult } from './types';
import { clusterTopics } from './cluster';
import { clusterTopicsSemantic } from './semanticCluster';
import { computeSignalImportance, RankedSignal } from '@/intelligence/rankingEngine';

const MIN_OCCURRENCES = 3;

/** Convert a TrendSignal to the RankedSignal shape expected by the ranking engine. */
function toRankedSignal(signal: TrendSignal): RankedSignal {
  return {
    intelligence_score: signal.intelligence_score ?? 50,
    trust_score:        signal.trust_score        ?? 50,
    source:             signal.source,
    entity_count:       signal.entities.length,
    created_at:         signal.published_at ?? new Date().toISOString(),
    entities:           signal.entities.map((e) => e.name),
  };
}

export async function aggregateTrends(signals: TrendSignal[]): Promise<TrendResult[]> {
  const rankedSignals = signals.map(toRankedSignal);

  // entity name → { count, importance_score sum, velocity_score sum, categories, related entities }
  const entityFreq = new Map<string, {
    count:           number;
    importanceSum:   number;
    velocitySum:     number;
    categories:      string[];
    related:         Set<string>;
  }>();

  for (let i = 0; i < signals.length; i++) {
    const signal       = signals[i];
    const rankedSignal = rankedSignals[i];
    const names        = signal.entities.map((e) => e.name);

    const { importance_score, velocity_score } = await computeSignalImportance(rankedSignal);

    for (const name of names) {
      if (!entityFreq.has(name)) {
        entityFreq.set(name, { count: 0, importanceSum: 0, velocitySum: 0, categories: [], related: new Set() });
      }
      const entry = entityFreq.get(name)!;
      entry.count++;
      entry.importanceSum += importance_score;
      entry.velocitySum   += velocity_score;
      entry.categories.push(signal.category);
      // track co-occurring entities
      for (const other of names) {
        if (other !== name) entry.related.add(other);
      }
    }
  }

  const trends: TrendResult[] = [];

  for (const [entity, { count, importanceSum, velocitySum, categories, related }] of entityFreq) {
    if (count < MIN_OCCURRENCES) continue;

    // most common category among this entity's signals
    const categoryFreq = new Map<string, number>();
    for (const cat of categories) {
      categoryFreq.set(cat, (categoryFreq.get(cat) ?? 0) + 1);
    }
    const dominantCategory = [...categoryFreq.entries()].sort((a, b) => b[1] - a[1])[0][0];

    // related entities (up to 5)
    const relatedEntities = [...related].slice(0, 5);

    // human-readable category label for summary
    const categoryLabel = dominantCategory.replace(/_/g, ' ');

    const avgVelocity = velocitySum / count;

    trends.push({
      topic:            entity,
      category:         dominantCategory,
      signal_count:     count,
      score:            importanceSum,          // Σ importance_score replaces old source-weight sum
      importance_score: importanceSum,
      velocity_score:   Math.round(avgVelocity * 100) / 100,
      entities:         relatedEntities,
      summary:          `Multiple signals mention ${entity} across ${categoryLabel} activity.`,
      confidence:       Math.min(100, count * 20),
    });
  }

  // cluster similar topics and merge each cluster into its canonical entry
  // use semantic (embedding-based) clustering when API key is available
  const topicIndex = new Map(trends.map((t) => [t.topic, t]));
  const topicNames = trends.map((t) => t.topic);
  const clusters: string[][] = process.env.OPENAI_API_KEY
    ? (await clusterTopicsSemantic(topicNames)).map((c) => c.members)
    : await clusterTopics(topicNames);
  const merged: TrendResult[] = [];

  for (const cluster of clusters) {
    const canonical = topicIndex.get(cluster[0])!;
    if (cluster.length === 1) {
      merged.push(canonical);
      continue;
    }
    // fold every non-canonical member into the canonical entry
    let combinedSignalCount = canonical.signal_count;
    let combinedImportance  = canonical.importance_score;
    let combinedVelocitySum = canonical.velocity_score * canonical.signal_count;
    const combinedEntities  = new Set(canonical.entities);

    for (const member of cluster.slice(1)) {
      const t = topicIndex.get(member)!;
      combinedSignalCount  += t.signal_count;
      combinedImportance   += t.importance_score;
      combinedVelocitySum  += t.velocity_score * t.signal_count;
      t.entities.forEach((e) => combinedEntities.add(e));
    }

    const combinedAvgVelocity = combinedVelocitySum / combinedSignalCount;

    merged.push({
      ...canonical,
      signal_count:     combinedSignalCount,
      score:            combinedImportance,
      importance_score: combinedImportance,
      velocity_score:   Math.round(combinedAvgVelocity * 100) / 100,
      entities:         [...combinedEntities].filter((e) => e !== canonical.topic).slice(0, 5),
      confidence:       Math.min(100, combinedSignalCount * 20),
    });
  }

  // Sort by importance (quality-weighted sum) first, then confidence as tie-breaker.
  // This ensures trends backed by high-quality, diverse signals rank above
  // those that merely have many low-quality mentions.
  return merged.sort((a, b) => {
    const impDiff = b.importance_score - a.importance_score;
    if (impDiff !== 0) return impDiff;
    return b.confidence - a.confidence;
  });
}
