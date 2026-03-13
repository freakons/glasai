/**
 * Omterminal — Timeout Utility
 *
 * Shared timeout helpers for the ingestion pipeline and other async operations.
 *
 * Provides:
 *   - TimeoutError         — structured error class with stage / duration metadata
 *   - withTimeout()        — wraps any Promise with a deadline; clears the timer
 *                            on resolution to avoid keeping the event loop alive
 *   - createAbortTimeout() — creates an AbortController that auto-aborts after
 *                            a deadline, for use with fetch() and other
 *                            AbortSignal-aware APIs
 *
 * Design notes:
 *   - Prefer this utility over ad-hoc Promise.race blocks so timeout behaviour
 *     is consistent across all ingestion stages.
 *   - TimeoutError carries stage, timeoutMs, and optional requestId so callers
 *     can emit structured diagnostics without manual string formatting.
 *   - Use createAbortTimeout() for network fetch() calls so the underlying
 *     HTTP connection is also cancelled, not just the waiting promise.
 */

// ── Error type ────────────────────────────────────────────────────────────────

/**
 * Thrown when withTimeout() or createAbortTimeout() fires.
 * Carries structured metadata for pipeline diagnostics.
 */
export class TimeoutError extends Error {
  /** Pipeline stage that timed out (e.g. 'fetch:rss', 'fetch:gnews', 'persist') */
  readonly stage: string;
  /** Configured timeout duration in milliseconds */
  readonly timeoutMs: number;
  /** Request / correlation ID from the triggering request, if available */
  readonly requestId: string | undefined;

  constructor(stage: string, timeoutMs: number, requestId?: string) {
    const msg =
      `[${stage}] timed out after ${timeoutMs}ms` +
      (requestId ? ` (requestId=${requestId})` : '');
    super(msg);
    this.name = 'TimeoutError';
    this.stage = stage;
    this.timeoutMs = timeoutMs;
    this.requestId = requestId;
    // Maintains proper prototype chain in transpiled targets.
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

// ── Options ───────────────────────────────────────────────────────────────────

export interface TimeoutOptions {
  /** Correlation ID to include in timeout error messages and logs */
  requestId?: string;
  /**
   * Optional callback invoked synchronously just before the TimeoutError is
   * raised.  Use to emit structured log lines without coupling the utility to
   * a specific logger.
   */
  onTimeout?: (stage: string, timeoutMs: number, requestId?: string) => void;
}

// ── Promise-based timeout ─────────────────────────────────────────────────────

/**
 * Wraps a Promise with a hard deadline.
 *
 * - Resolves with the original value if `promise` settles before `timeoutMs`.
 * - Rejects with a {@link TimeoutError} if the deadline expires first.
 * - The internal timer is always cleared when `promise` settles, so the Node
 *   event loop is not kept alive unnecessarily.
 *
 * @param promise    The async operation to guard.
 * @param timeoutMs  Maximum duration in milliseconds.
 * @param stage      Pipeline stage name included in error messages and logs.
 * @param opts       Optional requestId and onTimeout callback.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  stage: string,
  opts?: TimeoutOptions,
): Promise<T> {
  let handle: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    handle = setTimeout(() => {
      opts?.onTimeout?.(stage, timeoutMs, opts.requestId);
      reject(new TimeoutError(stage, timeoutMs, opts?.requestId));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (handle !== undefined) clearTimeout(handle);
  }
}

// ── AbortController-based timeout ─────────────────────────────────────────────

/**
 * Creates an AbortController whose signal is automatically aborted after
 * `timeoutMs` milliseconds with a {@link TimeoutError} as the abort reason.
 *
 * Intended for use with `fetch()` and other Web-standard AbortSignal-aware APIs:
 *
 * ```ts
 * const { controller, clear } = createAbortTimeout(5000, 'fetch:gnews', opts);
 * try {
 *   const res = await fetch(url, { signal: controller.signal });
 *   // ...
 * } finally {
 *   clear(); // always cancel the timer when the operation completes
 * }
 * ```
 *
 * @param timeoutMs  Duration before the abort fires.
 * @param stage      Stage name embedded in the TimeoutError reason.
 * @param opts       Optional requestId and onTimeout callback.
 * @returns          `{ controller, clear }` — call `clear()` after the operation.
 */
export function createAbortTimeout(
  timeoutMs: number,
  stage: string,
  opts?: TimeoutOptions,
): { controller: AbortController; clear: () => void } {
  const controller = new AbortController();

  const handle = setTimeout(() => {
    opts?.onTimeout?.(stage, timeoutMs, opts.requestId);
    controller.abort(new TimeoutError(stage, timeoutMs, opts?.requestId));
  }, timeoutMs);

  return {
    controller,
    clear: () => clearTimeout(handle),
  };
}
