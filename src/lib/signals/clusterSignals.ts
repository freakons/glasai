/**
 * Omterminal — Signal Clustering Engine
 *
 * Groups related signals into trend clusters based on shared entities,
 * categories, and temporal proximity. Clusters represent emerging
 * ecosystem trends detected automatically from the signal feed.
 *
 * Clustering rules:
 *   1. Only signals within the last 7 days are considered
 *   2. Signals must share at least one entity
 *   3. Same category OR overlapping keywords in title/summary
 *   4. Minimum cluster size = 3 signals
 */

import type { Signal, SignalCategory } from '@/data/mockSignals';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SignalCluster {
  /** Unique cluster identifier */
  id: string;
  /** Generated trend title */
  title: string;
  /** Short narrative summary of the cluster */
  summary: string;
  /** Signals grouped into this cluster */
  signals: Signal[];
  /** All unique entities involved */
  entities: string[];
  /** Dominant category */
  category: SignalCategory;
  /** Momentum indicator: ratio of recent to total activity */
  momentum: 'rising' | 'stable' | 'cooling';
  /** Number of signals in the cluster */
  signalCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Keyword extraction
// ─────────────────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'this', 'that', 'these',
  'those', 'it', 'its', 'not', 'no', 'as', 'if', 'than', 'new', 'first',
  'via', 'under', 'into', 'per', 'up', 'out', 'all', 'more',
]);

function extractKeywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
  );
}

