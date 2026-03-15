/**
 * Omterminal — Signal Clustering & Corroboration Engine
 *
 * Two modes:
 *
 * 1. **Frontend clustering** (legacy): `clusterSignals(signals)` — synchronous,
 *    groups in-memory Signal[] into UI trend clusters. Used by intelligence pages.
 *
 * 2. **Corroboration engine** (new): `corroborateSignals()` — async, queries DB
 *    for recent signals, detects entity-based clusters, persists to signal_clusters.
 *    Used by the pipeline after signal generation.
 *
 * Corroboration algorithm:
 *   1. Load recent signals (last 24h)
 *   2. Group signals by entity
 *   3. Within each entity group, cluster by keyword similarity in titles
 *   4. If cluster has ≥2 signals, create cluster entry
 *
 * Confidence score:
 *   confidence = (signal_count * 10)
 *              + (average_significance_score / 2)
 *              + (unique_source_count * 5)
 *   Clamped to 0–100.
 */

import type { Signal, SignalCategory } from '@/data/mockSignals';
import { dbQuery } from '@/db/client';

// ═════════════════════════════════════════════════════════════════════════════
// PART A — Frontend Trend Clustering (legacy, synchronous)
// ═════════════════════════════════════════════════════════════════════════════

export interface SignalCluster {
  id: string;
  title: string;
  summary: string;
  signals: Signal[];
  entities: string[];
  category: SignalCategory;
  momentum: 'rising' | 'stable' | 'cooling';
  signalCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared keyword extraction
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
// Frontend clustering logic
// ─────────────────────────────────────────────────────────────────────────────

function areRelated(a: Signal, b: Signal): boolean {
  const shareEntity =
    a.entityId === b.entityId ||
    a.entityName.toLowerCase() === b.entityName.toLowerCase();
  if (shareEntity) return true;

  const sameCategory = a.category === b.category;
  if (!sameCategory) return false;

  const kwA = extractKeywords(`${a.title} ${a.summary}`);
  const kwB = extractKeywords(`${b.title} ${b.summary}`);
  return keywordsOverlap(kwA, kwB);
}

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

function collectEntities(signals: Signal[]): string[] {
  const seen = new Set<string>();
  for (const s of signals) {
    seen.add(s.entityName);
  }
  return Array.from(seen);
}

const CATEGORY_LABELS: Record<SignalCategory, string> = {
  models: 'Model Development',
  funding: 'Investment Activity',
  regulation: 'Regulatory Push',
  agents: 'Agent Ecosystem',
  research: 'Research Momentum',
  product: 'Product Expansion',
};

function generateTitle(signals: Signal[], category: SignalCategory): string {
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

  if (topCount > signals.length / 2) {
    return `${topEntity} ${catLabel}`;
  }
  if (entities.length <= 3) {
    return `${entities.join(' & ')} ${catLabel}`;
  }
  return `AI ${catLabel} Wave`;
}

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

  const contextSnippets = signals
    .filter((s) => s.context?.summary)
    .map((s) => s.context!.summary!)
    .slice(0, 2);

  if (contextSnippets.length > 0) {
    return `Multiple developments across ${entityList} indicate accelerating ${catLabel}. ${contextSnippets[0]}`;
  }

  return `${signals.length} signals across ${entityList} point to a growing trend in ${catLabel}, suggesting significant ecosystem movement.`;
}

const FRONTEND_MIN_CLUSTER_SIZE = 3;
const RECENCY_WINDOW_DAYS = 7;

/**
 * Cluster signals into emerging trend groups (frontend, synchronous).
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

  const recent = signals.filter((s) => new Date(s.date) >= cutoff);
  if (recent.length < FRONTEND_MIN_CLUSTER_SIZE) return [];

  // Union-Find clustering
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

  for (let i = 0; i < recent.length; i++) parent.set(i, i);

  for (let i = 0; i < recent.length; i++) {
    for (let j = i + 1; j < recent.length; j++) {
      if (areRelated(recent[i], recent[j])) {
        union(i, j);
      }
    }
  }

  const groups = new Map<number, Signal[]>();
  for (let i = 0; i < recent.length; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(recent[i]);
  }

  const clusters: SignalCluster[] = [];
  let clusterIndex = 0;

  for (const group of groups.values()) {
    if (group.length < FRONTEND_MIN_CLUSTER_SIZE) continue;

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

  const momentumOrder = { rising: 0, stable: 1, cooling: 2 };
  clusters.sort((a, b) => {
    const mDiff = momentumOrder[a.momentum] - momentumOrder[b.momentum];
    if (mDiff !== 0) return mDiff;
    return b.signalCount - a.signalCount;
  });

  return clusters;
}

// ═════════════════════════════════════════════════════════════════════════════
// PART B — Signal Corroboration Engine (DB-backed, async)
// ═════════════════════════════════════════════════════════════════════════════

interface RecentSignalRow {
  id: string;
  title: string;
  signal_type: string | null;
  affected_entities: string[] | null;
  significance_score: number | null;
  source_support_count: number | null;
  confidence_score: string | null;
  created_at: string;
}

export interface CorroborationCluster {
  entity: string;
  topic: string;
  confidence: number;
  signalCount: number;
  signalIds: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Corroboration helpers
// ─────────────────────────────────────────────────────────────────────────────

function titlesSimilar(a: string, b: string): boolean {
  const kwA = extractKeywords(a);
  const kwB = extractKeywords(b);
  let overlap = 0;
  for (const word of kwA) {
    if (kwB.has(word)) overlap++;
  }
  return overlap >= 2;
}

function computeCorroborationConfidence(
  signalCount: number,
  avgSignificance: number,
  uniqueSourceCount: number,
): number {
  const raw =
    (signalCount * 10) +
    (avgSignificance / 2) +
    (uniqueSourceCount * 5);
  return Math.min(100, Math.max(0, Math.round(raw)));
}

function extractTopic(titles: string[]): string {
  const freq = new Map<string, number>();
  for (const title of titles) {
    for (const kw of extractKeywords(title)) {
      freq.set(kw, (freq.get(kw) ?? 0) + 1);
    }
  }
  const top = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([word]) => word);
  return top.join(' ') || 'general';
}

// ─────────────────────────────────────────────────────────────────────────────
// Corroboration engine (pipeline entry point)
// ─────────────────────────────────────────────────────────────────────────────

const CORROBORATION_MIN_CLUSTER_SIZE = 2;

/**
 * Detect signal corroboration clusters and persist them to signal_clusters.
 *
 * Called by the pipeline after signal generation. Non-blocking — failures
 * are logged but do not abort the pipeline.
 *
 * 1. Loads signals from the last 24 hours
 * 2. Groups by affected entity
 * 3. Within each entity group, sub-clusters by keyword similarity
 * 4. Persists clusters with ≥2 signals
 */
