/**
 * Omterminal — Signal Alerts Engine
 *
 * Detects unusual signal activity by querying the database and produces
 * structured alerts for downstream consumers (API, notifications, UI).
 *
 * Alert types
 * ───────────
 *  velocity_spike        — entity velocity_score > 70 AND signals_last_24h >= 3
 *  new_entity_cluster    — entity appears >= 5 times in 24 h but < 2 times in prior 7 d
 *  model_release_pattern — >= 3 signals with category 'ai_model_release' within 12 h
 *  TREND_SIGNAL          — market signal from opportunityRanker reaching score threshold
 *
 * Alert levels (score-gated)
 * ──────────────────────────
 *  CRITICAL  score >= 90
 *  HIGH      score >= 80
 *  NORMAL    score >= 70
 *  (ignored) score <  70
 *
 * Deduplication
 * ─────────────
 *  In-memory cooldown map prevents the same alert firing more than once per
 *  COOLDOWN_MS window (default 5 min).  DB-level dedup (ON CONFLICT DO NOTHING)
 *  handles persistence-layer idempotency for stored signals.
 */

import { dbQuery } from '@/db/client';
import type { SignalCandidate } from '@/lib/signals/opportunityRanker';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AlertLevel = 'CRITICAL' | 'HIGH' | 'NORMAL';
export type AlertType  = 'velocity_spike' | 'new_entity_cluster' | 'model_release_pattern' | 'TREND_SIGNAL';

export interface SignalRef {
  id:         string;
  title:      string;
  created_at: string;
}

export interface Alert {
  type:         AlertType;
  /** Symbol (TREND_SIGNAL) or entity name (all other types). */
  entity:       string;
  score:        number;
  level:        AlertLevel;
  signals:      SignalRef[];
  // TREND_SIGNAL extras — absent on entity-based alert types
  direction?:   'UP' | 'DOWN' | 'NEUTRAL';
  velocity?:    number;
  volumeSpike?: boolean;
  timestamp?:   number;
}

// ─────────────────────────────────────────────────────────────────────────────
// DB row types
// ─────────────────────────────────────────────────────────────────────────────

interface EntityCountRow {
  entity_name:  string;
  count_24h:    string;
  count_prev_7d: string;
}

interface VelocityEntityRow {
  entity_name: string;
  count_24h:   string;
  count_7d:    string;
}

interface ModelReleaseRow {
  id:         string;
  title:      string;
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

/** Minimum score for any alert to be emitted. */
const SCORE_IGNORE_BELOW = 70;

/** How long (ms) to suppress a repeated alert for the same type + entity. */
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

// ─────────────────────────────────────────────────────────────────────────────
// Score → level
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map a numeric score to an AlertLevel.
 * Returns null when the score is below the ignore threshold — callers must
 * drop the alert rather than emitting it without a level.
 */
function scoreToLevel(score: number): AlertLevel | null {
  if (score >= 90) return 'CRITICAL';
  if (score >= 80) return 'HIGH';
  if (score >= SCORE_IGNORE_BELOW) return 'NORMAL';
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cooldown / deduplication
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Module-level map: `${type}:${entity}` → last-fired epoch ms.
 *
 * Lives in module scope so it persists across requests within the same
 * server process (Next.js keeps module singletons alive between requests).
 * Reset on cold-start / deploy, which is acceptable — a brief burst of
 * re-alerts after a deploy is preferable to stale state persisted to a DB.
 */
const cooldownMap = new Map<string, number>();

function cooldownKey(type: AlertType, entity: string): string {
  return `${type}:${entity}`;
}

function isOnCooldown(type: AlertType, entity: string): boolean {
  const last = cooldownMap.get(cooldownKey(type, entity));
  return last !== undefined && Date.now() - last < COOLDOWN_MS;
}

function markFired(type: AlertType, entity: string): void {
  cooldownMap.set(cooldownKey(type, entity), Date.now());
}

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
// Alert detectors — entity-based (DB-driven)
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

    const level = scoreToLevel(score);
    if (!level) continue;

    if (isOnCooldown('velocity_spike', row.entity_name)) continue;

    const signals = await fetchSignalsForEntity(row.entity_name, 24);
    alerts.push({
      type:   'velocity_spike',
      entity: row.entity_name,
      score:  Math.round(score * 100) / 100,
      level,
      signals,
    });
    markFired('velocity_spike', row.entity_name);
  }