function keywordsOverlap(a: Set<string>, b: Set<string>): boolean {
  let count = 0;
  for (const word of a) {
    if (b.has(word)) {
      count++;
      if (count >= 2) return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Clustering logic
// ─────────────────────────────────────────────────────────────────────────────

/** Check if two signals are related enough to cluster together. */
function areRelated(a: Signal, b: Signal): boolean {
  // Rule 2: must share at least one entity
  const shareEntity =
    a.entityId === b.entityId ||
    a.entityName.toLowerCase() === b.entityName.toLowerCase();

  if (shareEntity) return true;

  // Rule 3: same category OR overlapping keywords
  const sameCategory = a.category === b.category;
  if (!sameCategory) return false;

  const kwA = extractKeywords(`${a.title} ${a.summary}`);
  const kwB = extractKeywords(`${b.title} ${b.summary}`);

  return keywordsOverlap(kwA, kwB);
}

/** Compute momentum from signal dates relative to now. */
function computeClusterMomentum(
  signals: Signal[],
  now: Date,
): 'rising' | 'stable' | 'cooling' {
  const mid = new Date(now);
  mid.setDate(mid.getDate() - 3);

  let recent = 0;
  let older = 0;
  for (const s of signals) {
    const d = new Date(s.date);
    if (d >= mid) recent++;
    else older++;
  }

  if (recent > older) return 'rising';
  if (recent < older) return 'cooling';
  return 'stable';
}

/** Find the most common category among signals. */
function dominantCategory(signals: Signal[]): SignalCategory {
  const counts = new Map<SignalCategory, number>();
  for (const s of signals) {
    counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
  }
  let best: SignalCategory = signals[0].category;
  let bestCount = 0;
  for (const [cat, count] of counts) {
    if (count > bestCount) {
      best = cat;
      bestCount = count;
    }
  }
  return best;
}

/** Collect all unique entity names from signals. */
function collectEntities(signals: Signal[]): string[] {
  const seen = new Set<string>();
  for (const s of signals) {
    seen.add(s.entityName);
  }
  return Array.from(seen);
}

// ─────────────────────────────────────────────────────────────────────────────
// Title generation
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<SignalCategory, string> = {
  models: 'Model Development',
  funding: 'Investment Activity',
  regulation: 'Regulatory Push',
  agents: 'Agent Ecosystem',
  research: 'Research Momentum',
  product: 'Product Expansion',
};

function generateTitle(signals: Signal[], category: SignalCategory): string {
  // Find most common entity
  const entityCounts = new Map<string, number>();
  for (const s of signals) {
    entityCounts.set(s.entityName, (entityCounts.get(s.entityName) ?? 0) + 1);
  }
  let topEntity = '';
  let topCount = 0;
  for (const [name, count] of entityCounts) {
    if (count > topCount) {
      topEntity = name;
      topCount = count;
    }
  }

  const entities = collectEntities(signals);
  const catLabel = CATEGORY_LABELS[category];

  // If one entity dominates (>50%), use entity-focused title
  if (topCount > signals.length / 2) {
    return `${topEntity} ${catLabel}`;
  }

  // Multiple entities — use category + sector framing
  if (entities.length <= 3) {
    return `${entities.join(' & ')} ${catLabel}`;
  }

  return `AI ${catLabel} Wave`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary generation
// ─────────────────────────────────────────────────────────────────────────────

function generateSummary(
  signals: Signal[],
  entities: string[],
  category: SignalCategory,
): string {
  const catLabel = CATEGORY_LABELS[category].toLowerCase();
  const entityList =
    entities.length <= 3
      ? entities.join(', ')
      : `${entities.slice(0, 3).join(', ')} and others`;

  // Use context summaries if available
  const contextSnippets = signals
    .filter((s) => s.context?.summary)
    .map((s) => s.context!.summary!)
    .slice(0, 2);

  if (contextSnippets.length > 0) {
    return `Multiple developments across ${entityList} indicate accelerating ${catLabel}. ${contextSnippets[0]}`;
  }

  return `${signals.length} signals across ${entityList} point to a growing trend in ${catLabel}, suggesting significant ecosystem movement.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main clustering function
// ─────────────────────────────────────────────────────────────────────────────

const MIN_CLUSTER_SIZE = 3;
const RECENCY_WINDOW_DAYS = 7;

/**
 * Cluster signals into emerging trend groups.
 *
 * Algorithm:
 *   1. Filter to signals within the last 7 days
 *   2. Build adjacency using entity/category/keyword similarity
 *   3. Union-find to merge connected signals
 *   4. Filter clusters below minimum size
 *   5. Rank by signal count and momentum
 */
export function clusterSignals(signals: Signal[], now?: Date): SignalCluster[] {
  const reference = now ?? new Date();
  const cutoff = new Date(reference);
  cutoff.setDate(cutoff.getDate() - RECENCY_WINDOW_DAYS);

  // Step 1: filter recent signals
  const recent = signals.filter((s) => new Date(s.date) >= cutoff);

  if (recent.length < MIN_CLUSTER_SIZE) return [];

  // Step 2–3: Union-Find clustering
  const parent = new Map<number, number>();
  const find = (i: number): number => {
    if (!parent.has(i)) parent.set(i, i);
    if (parent.get(i) !== i) parent.set(i, find(parent.get(i)!));
    return parent.get(i)!;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  // Initialize all nodes
  for (let i = 0; i < recent.length; i++) parent.set(i, i);

  // Build edges
  for (let i = 0; i < recent.length; i++) {
    for (let j = i + 1; j < recent.length; j++) {
      if (areRelated(recent[i], recent[j])) {
        union(i, j);
      }
    }
  }

  // Step 3: Group by root
  const groups = new Map<number, Signal[]>();
  for (let i = 0; i < recent.length; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(recent[i]);
  }

  // Step 4: Filter and build clusters
  const clusters: SignalCluster[] = [];
  let clusterIndex = 0;

  for (const group of groups.values()) {
    if (group.length < MIN_CLUSTER_SIZE) continue;

    // Sort signals by date descending within cluster
    group.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const category = dominantCategory(group);
    const entities = collectEntities(group);
    const momentum = computeClusterMomentum(group, reference);

    clusterIndex++;
    clusters.push({
      id: `cluster-${clusterIndex}`,
      title: generateTitle(group, category),
      summary: generateSummary(group, entities, category),
      signals: group,
      entities,
      category,
      momentum,
      signalCount: group.length,
    });
  }

  // Step 5: Sort clusters by signal count desc, then momentum priority
  const momentumOrder = { rising: 0, stable: 1, cooling: 2 };
  clusters.sort((a, b) => {
    const mDiff = momentumOrder[a.momentum] - momentumOrder[b.momentum];
    if (mDiff !== 0) return mDiff;
    return b.signalCount - a.signalCount;
  });

  return clusters;
}
