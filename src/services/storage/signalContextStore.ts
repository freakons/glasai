/**
 * Omterminal — Signal Context Store
 *
 * Write-side persistence helpers for the signal_contexts table.
 * Called exclusively from the write-side pipeline — never from public pages.
 *
 * Pipeline position:
 *   signal store → signalContextStore (mark pending)
 *               → context generator
 *               → signalContextStore (upsert ready | record failed)
 *
 * Functions:
 *   markSignalContextPending  — create or reset a context row to 'pending'
 *   upsertReadySignalContext  — persist a successfully generated context
 *   recordFailedSignalContext — record a generation failure
 */

import { randomUUID } from 'crypto';
import { dbQuery } from '@/db/client';
import type { SignalContextEntity } from '@/types/intelligence';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** All generated context fields required to mark a row as ready. */
export interface ReadyContextData {
  summary:               string;
  whyItMatters:          string;
  affectedEntities:      SignalContextEntity[];
  implications:          string[];
  confidenceExplanation: string;
  sourceBasis:           string;
  modelProvider:         string;
  modelName:             string;
  promptVersion:         string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create or reset a signal_contexts row to 'pending'.
 *
 * Behaviour by existing row state:
 *   - No row:              INSERT with status='pending'.
 *   - Row status='pending' or 'failed': UPDATE to 'pending', clear generation_error.
 *   - Row status='ready':  No-op (leaves the ready context intact).
 *
 * This is safe to call on every pipeline run — it will not clobber a valid
 * context that has already been generated.
 *
 * @returns true if the row was created or reset to pending; false if already ready.
 */
export async function markSignalContextPending(
  signalId:      string,
  promptVersion: string,
): Promise<boolean> {
  const id = randomUUID();

  const rows = await dbQuery<{ signal_id: string }>`
    INSERT INTO signal_contexts (id, signal_id, status, prompt_version, generation_error, updated_at)
    VALUES (${id}, ${signalId}, 'pending', ${promptVersion}, NULL, NOW())
    ON CONFLICT (signal_id) DO UPDATE SET
      status           = 'pending',
      prompt_version   = ${promptVersion},
      generation_error = NULL,
      updated_at       = NOW()
    WHERE signal_contexts.status != 'ready'
    RETURNING signal_id
  `;

  return rows.length > 0;
}

/**
 * Upsert a fully-generated context row to 'ready'.
 *
 * Updates all content and model-metadata fields, sets status='ready', and
 * clears any previous generation_error.  Called on successful generation.
 */
export async function upsertReadySignalContext(
  signalId: string,
  data:     ReadyContextData,
): Promise<void> {
  const entitiesJson    = JSON.stringify(data.affectedEntities);
  const implicationsArr = data.implications.length > 0 ? data.implications : [];

  await dbQuery`
    UPDATE signal_contexts SET
      summary                = ${data.summary},
      why_it_matters         = ${data.whyItMatters},
      affected_entities      = ${entitiesJson},
      implications           = ${implicationsArr},
      confidence_explanation = ${data.confidenceExplanation},
      source_basis           = ${data.sourceBasis},
      model_provider         = ${data.modelProvider},
      model_name             = ${data.modelName},
      prompt_version         = ${data.promptVersion},
      status                 = 'ready',
      generation_error       = NULL,
      updated_at             = NOW()
    WHERE signal_id = ${signalId}
  `;
}

/**
 * Mark a signal context as 'failed' with an error message.
 *
 * Records the error and model metadata for operator review.  The parent
 * signal is unaffected — context failures are non-fatal.
 *
 * Error messages are capped at 2 000 chars to keep the row size bounded.
 */
export async function recordFailedSignalContext(
  signalId: string,
  error:    string,
  meta:     { modelProvider: string; modelName: string; promptVersion: string },
): Promise<void> {
  const errorMsg = error.slice(0, 2_000);

  await dbQuery`
    UPDATE signal_contexts SET
      status           = 'failed',
      generation_error = ${errorMsg},
      model_provider   = ${meta.modelProvider},
      model_name       = ${meta.modelName},
      prompt_version   = ${meta.promptVersion},
      updated_at       = NOW()
    WHERE signal_id = ${signalId}
  `;
}
