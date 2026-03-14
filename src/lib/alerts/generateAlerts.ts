/**
 * Omterminal — Personal Intelligence Alert Generator
 *
 * Evaluates signals and clusters to produce user-facing alerts that are
 * persisted to the `alerts` table.
 *
 * Alert rules:
 *   signal_high_impact  — signal significance_score >= 75
 *   signal_momentum     — signal cluster momentum = 'rising'
 *   entity_watch        — signal mentions a watched entity
 *   trend_detected      — new cluster detected with >= 3 signals
 */

import { dbQuery } from '@/db/client';
import type { Signal } from '@/data/mockSignals';
import type { SignalCluster } from '@/lib/signals/clusterSignals';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type PersonalAlertType =
  | 'signal_high_impact'
  | 'signal_momentum'
  | 'entity_watch'
  | 'trend_detected';

export interface PersonalAlert {
  id: string;
  userId: string | null;
  type: PersonalAlertType;
  entityName: string | null;
  signalId: string | null;
  trendId: string | null;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const HIGH_IMPACT_THRESHOLD = 75;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function alertId(): string {
  return `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Alert generators
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
      title: `High-Impact Signal: ${signal.entityName}`,
      message: signal.title,
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
      type: 'signal_momentum',
      entityName: cluster.entities[0] ?? null,
      signalId: cluster.signals[0]?.id ?? null,
      trendId: cluster.id,
      title: `Rising Momentum: ${cluster.title}`,
      message: `${cluster.signalCount} signals indicate accelerating activity in ${cluster.entities.slice(0, 3).join(', ')}.`,
      createdAt: new Date().toISOString(),
      read: false,
    });
  }

  return alerts;
}

/**
 * Generate alerts when signals mention entities on a watched list.
 */
function generateEntityWatchAlerts(
  signals: Signal[],
  watchedEntities: string[],
): PersonalAlert[] {
  if (watchedEntities.length === 0) return [];

  const watchSet = new Set(watchedEntities.map((e) => e.toLowerCase()));
  const alerts: PersonalAlert[] = [];

  for (const signal of signals) {
    if (!watchSet.has(signal.entityName.toLowerCase())) continue;

    alerts.push({
      id: alertId(),
      userId: null,
      type: 'entity_watch',
      entityName: signal.entityName,
      signalId: signal.id,
      trendId: null,
      title: `Watched Entity: ${signal.entityName}`,
      message: signal.title,
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
    title: `Trend Detected: ${cluster.title}`,
    message: cluster.summary,
    createdAt: new Date().toISOString(),
    read: false,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────────────────────────────────────

async function persistAlerts(alerts: PersonalAlert[]): Promise<void> {
  for (const alert of alerts) {
    await dbQuery`
      INSERT INTO alerts (id, user_id, type, entity_name, signal_id, trend_id, title, message, created_at, read)
      VALUES (
        ${alert.id},
        ${alert.userId},
        ${alert.type},
        ${alert.entityName},
        ${alert.signalId},
        ${alert.trendId},
        ${alert.title},
        ${alert.message},
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
  watchedEntities?: string[];
}

/**
 * Evaluate signals and clusters against all alert rules.
 * Persists generated alerts to the database and returns them.
 */
export async function generateAlerts(input: GenerateAlertsInput): Promise<PersonalAlert[]> {
  const { signals, clusters, watchedEntities = [] } = input;

  const alerts = [
    ...generateHighImpactAlerts(signals),
    ...generateMomentumAlerts(clusters),
    ...generateEntityWatchAlerts(signals, watchedEntities),
    ...generateTrendAlerts(clusters),
  ];

  if (alerts.length > 0) {
    await persistAlerts(alerts);
  }

  return alerts;
}