  return alerts;
}

/** new_entity_cluster: >= 5 appearances in last 24 h but < 2 in the prior 7 d */
async function detectNewEntityClusters(): Promise<Alert[]> {
  const rows = await dbQuery<EntityCountRow>`
    SELECT
      e.name AS entity_name,
      COUNT(*) FILTER (WHERE s.created_at > NOW() - INTERVAL '24 hours')                     AS count_24h,
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

    const score = Math.min((count24h / CLUSTER_24H_MIN) * 100, 100);
    const level = scoreToLevel(score);
    if (!level) continue;

    if (isOnCooldown('new_entity_cluster', row.entity_name)) continue;

    const signals = await fetchSignalsForEntity(row.entity_name, 24);
    alerts.push({
      type:   'new_entity_cluster',
      entity: row.entity_name,
      score:  Math.round(score * 100) / 100,
      level,
      signals,
    });
    markFired('new_entity_cluster', row.entity_name);
  }

  return alerts;
}

/** model_release_pattern: >= 3 signals with category 'ai_model_release' within 12 h */
async function detectModelReleasePatterns(): Promise<Alert[]> {
  const rows = await dbQuery<ModelReleaseRow>`
    SELECT id, title, created_at
    FROM signals
    WHERE category   = 'ai_model_release'
      AND created_at > NOW() - INTERVAL '12 hours'
    ORDER BY created_at DESC
  `;

  if (rows.length < MODEL_RELEASE_MIN) return [];

  const score = Math.min((rows.length / MODEL_RELEASE_MIN) * 100, 100);
  const level = scoreToLevel(score);
  if (!level) return [];

  if (isOnCooldown('model_release_pattern', 'ai_model_release')) return [];

  markFired('model_release_pattern', 'ai_model_release');

  return [{
    type:    'model_release_pattern',
    entity:  'ai_model_release',
    score:   Math.round(score * 100) / 100,
    level,
    signals: rows.map(({ id, title, created_at }) => ({ id, title, created_at })),
  }];
}

// ─────────────────────────────────────────────────────────────────────────────
// Alert detector — market signals (opportunityRanker integration)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert ranked market signals into TREND_SIGNAL alerts.
 *
 * Only signals that meet the score threshold are emitted.
 * Cooldown deduplication prevents re-alerting the same symbol within
 * COOLDOWN_MS even if the ranker still lists it at high score.
 *
 * @param signals  Array of scored market signal candidates (e.g. from rankOpportunities).
 */
export function detectTrendSignalAlerts(signals: SignalCandidate[]): Alert[] {
  const timestamp = Date.now();
  const alerts: Alert[] = [];

  for (const signal of signals) {
    const level = scoreToLevel(signal.score);
    if (!level) continue;

    if (isOnCooldown('TREND_SIGNAL', signal.symbol)) continue;

    alerts.push({
      type:        'TREND_SIGNAL',
      entity:      signal.symbol,
      score:       signal.score,
      level,
      signals:     [],
      direction:   signal.direction,
      velocity:    signal.velocity,
      volumeSpike: signal.volumeSpike,
      timestamp,
    });
    markFired('TREND_SIGNAL', signal.symbol);
  }

  return alerts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run all alert detectors and return the combined, score-filtered results.
 *
 * @param marketSignals  Optional array of ranked market signal candidates.
 *                       Pass the output of `rankOpportunities()` to include
 *                       TREND_SIGNAL alerts alongside entity-based alerts.
 *
 * Returns an empty array when the database is unavailable.
 */
export async function detectAlerts(marketSignals?: SignalCandidate[]): Promise<Alert[]> {
  const [velocityAlerts, clusterAlerts, modelAlerts] = await Promise.all([
    detectVelocitySpikes(),
    detectNewEntityClusters(),
    detectModelReleasePatterns(),
  ]);

  const trendAlerts = marketSignals ? detectTrendSignalAlerts(marketSignals) : [];

  return [...velocityAlerts, ...clusterAlerts, ...modelAlerts, ...trendAlerts];
}
