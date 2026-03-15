/**
 * Omterminal — Signal Store
 *
 * Persistence layer for intelligence signals.
 * Sits at the end of the signals pipeline and exposes signals to the API layer.
 *
 * Pipeline position:
 *   event store → signals engine → signalStore
 *
 * Functions:
 *   saveSignal      — persist a single Signal
 *   saveSignals     — persist an array of Signals (bulk, skips duplicates)
 *   getRecentSignals — retrieve the N most recent stored signals
 */

import { dbQuery } from '@/db/client';
import type { Signal, SignalType, SignalDirection } from '@/types/intelligence';
import type { SignalInsight } from '@/lib/intelligence/generateSignalInsight';

// ─────────────────────────────────────────────────────────────────────────────
// Row type returned from the `signals` table
// ─────────────────────────────────────────────────────────────────────────────

interface SignalRow {
  id: string;
  signal_type: string | null;
  title: string;
  description: string;
  supporting_events: string[];
  confidence_score: string; // NUMERIC comes back as string from Neon
  direction: string | null;
  affected_entities: string[] | null;
  recommendation: string | null;
  human_verified: boolean;
  created_at: string;
  updated_at: string | null;
  // Intelligence layer (migration 014) — nullable
  why_this_matters?: string | null;
  strategic_impact?: string | null;
  who_should_care?: string | null;
  prediction?: string | null;
  // Intelligence status tracking (migration 015)
  insight_generated?: boolean;
  insight_generated_at?: string | null;
  insight_generation_error?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Map a database row back to the canonical Signal interface. */
function rowToSignal(row: SignalRow): Signal {
  return {
    id:               row.id,
    type:             (row.signal_type as SignalType) ?? undefined,
    title:            row.title,
    description:      row.description,
    supportingEvents: row.supporting_events ?? [],
    confidenceScore:  parseFloat(row.confidence_score),
    direction:        (row.direction as SignalDirection) ?? undefined,
    affectedEntities: row.affected_entities ?? undefined,
    recommendation:   row.recommendation ?? undefined,
    humanVerified:    row.human_verified,
    createdAt:        typeof row.created_at === 'string'
                        ? row.created_at
                        : new Date(row.created_at).toISOString(),
    updatedAt:        row.updated_at
                        ? typeof row.updated_at === 'string'
                          ? row.updated_at
                          : new Date(row.updated_at).toISOString()
                        : undefined,
    whyThisMatters:   row.why_this_matters ?? undefined,
    strategicImpact:  row.strategic_impact ?? undefined,
    whoShouldCare:    row.who_should_care ?? undefined,
    prediction:       row.prediction ?? undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist a single Signal to the database.
 *
 * Uses INSERT … ON CONFLICT DO NOTHING so re-running the signals engine with
 * the same event set is idempotent — no duplicate signals are created.
 *
 * @returns true if the row was inserted, false if it already existed or DB is unavailable.
 */
export async function saveSignal(signal: Signal): Promise<boolean> {
  const supportingEventsArray =
    signal.supportingEvents.length > 0 ? signal.supportingEvents : [];
  const affectedEntitiesArray =
    signal.affectedEntities && signal.affectedEntities.length > 0
      ? signal.affectedEntities
      : null;

  const rows = await dbQuery<{ id: string }>`
    INSERT INTO signals (
      id, signal_type, title, description, supporting_events,
      confidence_score, direction, affected_entities, recommendation,
      human_verified, created_at, status
    ) VALUES (
      ${signal.id},
      ${signal.type ?? null},
      ${signal.title},
      ${signal.description},
      ${supportingEventsArray},
      ${signal.confidenceScore},
      ${signal.direction ?? null},
      ${affectedEntitiesArray},
      ${signal.recommendation ?? null},
      ${signal.humanVerified ?? false},
      ${signal.createdAt},
      'auto'
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `;

  return rows.length > 0;
}

export interface SaveSignalsResult {
  /** Number of signals identified by the engine (input array length). */
  detected: number;
  /** Number of new rows inserted into the database. */
  inserted: number;
  /** Number of signals skipped because they already existed (detected - inserted). */
  skipped: number;
}

/**
 * Persist an array of Signals in parallel, skipping duplicates.
 *
 * Individual failures are caught and logged; they do not abort the batch.
 *
 * @returns SaveSignalsResult with detected, inserted, and skipped counts.
 */
export async function saveSignals(signals: Signal[]): Promise<SaveSignalsResult> {
  if (signals.length === 0) return { detected: 0, inserted: 0, skipped: 0 };

  const results = await Promise.allSettled(signals.map(saveSignal));

  let inserted = 0;
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) inserted++;
    if (result.status === 'rejected') {
      console.error('[signalStore] Failed to save signal:', result.reason);
    }
  }

  const detected = signals.length;
  const skipped = detected - inserted;
  console.log(`[signalStore] saveSignals: detected=${detected} inserted=${inserted} skipped=${skipped}`);
  return { detected, inserted, skipped };
}

/**
 * Retrieve the most recent Signals from the database, ordered by created_at desc.
 *
 * @param limit  Maximum number of signals to return (default 20, max 200).
 * @returns      Array of Signals, newest first.
 */
export async function getRecentSignals(limit = 20): Promise<Signal[]> {
  const safeLimit = Math.min(Math.max(1, limit), 200);

  const rows = await dbQuery<SignalRow>`
    SELECT
      id, signal_type, title, description, supporting_events,
      confidence_score, direction, affected_entities, recommendation,
      human_verified, created_at, updated_at
    FROM signals
    ORDER BY created_at DESC
    LIMIT ${safeLimit}
  `;

  return rows.map(rowToSignal);
}

/**
 * Update a signal's intelligence layer fields and mark generation status.
 *
 * Uses a try/catch to gracefully handle cases where migration 014/015 has not
 * yet been applied (the columns don't exist). Returns true on success.
 */
export async function updateSignalInsight(
  signalId: string,
  insight: SignalInsight,
): Promise<boolean> {
  try {
    await dbQuery`
      UPDATE signals
      SET
        why_this_matters         = ${insight.why_this_matters},
        strategic_impact         = ${insight.strategic_impact},
        who_should_care          = ${insight.who_should_care},
        prediction               = ${insight.prediction},
        insight_generated        = TRUE,
        insight_generated_at     = NOW(),
        insight_generation_error = NULL,
        updated_at               = NOW()
      WHERE id = ${signalId}
    `;
    return true;
  } catch (err) {
    console.error(
      `[signalStore] updateSignalInsight failed for ${signalId}:`,
      err instanceof Error ? err.message : String(err),
    );
    return false;
  }
}

/**
 * Record a generation failure for a signal without overwriting existing insight.
 * Stores a short sanitized error message (no raw stack traces).
 */
export async function markInsightGenerationError(
  signalId: string,
  error: string,
): Promise<void> {
  const sanitized = error.slice(0, 500).replace(/\n/g, ' ');
  try {
    await dbQuery`
      UPDATE signals
      SET
        insight_generation_error = ${sanitized},
        updated_at               = NOW()
      WHERE id = ${signalId}
        AND insight_generated IS NOT TRUE
    `;
  } catch {
    // Non-critical — failure tracking must not block the pipeline
  }
}

/**
 * Find a recent signal with existing intelligence that matches the given
 * title, entity, and category closely enough to reuse.
 *
 * Dedup/reuse rules (deterministic, no embeddings):
 *   1. Same normalized first entity (if provided)
 *   2. Same signal type / category (if provided)
 *   3. Very similar normalized title (Levenshtein-like: shared prefix ≥60% of shorter title)
 *   4. Created within the last 7 days
 *   5. Has non-null why_this_matters (i.e. insight was generated)
 *
 * Returns the reusable SignalInsight or null if no match found.
 */
export async function findReusableInsight(input: {
  title: string;
  entities: string[];
  signalType?: string;
}): Promise<SignalInsight | null> {
  try {
    // Query recent signals that have generated intelligence
    const rows = await dbQuery<{
      title: string;
      why_this_matters: string | null;
      strategic_impact: string | null;
      who_should_care: string | null;
      prediction: string | null;
      signal_type: string | null;
      affected_entities: string[] | null;
    }>`
      SELECT title, why_this_matters, strategic_impact, who_should_care,
             prediction, signal_type, affected_entities
      FROM signals
      WHERE insight_generated = TRUE
        AND why_this_matters IS NOT NULL
        AND created_at > NOW() - INTERVAL '7 days'
      ORDER BY created_at DESC
      LIMIT 100
    `;

    const normalizedInput = normalizeForDedup(input.title);
    const inputEntity = input.entities.length > 0
      ? normalizeForDedup(input.entities[0])
      : null;

    for (const row of rows) {
      // Check entity match (if input has entities)
      if (inputEntity) {
        const rowEntities = row.affected_entities ?? [];
        const hasEntityMatch = rowEntities.some(
          e => normalizeForDedup(e) === inputEntity,
        );
        if (!hasEntityMatch) continue;
      }

      // Check signal type match (if provided)
      if (input.signalType && row.signal_type && row.signal_type !== input.signalType) {
        continue;
      }

      // Check title similarity
      const normalizedRow = normalizeForDedup(row.title);
      if (!isSimilarTitle(normalizedInput, normalizedRow)) continue;

      // Match found — return reusable insight
      return {
        why_this_matters: row.why_this_matters,
        strategic_impact: row.strategic_impact,
        who_should_care: row.who_should_care,
        prediction: row.prediction,
      };
    }

    return null;
  } catch (err) {
    console.error(
      '[signalStore] findReusableInsight failed:',
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

/**
 * Normalize a string for dedup comparison: lowercase, strip punctuation, collapse whitespace.
 */
function normalizeForDedup(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Check if two normalized titles are similar enough for intelligence reuse.
 * Uses a shared-prefix heuristic: if the common prefix is ≥60% of the
 * shorter string, or the strings are identical, consider them a match.
 */
function isSimilarTitle(a: string, b: string): boolean {
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  if (shorter.length === 0) return false;

  // Check if shorter is a substring of longer
  if (longer.includes(shorter)) return true;

  // Shared prefix check
  let shared = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (shorter[i] === longer[i]) shared++;
    else break;
  }
  return shared / shorter.length >= 0.6;
}
