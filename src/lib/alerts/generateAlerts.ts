/**
 * Omterminal — Personal Intelligence Alert Generator
 *
 * Evaluates signals and clusters to produce user-facing alerts that are
 * persisted to the `alerts` table.
 *
 * Platform alert types (active):
 *   signal_high_impact    — signal significance_score >= 75
 *   signal_rising_momentum — signal cluster momentum = 'rising'
 *   trend_detected        — new cluster detected with >= 3 signals
 *   trend_rising          — cluster with rising momentum
 *
 * Personal alert types (watched entities):
 *   watched_entity_high_impact — watched entity in a high-impact signal
 *   watched_entity_rising      — watched entity in a rising-momentum signal
 *   watched_entity_trend       — watched entity in a new or rising trend
 *
 * Legacy personal types (reserved):
 *   entity_watch, trend_watch, category_watch
 */

import { dbQuery } from '@/db/client';
import { getUsersWatchingEntityNames } from '@/db/queries';
import type { Signal } from '@/data/mockSignals';
import type { SignalCluster } from '@/lib/signals/clusterSignals';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Platform alerts — generated automatically from signal/trend analysis. */
export type PlatformAlertType =
  | 'signal_high_impact'
  | 'signal_rising_momentum'
  | 'trend_detected'
  | 'trend_rising';

/** Personal alerts for watched entities. */
export type WatchedEntityAlertType =
  | 'watched_entity_high_impact'
  | 'watched_entity_rising'
  | 'watched_entity_trend';

/** Legacy personal alert types (reserved for future use). */
export type LegacyPersonalAlertType =
  | 'entity_watch'
  | 'trend_watch'
  | 'category_watch';

export type PersonalAlertType = WatchedEntityAlertType | LegacyPersonalAlertType;

export type AlertType = PlatformAlertType | PersonalAlertType;

/** Priority levels: 0 = low, 1 = medium, 2 = high */
export type AlertPriority = 0 | 1 | 2;

/** Map alert types to their default priority. */
export const ALERT_PRIORITY_MAP: Record<PlatformAlertType | WatchedEntityAlertType, AlertPriority> = {
  signal_high_impact: 2,
  signal_rising_momentum: 1,
  trend_detected: 1,
  trend_rising: 0,
  watched_entity_high_impact: 2,
  watched_entity_rising: 1,
  watched_entity_trend: 1,
};

