/**
 * Omterminal — Signal Ranking Engine
 *
 * Combines intelligence_score, trust_score, source reliability, entity weight,
 * and velocity into a single normalized importance score (0–100).
 */

import { getSourceById } from '@/config/intelligenceSources';
import { dbQuery } from '@/db/client';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface RankedSignal {
  /** Processed intelligence quality score (0–100) */
  intelligence_score: number;
  /** Trust/confidence score derived from source verification (0–100) */
  trust_score: number;
  /** Source identifier — looked up in intelligenceSources registry */
  source: string;
  /** Number of distinct entities associated with this signal */
  entity_count: number;
  /** ISO 8601 timestamp of signal creation */
  created_at: string;
  /** Entity names for velocity cross-referencing */
  entities?: string[];
}

export interface RankingResult {
  /** Unified importance score clamped to 0–100 */
  importance_score: number;
  /** Velocity score (0–100) reflecting how quickly entities are appearing in the dataset */
  velocity_score: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Raw velocity value that maps to 100 on the normalized scale */
const VELOCITY_SATURATION = 100;

// ─────────────────────────────────────────────────────────────────────────────
// Velocity helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Query the database to compute a velocity score for a set of entity names.
 *
 * Velocity = (count_24h * 0.6) + ((count_7d / 7) * 0.4), normalized to 0–100.
 * Returns 0 when the entity list is empty or the database is unavailable.
 */
async function computeVelocityFromDB(entities: string[]): Promise<number> {
  if (entities.length === 0) return 0;

  const [row24h] = await dbQuery<{ count: string }>`
    SELECT COUNT(*) AS count
    FROM signal_entities se
    JOIN signals s ON s.id = se.signal_id
    JOIN entities e ON e.id = se.entity_id
    WHERE e.name = ANY(${entities})
      AND s.created_at > NOW() - INTERVAL '24 hours'
  `;

  const [row7d] = await dbQuery<{ count: string }>`
    SELECT COUNT(*) AS count
    FROM signal_entities se
    JOIN signals s ON s.id = se.signal_id
    JOIN entities e ON e.id = se.entity_id
    WHERE e.name = ANY(${entities})
      AND s.created_at > NOW() - INTERVAL '7 days'
  `;

  const count24h = parseInt(row24h?.count ?? '0', 10);
  const count7d  = parseInt(row7d?.count  ?? '0', 10);

  const raw = (count24h * 0.6) + ((count7d / 7) * 0.4);
  return Math.min((raw / VELOCITY_SATURATION) * 100, 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// Core function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute a unified importance score for a single signal.
 *
 * @param signal - The signal to score.
 * @returns      { importance_score, velocity_score } both clamped to 0–100.
 */
export async function computeSignalImportance(
  signal: RankedSignal,
): Promise<RankingResult> {

  // 1. Source reliability — normalised to 0–100
  //    intelligenceSources reliabilityScore is 1–10; scale to 0–100.
  //    Unknown sources default to 50 (mid-range).
  const sourceEntry = getSourceById(signal.source);
  const source_reliability = sourceEntry?.reliabilityScore != null
    ? (sourceEntry.reliabilityScore / 10) * 100
    : 50;

  // 2. Entity weight — spec: min(entity_count, 5) * 5  →  range 0–25
  const entity_weight = Math.min(signal.entity_count, 5) * 5;

  // 3. Velocity score — derived from database history across all signals
  const velocity_score = await computeVelocityFromDB(signal.entities ?? []);

  // 4. Composite importance score
  const raw_importance =
    signal.intelligence_score * 0.35 +
    signal.trust_score        * 0.20 +
    source_reliability        * 0.15 +
    entity_weight             * 0.10 +
    velocity_score            * 0.20;

  const importance_score = Math.min(Math.max(raw_importance, 0), 100);

  return { importance_score, velocity_score };
}
