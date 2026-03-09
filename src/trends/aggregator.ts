import { TrendSignal, TrendResult } from './types';

const MIN_OCCURRENCES = 3;

export function aggregateTrends(signals: TrendSignal[]): TrendResult[] {
  // entity name → { count, categories, related entities }
  const entityFreq = new Map<string, { count: number; categories: string[]; related: Set<string> }>();

  for (const signal of signals) {
    const names = signal.entities.map((e) => e.name);
    for (const name of names) {
      if (!entityFreq.has(name)) {
        entityFreq.set(name, { count: 0, categories: [], related: new Set() });
      }
      const entry = entityFreq.get(name)!;
      entry.count++;
      entry.categories.push(signal.category);
      // track co-occurring entities
      for (const other of names) {
        if (other !== name) entry.related.add(other);
      }
    }
  }

  const trends: TrendResult[] = [];

  for (const [entity, { count, categories, related }] of entityFreq) {
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

    trends.push({
      topic: entity,
      category: dominantCategory,
      signal_count: count,
      entities: relatedEntities,
      summary: `Multiple signals mention ${entity} across ${categoryLabel} activity.`,
      confidence: Math.min(100, count * 20),
    });
  }

  // highest confidence first
  return trends.sort((a, b) => b.confidence - a.confidence);
}
