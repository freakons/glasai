/**
 * Omterminal — Pipeline Type Definitions
 *
 * Shared types for the canonical pipeline orchestration route and its
 * supporting modules (lock, snapshot, cache refresh).
 */

// ── Trigger sources ───────────────────────────────────────────────────────────

/** How the pipeline was triggered. Recorded in pipeline_runs. */
export type TriggerType = 'cron' | 'manual' | 'admin' | 'internal';

// ── Run status ────────────────────────────────────────────────────────────────

/**
 * API-level run status returned to callers.
 * Mapped to DB status ('ok'|'error'|'partial'|'skipped'|'started') before persisting.
 */
export type RunStatus =
  | 'completed'          // all stages succeeded → DB: 'ok'
  | 'partial'            // some stages failed   → DB: 'partial'
  | 'failed'             // all stages failed    → DB: 'error'
  | 'skipped_active_run' // lock held elsewhere  → DB: 'skipped'
  | 'dry_run';           // dry-run, nothing ran → not persisted

/** Map API RunStatus → DB status string. */
export function toDbStatus(s: RunStatus): string {
  switch (s) {
    case 'completed':          return 'ok';
    case 'partial':            return 'partial';
    case 'failed':             return 'error';
    case 'skipped_active_run': return 'skipped';
    case 'dry_run':            return 'ok';
    default:                   return 'ok';
  }
}

// ── Stage result ──────────────────────────────────────────────────────────────

export interface PipelineStageResult {
  stage: string;
  status: 'ok' | 'error' | 'skipped';
  durationMs: number;
  error?: string;
  [key: string]: unknown;
}

// ── Run response ──────────────────────────────────────────────────────────────

export interface PipelineRunResponse {
  ok: boolean;
  status: RunStatus;
  runId: string;
  triggerType: TriggerType;
  dryRun: boolean;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  stages?: PipelineStageResult[];
  diagnostics?: Record<string, unknown>;
  message?: string;
  /** Set when status is skipped_active_run */
  lockedBy?: string;
}
