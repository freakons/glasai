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

/**
 * Persist an array of Signals in parallel, skipping duplicates.
 *
 * Individual failures are caught and logged; they do not abort the batch.
 *
 * @returns Number of newly inserted signals.
 */
export async function saveSignals(signals: Signal[]): Promise<number> {
  if (signals.length === 0) return 0;

  const results = await Promise.allSettled(signals.map(saveSignal));

  let inserted = 0;
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) inserted++;
    if (result.status === 'rejected') {
      console.error('[signalStore] Failed to save signal:', result.reason);
    }
  }

  console.log(`[signalStore] saveSignals: ${inserted}/${signals.length} inserted.`);
  return inserted;
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
 * Update a signal's intelligence layer fields.
 *
 * Uses a try/catch to gracefully handle cases where migration 014 has not
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
        why_this_matters = ${insight.why_this_matters},
        strategic_impact = ${insight.strategic_impact},
        who_should_care  = ${insight.who_should_care},
        prediction       = ${insight.prediction},
        updated_at       = NOW()
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