export async function corroborateSignals(): Promise<CorroborationCluster[]> {
  const rows = await dbQuery<RecentSignalRow>`
    SELECT
      id, title, signal_type, affected_entities,
      significance_score, source_support_count, confidence_score,
      created_at
    FROM signals
    WHERE created_at > NOW() - INTERVAL '24 hours'
      AND status != 'rejected'
    ORDER BY created_at DESC
  `;

  if (rows.length < CORROBORATION_MIN_CLUSTER_SIZE) return [];

  // Group signals by entity
  const entityGroups = new Map<string, RecentSignalRow[]>();
  for (const row of rows) {
    const entities = row.affected_entities ?? [];
    if (entities.length === 0) {
      const key = row.signal_type ?? 'unknown';
      if (!entityGroups.has(key)) entityGroups.set(key, []);
      entityGroups.get(key)!.push(row);
    } else {
      for (const entity of entities) {
        const normalized = entity.toLowerCase().trim();
        if (!normalized) continue;
        if (!entityGroups.has(normalized)) entityGroups.set(normalized, []);
        entityGroups.get(normalized)!.push(row);
      }
    }
  }

  // Within each entity group, cluster by keyword similarity in titles
  const clusters: CorroborationCluster[] = [];

  for (const [entity, signals] of entityGroups) {
    if (signals.length < CORROBORATION_MIN_CLUSTER_SIZE) continue;

    const subClusters: RecentSignalRow[][] = [];
    for (const signal of signals) {
      let placed = false;
      for (const sc of subClusters) {
        if (titlesSimilar(signal.title, sc[0].title)) {
          sc.push(signal);
          placed = true;
          break;
        }
      }
      if (!placed) {
        subClusters.push([signal]);
      }
    }

    for (const sc of subClusters) {
      const uniqueSignals = new Map<string, RecentSignalRow>();
      for (const s of sc) uniqueSignals.set(s.id, s);
      const deduped = Array.from(uniqueSignals.values());

      if (deduped.length < CORROBORATION_MIN_CLUSTER_SIZE) continue;

      let sigSum = 0;
      let sigCount = 0;
      for (const s of deduped) {
        if (s.significance_score != null) {
          sigSum += s.significance_score;
          sigCount++;
        }
      }
      const avgSignificance = sigCount > 0 ? sigSum / sigCount : 50;

      let uniqueSources = 0;
      for (const s of deduped) {
        uniqueSources += (s.source_support_count ?? 1);
      }

      const confidence = computeCorroborationConfidence(
        deduped.length,
        avgSignificance,
        uniqueSources,
      );

      const topic = extractTopic(deduped.map(s => s.title));

      clusters.push({
        entity,
        topic,
        confidence,
        signalCount: deduped.length,
        signalIds: deduped.map(s => s.id),
      });
    }
  }

  if (clusters.length > 0) {
    await persistClusters(clusters);
  }

  return clusters;
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────────────────────────────────────

async function persistClusters(clusters: CorroborationCluster[]): Promise<void> {
  for (const cluster of clusters) {
    try {
      await dbQuery`
        INSERT INTO signal_clusters (entity, topic, confidence_score, signal_count)
        VALUES (${cluster.entity}, ${cluster.topic}, ${cluster.confidence}, ${cluster.signalCount})
      `;
    } catch (err) {
      console.error(
        '[clusterSignals] Failed to persist cluster:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Query helpers (for API)
// ─────────────────────────────────────────────────────────────────────────────

interface ClusterRow {
  id: string;
  entity: string;
  topic: string;
  confidence_score: number;
  signal_count: number;
  created_at: string;
}

/**
 * Retrieve recent signal clusters for the API.
 */
export async function getSignalClusters(limit = 50): Promise<ClusterRow[]> {
  const safeLimit = Math.min(Math.max(1, limit), 200);
  return dbQuery<ClusterRow>`
    SELECT id, entity, topic, confidence_score, signal_count, created_at
    FROM signal_clusters
    ORDER BY created_at DESC
    LIMIT ${safeLimit}
  `;
}
