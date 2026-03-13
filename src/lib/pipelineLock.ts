/**
 * Omterminal — Pipeline Lock Guard
 *
 * Reusable concurrency guard for all pipeline entrypoints.
 * Wraps the low-level lock primitives from @/lib/pipeline/lock with:
 *   - structured logging (acquire / denied / released / stale)
 *   - requestId correlation
 *   - standard "blocked" response builder for routes
 *   - clean try/finally release guarantee
 *
 * Design: the internal lock implementation (currently Redis NX + DB fallback)
 * can be swapped to Upstash Redis distributed locking later without changing
 * any route code — only this module and @/lib/pipeline/lock need updating.
 */

import { NextResponse } from 'next/server';
import {
  acquirePipelineLock,
  releasePipelineLock,
  getPipelineLockStatus,
} from '@/lib/pipeline/lock';
import { logWithRequestId } from '@/lib/requestId';

// ── Types ──────────────────────────────────────────────────────────────────────

export type LockGuardSuccess<T> = {
  locked: false;
  result: T;
  lockId: string;
  strategy: string;
};

export type LockGuardBlocked = {
  locked: true;
  reason: string;
  lockedBy?: string;
};

export type LockGuardResult<T> = LockGuardSuccess<T> | LockGuardBlocked;

// ── Guard ──────────────────────────────────────────────────────────────────────

/**
 * Execute `fn` while holding the pipeline lock.
 *
 * - Acquires the lock before calling `fn`.
 * - Releases the lock in a `finally` block (on success OR failure).
 * - Returns a discriminated union so callers can branch on `locked`.
 *
 * @param triggeredBy  Who is requesting the lock (e.g. 'cron', 'admin', 'ingest')
 * @param requestId    Correlation ID for logging
 * @param scope        Log scope label (e.g. 'pipeline/run', 'ingest', 'signals')
 * @param fn           The pipeline work to execute under the lock
 */
export async function withPipelineLock<T>(
  triggeredBy: string,
  requestId: string,
  scope: string,
  fn: () => Promise<T>,
): Promise<LockGuardResult<T>> {
  const lockResult = await acquirePipelineLock(triggeredBy);

  if (!lockResult.acquired) {
    logWithRequestId(requestId, scope, `lock denied — ${lockResult.reason} (lockedBy=${lockResult.lockedBy ?? 'unknown'})`);
    return {
      locked: true,
      reason: lockResult.reason,
      lockedBy: lockResult.lockedBy,
    };
  }

  logWithRequestId(requestId, scope, `lock acquired (strategy=${lockResult.strategy}, lockId=${lockResult.lockId})`);

  try {
    const result = await fn();
    return {
      locked: false,
      result,
      lockId: lockResult.lockId,
      strategy: lockResult.strategy,
    };
  } finally {
    await releasePipelineLock(lockResult.lockId);
    logWithRequestId(requestId, scope, `lock released (lockId=${lockResult.lockId})`);
  }
}

// ── Response builders ──────────────────────────────────────────────────────────

/**
 * Build a standard HTTP 409 JSON response for a blocked pipeline run.
 * Includes enough detail for debugging without leaking secrets.
 */
export function pipelineLockedResponse(
  requestId: string,
  blocked: LockGuardBlocked,
): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      status: 'skipped_active_run',
      requestId,
      message: 'Pipeline already active — duplicate run blocked.',
      lockedBy: blocked.lockedBy ?? 'unknown',
      reason: blocked.reason,
      timestamp: new Date().toISOString(),
    },
    { status: 409 },
  );
}

// Re-export for convenience so routes only need one import
export { getPipelineLockStatus };
