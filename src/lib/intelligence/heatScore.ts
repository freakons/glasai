/**
 * Heat scoring — lightweight activity intensity model for ecosystem sections.
 *
 * Each section of the ecosystem overview receives a heat level (0–3) derived
 * from simple count-based thresholds on already-available snapshot data.
 *
 * Designed for future expansion: week-over-week deltas, category heat maps,
 * sector momentum, geography heat, and trend scoring can layer on top of
 * this foundation without changing the public API.
 */

import type { Signal } from '@/data/mockSignals';
import type { FundingRound } from '@/lib/data/funding';
import type { AIModel } from '@/lib/data/models';
import type { ActiveEntity } from '@/db/queries';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** 0 = quiet, 1 = light, 2 = moderate, 3 = high */
export type HeatLevel = 0 | 1 | 2 | 3;

export interface SectionHeat {
  topSignals: HeatLevel;
  mostActiveEntities: HeatLevel;
  recentFunding: HeatLevel;
  modelReleases: HeatLevel;
}

// ─────────────────────────────────────────────────────────────────────────────
// Threshold configuration — easy to tune or make dynamic later
// ─────────────────────────────────────────────────────────────────────────────

interface Thresholds {
  light: number;
  moderate: number;
  high: number;
}

const SIGNAL_THRESHOLDS: Thresholds = { light: 1, moderate: 3, high: 5 };
const ENTITY_THRESHOLDS: Thresholds = { light: 1, moderate: 3, high: 6 };
const FUNDING_THRESHOLDS: Thresholds = { light: 1, moderate: 2, high: 4 };
const MODEL_THRESHOLDS: Thresholds = { light: 1, moderate: 2, high: 4 };

// ─────────────────────────────────────────────────────────────────────────────
// Scoring
// ─────────────────────────────────────────────────────────────────────────────

function countToHeat(count: number, t: Thresholds): HeatLevel {
  if (count >= t.high) return 3;
  if (count >= t.moderate) return 2;
  if (count >= t.light) return 1;
  return 0;
}

/** Compute per-section heat levels from an ecosystem snapshot. */
export function computeSectionHeat(snapshot: {
  topSignals: Signal[];
  mostActiveEntities: ActiveEntity[];
  recentFunding: FundingRound[];
  modelReleases: AIModel[];
}): SectionHeat {
  return {
    topSignals: countToHeat(snapshot.topSignals.length, SIGNAL_THRESHOLDS),
    mostActiveEntities: countToHeat(
      snapshot.mostActiveEntities.length,
      ENTITY_THRESHOLDS,
    ),
    recentFunding: countToHeat(snapshot.recentFunding.length, FUNDING_THRESHOLDS),
    modelReleases: countToHeat(snapshot.modelReleases.length, MODEL_THRESHOLDS),
  };
}
