/**
 * Omterminal — Signal Ranking Engine
 *
 * v3: Refactored to eliminate double-counting between confidence, trust, and
 * intelligence scores.  Now computes importance as a cleaner composite of
 * orthogonal components:
 *
 *   intelligence_score  0.30  — quality of extraction / analysis
 *   source_trust        0.25  — from centralized sourceTrust model (type + reliability)
 *   velocity_score      0.25  — entity appearance rate in recent data
 *   entity_weight       0.20  — breadth of entity coverage (rescaled to 0–100)
 *
 * Changes from v2:
 *   • Removed trust_score from the formula — it was 70% confidence (already
 *     captured in intelligence_score) + 30% source trust (now standalone).
 *   • Entity weight rescaled from 0–25 → 0–100 for consistent component ranges.
 *   • Source trust weight increased from 0.15 → 0.25 to properly reward
 *     signals backed by credible sources.
 *   • Velocity weight increased from 0.20 → 0.25 (now that trust_score's
 *     0.20 weight is freed).
 *   • Entity weight increased from 0.10 → 0.20 to reflect ecosystem breadth.
 */

import { computeSourceTrust } from '@/lib/sourceTrust';
import { dbQuery } from '@/db/client';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface RankedSignal {
  /** Processed intelligence quality score (0–100) */
  intelligence_score: number;
  /** Trust/confidence score derived from source verification (0–100) */
  trust_score: number;
  /** Source identifier — looked up via sourceTrust model */
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
  /** Source trust score (0–100) used in the importance computation */
  source_trust_score: number;
  /** Per-component breakdown for debugging and inspectability */
  breakdown: ImportanceBreakdown;
}

export interface ImportanceBreakdown {
  intelligence: number;
  sourceTrust: number;
  velocity: number;
  entityWeight: number;
  weights: {
    intelligence: number;
    sourceTrust: number;
    velocity: number;
    entityWeight: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Raw velocity value that maps to 100 on the normalized scale */
const VELOCITY_SATURATION = 100;

/** Entity count that maps to 100 on the entity weight scale */
const ENTITY_SATURATION = 5;

/** Component weights — must sum to 1.0 */
const IMPORTANCE_WEIGHTS = {
  intelligence: 0.30,
  sourceTrust:  0.25,
  velocity:     0.25,
  entityWeight: 0.20,
} as const;

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
 * @returns      { importance_score, velocity_score, source_trust_score, breakdown }
 *               all scores clamped to 0–100.
 */
export async function computeSignalImportance(
  signal: RankedSignal,
): Promise<RankingResult> {

  // 1. Source trust — from the centralized sourceTrust model (0–100).
  const sourceTrustResult = computeSourceTrust(signal.source);
  const source_trust_score = sourceTrustResult.trustScore;

  // 2. Entity weight — normalized to 0–100 (saturates at ENTITY_SATURATION).
  const entityWeight = Math.min(signal.entity_count / ENTITY_SATURATION, 1) * 100;

  // 3. Velocity score — derived from database history across all signals.
  const velocity_score = await computeVelocityFromDB(signal.entities ?? []);

  // 4. Composite importance score — orthogonal components only.
  const raw_importance =
    signal.intelligence_score * IMPORTANCE_WEIGHTS.intelligence +
    source_trust_score        * IMPORTANCE_WEIGHTS.sourceTrust +
    velocity_score            * IMPORTANCE_WEIGHTS.velocity +
    entityWeight              * IMPORTANCE_WEIGHTS.entityWeight;

  const importance_score = Math.round(Math.min(Math.max(raw_importance, 0), 100));

  const breakdown: ImportanceBreakdown = {
    intelligence: signal.intelligence_score,
    sourceTrust: source_trust_score,
    velocity: velocity_score,
    entityWeight: Math.round(entityWeight),
    weights: IMPORTANCE_WEIGHTS,
  };

  return { importance_score, velocity_score, source_trust_score, breakdown };
}
