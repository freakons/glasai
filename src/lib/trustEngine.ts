/**
 * Omterminal — Signal Trust Engine
 *
 * Pure, stateless function that derives a publishing status and trust score
 * from a signal's confidence level and source trust.  No database access —
 * safe to call anywhere (server, edge, client).
 *
 * v2: Now incorporates source trust scoring so that signals from higher-
 * quality sources receive appropriately higher trust scores.  The confidence
 * level still drives the publishing status tier, but the numeric trust_score
 * is now a blend of confidence and source credibility.
 */

import { computeSourceTrust, type SourceTrustResult } from './sourceTrust';

export type TrustStatus = 'auto' | 'published' | 'review' | 'internal';

export interface TrustInput {
  confidence: number;
  source?: string;
  ai_model?: string;
}

export interface TrustResult {
  status: TrustStatus;
  trust_score: number;
  /** Source trust breakdown — included when a source was provided. */
  source_trust?: SourceTrustResult;
}

/**
 * Evaluate the publishing trust level for a signal.
 *
 * Publishing status is determined purely by confidence tier (unchanged from v1).
 * The numeric trust_score is now a weighted blend:
 *   trust_score = confidence_component * 0.7 + source_trust_component * 0.3
 *
 * When no source is provided, the source component defaults to a neutral
 * midpoint (50) so the formula degrades gracefully to roughly the v1 behavior.
 *
 * @param signal  Object with at minimum a `confidence` value (0–100).
 * @returns       `{ status, trust_score, source_trust }` derived from the
 *                confidence tier and source credibility.
 */
export function evaluateSignalTrust(signal: TrustInput): TrustResult {
  const { confidence, source } = signal;

  // ── Publishing status (unchanged — driven by confidence tier) ─────────────
  let status: TrustStatus;
  let confidenceComponent: number;

  if (confidence >= 90) {
    status = 'auto';
    confidenceComponent = 95;
  } else if (confidence >= 75) {
    status = 'published';
    confidenceComponent = 85;
  } else if (confidence >= 60) {
    status = 'review';
    confidenceComponent = 70;
  } else {
    status = 'internal';
    confidenceComponent = 50;
  }

  // ── Source trust component ────────────────────────────────────────────────
  let sourceTrustResult: SourceTrustResult | undefined;
  let sourceTrustScore = 50; // neutral default when no source provided

  if (source) {
    sourceTrustResult = computeSourceTrust(source);
    sourceTrustScore = sourceTrustResult.trustScore;
  }

  // ── Blended trust score ───────────────────────────────────────────────────
  // 70% confidence + 30% source trust — confidence remains dominant since
  // it reflects the detection engine's assessment of the signal itself,
  // while source trust modulates the score based on provenance quality.
  const blended = Math.round(confidenceComponent * 0.7 + sourceTrustScore * 0.3);
  const trust_score = Math.min(100, Math.max(0, blended));

  return {
    status,
    trust_score,
    ...(sourceTrustResult ? { source_trust: sourceTrustResult } : {}),
  };
}