export interface PersonalAlert {
  id: string;
  userId: string | null;
  type: AlertType;
  entityName: string | null;
  signalId: string | null;
  trendId: string | null;
  title: string;
  message: string;
  priority: AlertPriority;
  createdAt: string;
  read: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const HIGH_IMPACT_THRESHOLD = 75;
const DEDUP_WINDOW_HOURS = 24;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function alertId(): string {
  return `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Deduplication
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a duplicate alert already exists within the last 24 hours.
 * For platform alerts: matches on (type + signal_id) or (type + trend_id).
 * For personal alerts: also matches on user_id.
 */
async function isDuplicate(
  type: AlertType,
  signalId: string | null,
  trendId: string | null,
  userId?: string | null,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - DEDUP_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  if (userId && signalId) {
    const rows = await dbQuery<{ count: string }>`
      SELECT COUNT(*) AS count FROM alerts
      WHERE type = ${type} AND signal_id = ${signalId} AND user_id = ${userId} AND created_at > ${cutoff}
    `;
    if (parseInt(rows[0]?.count ?? '0', 10) > 0) return true;
  } else if (signalId) {
    const rows = await dbQuery<{ count: string }>`
      SELECT COUNT(*) AS count FROM alerts
      WHERE type = ${type} AND signal_id = ${signalId} AND user_id IS NULL AND created_at > ${cutoff}
    `;
    if (parseInt(rows[0]?.count ?? '0', 10) > 0) return true;
  }

  if (userId && trendId) {
    const rows = await dbQuery<{ count: string }>`
      SELECT COUNT(*) AS count FROM alerts
      WHERE type = ${type} AND trend_id = ${trendId} AND user_id = ${userId} AND created_at > ${cutoff}
    `;
    if (parseInt(rows[0]?.count ?? '0', 10) > 0) return true;
  } else if (trendId) {
    const rows = await dbQuery<{ count: string }>`
      SELECT COUNT(*) AS count FROM alerts
      WHERE type = ${type} AND trend_id = ${trendId} AND user_id IS NULL AND created_at > ${cutoff}
    `;
    if (parseInt(rows[0]?.count ?? '0', 10) > 0) return true;
  }

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Alert generators (platform alerts only — personal alerts disabled)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate alerts for high-impact signals (significance_score >= 75).
 */
function generateHighImpactAlerts(signals: Signal[]): PersonalAlert[] {
  const alerts: PersonalAlert[] = [];

  for (const signal of signals) {
    const score = signal.significanceScore ?? (signal.confidence * 100);
    if (score < HIGH_IMPACT_THRESHOLD) continue;

    alerts.push({
      id: alertId(),
      userId: null,
      type: 'signal_high_impact',
      entityName: signal.entityName,
      signalId: signal.id,
      trendId: null,
      title: 'High-impact signal detected',
      message: `${signal.entityName}: ${signal.title}`,
      priority: ALERT_PRIORITY_MAP.signal_high_impact,
      createdAt: new Date().toISOString(),
      read: false,
    });
  }

  return alerts;
}

/**
 * Generate alerts for rising momentum clusters.
 */
function generateMomentumAlerts(clusters: SignalCluster[]): PersonalAlert[] {
  const alerts: PersonalAlert[] = [];

  for (const cluster of clusters) {
    if (cluster.momentum !== 'rising') continue;

    alerts.push({
      id: alertId(),
      userId: null,
      type: 'signal_rising_momentum',
      entityName: cluster.entities[0] ?? null,
      signalId: cluster.signals[0]?.id ?? null,
      trendId: cluster.id,
      title: 'Signal momentum rising',
      message: `${cluster.signalCount} signals indicate accelerating activity in ${cluster.entities.slice(0, 3).join(', ')}.`,
      priority: ALERT_PRIORITY_MAP.signal_rising_momentum,
      createdAt: new Date().toISOString(),
      read: false,
    });
  }

  return alerts;
}

/**
 * Generate alerts when new clusters are detected.
 */
function generateTrendAlerts(clusters: SignalCluster[]): PersonalAlert[] {
  return clusters.map((cluster) => ({
    id: alertId(),
    userId: null,
    type: 'trend_detected' as const,
    entityName: cluster.entities[0] ?? null,
    signalId: null,
    trendId: cluster.id,
    title: 'Emerging trend detected',
    message: cluster.summary,
    priority: ALERT_PRIORITY_MAP.trend_detected,
    createdAt: new Date().toISOString(),
    read: false,
  }));
}

/**
 * Generate alerts for clusters with rising momentum (trend_rising).
 */
function generateTrendRisingAlerts(clusters: SignalCluster[]): PersonalAlert[] {
  const alerts: PersonalAlert[] = [];

  for (const cluster of clusters) {
    if (cluster.momentum !== 'rising') continue;

    alerts.push({
      id: alertId(),
      userId: null,
      type: 'trend_rising',
      entityName: cluster.entities[0] ?? null,
      signalId: null,
      trendId: cluster.id,
      title: 'Signal momentum rising',
      message: `Trend "${cluster.title}" is gaining momentum with ${cluster.signalCount} signals.`,
      priority: ALERT_PRIORITY_MAP.trend_rising,
      createdAt: new Date().toISOString(),
      read: false,
    });
  }

  return alerts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Personal alert generators (watched entity alerts)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Collect unique entity names from signals and clusters.
 */
function collectEntityNames(signals: Signal[], clusters: SignalCluster[]): string[] {
  const names = new Set<string>();
  for (const s of signals) {
    if (s.entityName) names.add(s.entityName);
  }
  for (const c of clusters) {
    for (const e of c.entities) {
      names.add(e);
    }
  }
  return Array.from(names);
}

/**
 * Generate watched_entity_high_impact alerts.
 * For each high-impact signal, check if the entity is watched by any user.
 */
function generateWatchedHighImpactAlerts(
  signals: Signal[],
  watcherMap: Map<string, string[]>,
): PersonalAlert[] {
  const alerts: PersonalAlert[] = [];

  for (const signal of signals) {
    const score = signal.significanceScore ?? (signal.confidence * 100);
    if (score < HIGH_IMPACT_THRESHOLD) continue;
    if (!signal.entityName) continue;

    const watchers = watcherMap.get(signal.entityName) ?? [];
    for (const userId of watchers) {
      alerts.push({
        id: alertId(),
        userId,
        type: 'watched_entity_high_impact',
        entityName: signal.entityName,
        signalId: signal.id,
        trendId: null,
        title: `${signal.entityName}: High-impact signal`,
        message: signal.title,
        priority: ALERT_PRIORITY_MAP.watched_entity_high_impact,
        createdAt: new Date().toISOString(),
        read: false,
      });
    }
  }

  return alerts;
}

/**
 * Generate watched_entity_rising alerts.
 * For each rising-momentum cluster, check if any cluster entity is watched.
 */
function generateWatchedRisingAlerts(
  clusters: SignalCluster[],
  watcherMap: Map<string, string[]>,
): PersonalAlert[] {
  const alerts: PersonalAlert[] = [];
  const seen = new Set<string>(); // userId:clusterId dedup within batch

  for (const cluster of clusters) {
    if (cluster.momentum !== 'rising') continue;

    for (const entityName of cluster.entities) {
      const watchers = watcherMap.get(entityName) ?? [];
      for (const userId of watchers) {
        const key = `${userId}:${cluster.id}`;
        if (seen.has(key)) continue;
        seen.add(key);

        alerts.push({
          id: alertId(),
          userId,
          type: 'watched_entity_rising',
          entityName,
          signalId: cluster.signals[0]?.id ?? null,
          trendId: cluster.id,
          title: `${entityName}: Rising momentum`,
          message: `${cluster.signalCount} signals show accelerating activity.`,
          priority: ALERT_PRIORITY_MAP.watched_entity_rising,
          createdAt: new Date().toISOString(),
          read: false,
        });
      }
    }
  }

  return alerts;
}

/**
 * Generate watched_entity_trend alerts.
 * For each new or rising trend cluster, check if any entity is watched.
 */
function generateWatchedTrendAlerts(
  clusters: SignalCluster[],
  watcherMap: Map<string, string[]>,
): PersonalAlert[] {
  const alerts: PersonalAlert[] = [];
  const seen = new Set<string>();

  for (const cluster of clusters) {
    for (const entityName of cluster.entities) {
      const watchers = watcherMap.get(entityName) ?? [];
      for (const userId of watchers) {
        const key = `${userId}:${cluster.id}`;
        if (seen.has(key)) continue;
        seen.add(key);

        alerts.push({
          id: alertId(),
          userId,
          type: 'watched_entity_trend',
          entityName,
          signalId: null,
          trendId: cluster.id,
          title: `${entityName}: Trend activity`,
          message: `"${cluster.title}" — ${cluster.signalCount} signals in this trend.`,
          priority: ALERT_PRIORITY_MAP.watched_entity_trend,
          createdAt: new Date().toISOString(),
          read: false,
        });
      }
    }
  }

  return alerts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────────────────────────────────────

async function persistAlerts(alerts: PersonalAlert[]): Promise<void> {
  for (const alert of alerts) {
    await dbQuery`
      INSERT INTO alerts (id, user_id, type, entity_name, signal_id, trend_id, title, message, priority, created_at, read)
      VALUES (
        ${alert.id},
        ${alert.userId},
        ${alert.type},
        ${alert.entityName},
        ${alert.signalId},
        ${alert.trendId},
        ${alert.title},
        ${alert.message},
        ${alert.priority},
        ${alert.createdAt},
        ${alert.read}
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export interface GenerateAlertsInput {
  signals: Signal[];
  clusters: SignalCluster[];
}

/**
 * Evaluate signals and clusters against platform + personal alert rules.
 * Deduplicates against existing alerts within 24h before persisting.
 *
 * Platform alerts: generated for all users (user_id = null).
 * Personal alerts: generated per user based on their watched entities.
 */
export async function generateAlerts(input: GenerateAlertsInput): Promise<PersonalAlert[]> {
  const { signals, clusters } = input;

  // ── Platform alerts ─────────────────────────────────────────────────────
  const platformCandidates = [
    ...generateHighImpactAlerts(signals),
    ...generateMomentumAlerts(clusters),
    ...generateTrendAlerts(clusters),
    ...generateTrendRisingAlerts(clusters),
  ];

  // ── Personal alerts (watched entities) ──────────────────────────────────
  let personalCandidates: PersonalAlert[] = [];
  try {
    const entityNames = collectEntityNames(signals, clusters);
    if (entityNames.length > 0) {
      const watcherMap = await getUsersWatchingEntityNames(entityNames);
      if (watcherMap.size > 0) {
        personalCandidates = [
          ...generateWatchedHighImpactAlerts(signals, watcherMap),
          ...generateWatchedRisingAlerts(clusters, watcherMap),
          ...generateWatchedTrendAlerts(clusters, watcherMap),
        ];
      }
    }
  } catch (err) {
    // Personal alert generation is best-effort; never block platform alerts
    console.warn('[generateAlerts] Personal alert generation failed:', err);
  }

  // ── Deduplicate all candidates ──────────────────────────────────────────
  const allCandidates = [...platformCandidates, ...personalCandidates];
  const unique: PersonalAlert[] = [];
  for (const alert of allCandidates) {
    const dup = await isDuplicate(alert.type, alert.signalId, alert.trendId, alert.userId);
    if (!dup) {
      unique.push(alert);
    }
  }

  if (unique.length > 0) {
    await persistAlerts(unique);
  }

  return unique;
}
