/**
 * Omterminal — Signal Alerts Engine
 *
 * Detects unusual signal activity by querying the database and produces
 * structured alerts for downstream consumers (API, notifications, UI).
 *
 * Alert types
 * ───────────
 *  velocity_spike       — entity velocity_score > 70 AND signals_last_24h >= 3
 *  new_entity_cluster   — entity appears >= 5 times in 24 h but < 2 times in prior 7 d
 *  model_release_pattern — >= 3 signals with category 'ai_model_release' within 12 h
 */

import { dbQuery } from '@/db/client';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AlertType = 'velocity_spike' | 'new_entity_cluster' | 'model_release_pattern';

export interface SignalRef {
  id: string;
  title: string;
  created_at: string;
}

export interface Alert {
  type: AlertType;
  entity: string;
  score: number;
  signals: SignalRef[];
}

// ─────────────────────────────────────────────────────────────────────────────
// DB row types
// ─────────────────────────────────────────────────────────────────────────────

interface EntityCountRow {
  entity_name: string;
  count_24h: string;
  count_prev_7d: string;
}

interface VelocityEntityRow {
  entity_name: string;
  count_24h: string;
  count_7d: string;
}

interface ModelReleaseRow {
  id: string;
  title: string;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const VELOCITY_SATURATION     = 100;
const VELOCITY_SCORE_THRESHOLD = 70;
const VELOCITY_24H_MIN        = 3;
const CLUSTER_24H_MIN         = 5;
const CLUSTER_PREV_7D_MAX     = 2;   // strictly less than
const MODEL_RELEASE_MIN       = 3;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function computeVelocityScore(count24h: number, count7d: number): number {
  const raw = (count24h * 0.6) + ((count7d / 7) * 0.4);
  return Math.min((raw / VELOCITY_SATURATION) * 100, 100);
}

async function fetchSignalsForEntity(entityName: string, intervalHours: number): Promise<SignalRef[]> {
  return dbQuery<SignalRef>`
    SELECT s.id, s.title, s.created_at
    FROM signals s
    JOIN signal_entities se ON se.signal_id = s.id
    JOIN entities e ON e.id = se.entity_id
    WHERE e.name = ${entityName}
      AND s.created_at > NOW() - (${intervalHours} || ' hours')::interval
    ORDER BY s.created_at DESC
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// Alert detectors
// ─────────────────────────────────────────────────────────────────────────────

/** velocity_spike: velocity_score > 70 AND signals_last_24h >= 3 */
async function detectVelocitySpikes(): Promise<Alert[]> {
  const rows = await dbQuery<VelocityEntityRow>`
    SELECT
      e.name                                                       AS entity_name,
      COUNT(*) FILTER (WHERE s.created_at > NOW() - INTERVAL '24 hours') AS count_24h,
      COUNT(*) FILTER (WHERE s.created_at > NOW() - INTERVAL '7 days')   AS count_7d
    FROM signal_entities se
    JOIN signals s  ON s.id  = se.signal_id
    JOIN entities e ON e.id  = se.entity_id
    WHERE s.created_at > NOW() - INTERVAL '7 days'
    GROUP BY e.name
    HAVING COUNT(*) FILTER (WHERE s.created_at > NOW() - INTERVAL '24 hours') >= ${VELOCITY_24H_MIN}
  `;

  const alerts: Alert[] = [];

  for (const row of rows) {
    const count24h = parseInt(row.count_24h, 10);
    const count7d  = parseInt(row.count_7d,  10);
    const score    = computeVelocityScore(count24h, count7d);

    if (score <= VELOCITY_SCORE_THRESHOLD) continue;

    const signals = await fetchSignalsForEntity(row.entity_name, 24);
    alerts.push({ type: 'velocity_spike', entity: row.entity_name, score: Math.round(score * 100) / 100, signals });
  }

  return alerts;
}

/** new_entity_cluster: >= 5 appearances in last 24 h but < 2 in the prior 7 d (days 1–7, excluding 24 h) */
async function detectNewEntityClusters(): Promise<Alert[]> {
  const rows = await dbQuery<EntityCountRow>`
    SELECT
      e.name AS entity_name,
      COUNT(*) FILTER (WHERE s.created_at > NOW() - INTERVAL '24 hours')                                        AS count_24h,
      COUNT(*) FILTER (WHERE s.created_at <= NOW() - INTERVAL '24 hours'
                         AND s.created_at >  NOW() - INTERVAL '7 days')  AS count_prev_7d
    FROM signal_entities se
    JOIN signals s  ON s.id  = se.signal_id
    JOIN entities e ON e.id  = se.entity_id
    WHERE s.created_at > NOW() - INTERVAL '7 days'
    GROUP BY e.name
    HAVING
      COUNT(*) FILTER (WHERE s.created_at > NOW() - INTERVAL '24 hours') >= ${CLUSTER_24H_MIN}
  `;

  const alerts: Alert[] = [];

  for (const row of rows) {
    const count24h    = parseInt(row.count_24h,    10);
    const countPrev7d = parseInt(row.count_prev_7d, 10);

    if (countPrev7d >= CLUSTER_PREV_7D_MAX) continue;

    // Score: proportion of 24 h burst relative to threshold, capped at 100
    const score = Math.min((count24h / CLUSTER_24H_MIN) * 100, 100);

    const signals = await fetchSignalsForEntity(row.entity_name, 24);
    alerts.push({ type: 'new_entity_cluster', entity: row.entity_name, score: Math.round(score * 100) / 100, signals });
  }

  return alerts;
}

/** model_release_pattern: >= 3 signals with category 'ai_model_release' within 12 h */
async function detectModelReleasePatterns(): Promise<Alert[]> {
  const rows = await dbQuery<ModelReleaseRow>`
    SELECT id, title, created_at
    FROM signals
    WHERE category    = 'ai_model_release'
      AND created_at  > NOW() - INTERVAL '12 hours'
    ORDER BY created_at DESC
  `;

  if (rows.length < MODEL_RELEASE_MIN) return [];

  // Score: proportion of matched signals relative to threshold, capped at 100
  const score = Math.min((rows.length / MODEL_RELEASE_MIN) * 100, 100);

  return [{
    type:    'model_release_pattern',
    entity:  'ai_model_release',
    score:   Math.round(score * 100) / 100,
    signals: rows.map(({ id, title, created_at }) => ({ id, title, created_at })),
  }];
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run all alert detectors and return the combined results.
 *
 * Returns an empty array when the database is unavailable.
 */
export async function detectAlerts(): Promise<Alert[]> {
  const [velocityAlerts, clusterAlerts, modelAlerts] = await Promise.all([
    detectVelocitySpikes(),
    detectNewEntityClusters(),
    detectModelReleasePatterns(),
  ]);

  return [...velocityAlerts, ...clusterAlerts, ...modelAlerts];
}
