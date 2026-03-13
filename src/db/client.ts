/**
 * Omterminal — Database Client
 *
 * Thin wrapper around @neondatabase/serverless for use across the
 * intelligence pipeline.  Compatible with both Node.js and Edge runtimes.
 *
 * Usage:
 *   import { dbQuery } from '@/db/client';
 *   const rows = await dbQuery<MyRow>`SELECT * FROM events LIMIT 10`;
 *
 *   // With per-query context for structured timeout diagnostics:
 *   import { withDbContext } from '@/db/client';
 *   const db = withDbContext({ operation: 'health:ping', requestId });
 *   const rows = await db.query<MyRow>`SELECT NOW()`;
 */

import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { TimeoutError } from '@/lib/withTimeout';

// ─────────────────────────────────────────────────────────────────────────────
// Timeout configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default DB query timeout in milliseconds.
 * Override per-deployment via DB_QUERY_TIMEOUT_MS environment variable.
 * Individual queries can further override via withDbContext({ timeoutMs }).
 */
const DB_QUERY_TIMEOUT_MS = parseInt(process.env.DB_QUERY_TIMEOUT_MS ?? '5000', 10);

// ─────────────────────────────────────────────────────────────────────────────
// Schema-safety helpers (per-process in-memory caches)
// ─────────────────────────────────────────────────────────────────────────────

/** Cache of table existence results — populated on first check per table. */
const _tableExistsCache = new Map<string, boolean>();

/**
 * Tables we've already emitted a "missing" warning for during this runtime
 * session.  Prevents duplicate console.warn spam per build/runtime process.
 */
const _missingTableWarned = new Set<string>();

// ─────────────────────────────────────────────────────────────────────────────
// Connection
//
// Uses globalThis so the client survives HMR reloads in development and is
// shared across module re-evaluations within the same Node.js process.
// On Vercel each serverless function instance is a single process, so this
// gives one persistent connection per instance — no reconnect overhead.
// ─────────────────────────────────────────────────────────────────────────────

// Local dev: use standard pg Pool when DATABASE_URL points to a local postgres
// (i.e. not a Neon HTTP endpoint). This avoids the HTTP-only neon() driver.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pgPool: any | null = null;

function isNeonUrl(url: string): boolean {
  return url.includes('.neon.tech') || url.includes('neon.tech');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryFn = (strings: TemplateStringsArray, ...values: any[]) => Promise<any[]>;

declare global {
  // eslint-disable-next-line no-var
  var __neonSql: NeonQueryFunction<false, false> | undefined;
  // eslint-disable-next-line no-var
  var __pgQueryFn: QueryFn | undefined;
}

function getClient(): QueryFn | null {
  if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'Missing DATABASE_URL environment variable. Database connection cannot be established.'
      );
    }
    console.warn('[db/client] DATABASE_URL is not set — database operations will be skipped.');
    return null;
  }

  const dbUrl = process.env.DATABASE_URL;

  // Use neon HTTP driver for Neon-hosted databases
  if (isNeonUrl(dbUrl)) {
    if (globalThis.__neonSql) return globalThis.__neonSql as QueryFn;
    globalThis.__neonSql = neon(dbUrl);
    return globalThis.__neonSql as QueryFn;
  }

  // Use standard pg Pool for local / non-Neon postgres
  if (globalThis.__pgQueryFn) return globalThis.__pgQueryFn;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Pool } = require('pg') as typeof import('pg');
  if (!_pgPool) {
    _pgPool = new Pool({ connectionString: dbUrl });
  }
  const pool = _pgPool;
  globalThis.__pgQueryFn = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    let query = '';
    const params: unknown[] = [];
    strings.forEach((str, i) => {
      query += str;
      if (i < values.length) {
        params.push(values[i]);
        query += `$${params.length}`;
      }
    });
    const result = await pool.query(query, params);
    return result.rows;
  };
  return globalThis.__pgQueryFn;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-query options
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Options for DB query context binding and per-query timeout overrides.
 * Passed to withDbContext() to create context-bound query helpers.
 */
export interface DbQueryOptions {
  /**
   * Human-readable operation label included in timeout diagnostics.
   * Use dot-separated route:action format, e.g. 'health:ping', 'signals:fetch'.
   */
  operation?: string;
  /** Request correlation ID emitted alongside timeout warnings. */
  requestId?: string;
  /**
   * Per-query timeout override in milliseconds.
   * Defaults to DB_QUERY_TIMEOUT_MS (env var, default 5000 ms).
   */
  timeoutMs?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Timeout helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wraps a DB query promise with a hard deadline.
 *
 * - Resolves with the original value when the query completes in time.
 * - Rejects with a {@link TimeoutError} when the deadline fires.
 * - Emits a structured console.warn with operation, duration, and requestId.
 * - The internal timer is always cleared via a finally block so the Node
 *   event loop is not kept alive after the query settles.
 *
 * @param promise    The DB query promise to guard.
 * @param timeoutMs  Deadline in milliseconds (default: DB_QUERY_TIMEOUT_MS env).
 * @param opts       Optional operation name and requestId for diagnostics.
 */
export async function withDbTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = DB_QUERY_TIMEOUT_MS,
  opts?: Pick<DbQueryOptions, 'operation' | 'requestId'>
): Promise<T> {
  const stage = opts?.operation ? `db:query:${opts.operation}` : 'db:query';
  let handle: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    handle = setTimeout(() => {
      console.warn(
        `[db/client] DB query timeout` +
        ` stage=${stage}` +
        ` timeoutMs=${timeoutMs}` +
        (opts?.requestId ? ` requestId=${opts.requestId}` : '') +
        ` aborted=true`,
      );
      reject(new TimeoutError(stage, timeoutMs, opts?.requestId));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (handle !== undefined) clearTimeout(handle);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Query helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute a tagged-template SQL query and return typed rows.
 *
 * In production, throws if DATABASE_URL is not configured.
 * In development, returns an empty array when DATABASE_URL is absent.
 *
 * On DB timeout, logs a structured warning (via withDbTimeout) and returns [].
 * Use withDbContext() when you need per-query operation labels or requestId.
 *
 * @example
 * const events = await dbQuery<EventRow>`
 *   SELECT * FROM events WHERE company = ${company} LIMIT ${limit}
 * `;
 */
export async function dbQuery<T = Record<string, unknown>>(
  strings: TemplateStringsArray,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...values: any[]
): Promise<T[]> {
  const client = getClient();
  if (!client) return [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await withDbTimeout((client as any)(strings, ...values));
    return result as T[];
  } catch (err) {
    const pgCode = (err as { code?: string })?.code;
    if (pgCode === '42P01') {
      // Postgres "undefined_table" — expected during build when migrations
      // have not yet been applied.  Downgrade to a single deduplicated warn.
      const msg = (err as { message?: string })?.message ?? '';
      const tableMatch = msg.match(/relation "([^"]+)" does not exist/);
      const tableName = tableMatch?.[1] ?? 'unknown';
      if (!_missingTableWarned.has(tableName)) {
        _missingTableWarned.add(tableName);
        console.warn(`[db/client] Table "${tableName}" does not exist yet — returning empty result (run /api/migrate to create schema)`);
      }
    } else if (err instanceof TimeoutError) {
      // Already logged with structured context in withDbTimeout — no duplicate.
    } else {
      console.error('[db/client] Query error:', err);
    }
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience re-export for raw access
// ─────────────────────────────────────────────────────────────────────────────

/** Raw Neon SQL client (null if DATABASE_URL not configured). */
export const sql = getClient;

/**
 * Execute a raw SQL string (no parameterization).
 * Useful for DDL statements like CREATE TABLE / ALTER TABLE.
 */
export async function dbExec(rawSql: string): Promise<void> {
  const client = getClient();
  if (!client) return;
  // Simulate a tagged-template call with a single static string and no values
  const fakeTemplate = Object.assign([rawSql], { raw: [rawSql] }) as TemplateStringsArray;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await withDbTimeout((client as any)(fakeTemplate));
  } catch (err) {
    console.error('[db/client] dbExec error:', err);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Table existence guard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if the named table exists in the public schema.
 *
 * Uses PostgreSQL's `to_regclass()` which never throws an undefined_table
 * error — it simply returns NULL when the table is absent.  Results are
 * cached for the lifetime of the process so repeated calls within a single
 * build/runtime session are free.
 *
 * @example
 * if (!(await tableExists('regulations'))) return [];
 */
export async function tableExists(tableName: string): Promise<boolean> {
  if (_tableExistsCache.has(tableName)) {
    return _tableExistsCache.get(tableName)!;
  }

  const qualifiedName = `public.${tableName}`;
  // dbQuery returns [] when the client is unavailable or the query fails,
  // so this is always safe to call.
  const rows = await dbQuery<{ exists: boolean }>`
    SELECT (to_regclass(${qualifiedName}) IS NOT NULL) AS exists
  `;
  const exists = rows[0]?.exists === true;
  _tableExistsCache.set(tableName, exists);
  return exists;
}

/**
 * Execute a tagged-template SQL query and throw on any error.
 *
 * Unlike dbQuery (which logs and returns []), this variant propagates errors
 * so callers can return a proper HTTP 503 instead of silently serving stale
 * or empty data.  Use this for critical read paths.
 *
 * On timeout, throws a {@link TimeoutError} (a subclass of Error) so callers
 * can distinguish a timeout from other DB failures if needed.
 *
 * @example
 * try {
 *   const rows = await dbQueryStrict<SignalRow>`SELECT * FROM signals LIMIT 50`;
 * } catch (err) {
 *   return NextResponse.json({ ok: false, error: 'DB unavailable' }, { status: 503 });
 * }
 */
export async function dbQueryStrict<T = Record<string, unknown>>(
  strings: TemplateStringsArray,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...values: any[]
): Promise<T[]> {
  const client = getClient();
  if (!client) {
    throw new Error('[db/client] DATABASE_URL is not configured — cannot execute query.');
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await withDbTimeout((client as any)(strings, ...values));
  return result as T[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Context-bound query factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates context-bound query helpers with an operation label, requestId,
 * and optional per-query timeout override.
 *
 * Use this when you want structured timeout diagnostics that include the
 * route name and request correlation ID in the log output.
 *
 * The returned `query` and `queryStrict` behave identically to `dbQuery` and
 * `dbQueryStrict` but pass the provided context through to `withDbTimeout`.
 *
 * @example
 * const db = withDbContext({ operation: 'health:ping', requestId: reqId });
 * const rows = await db.query<{ now: string }>`SELECT NOW() AS now`;
 *
 * // Per-query timeout override (e.g. for a long aggregation):
 * const db = withDbContext({ operation: 'stats:aggregate', timeoutMs: 10000 });
 * const rows = await db.query<CoreRow>`SELECT COUNT(*) ...`;
 */
export function withDbContext(opts: DbQueryOptions) {
  const effectiveTimeoutMs = opts.timeoutMs ?? DB_QUERY_TIMEOUT_MS;
  const timeoutOpts = { operation: opts.operation, requestId: opts.requestId };

  return {
    /**
     * Safe variant: returns [] on error (mirrors dbQuery behaviour).
     * Timeout and other errors are logged but not re-thrown.
     */
    async query<T = Record<string, unknown>>(
      strings: TemplateStringsArray,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...values: any[]
    ): Promise<T[]> {
      const client = getClient();
      if (!client) return [];
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await withDbTimeout((client as any)(strings, ...values), effectiveTimeoutMs, timeoutOpts);
        return result as T[];
      } catch (err) {
        const pgCode = (err as { code?: string })?.code;
        if (pgCode === '42P01') {
          const msg = (err as { message?: string })?.message ?? '';
          const tableMatch = msg.match(/relation "([^"]+)" does not exist/);
          const tableName = tableMatch?.[1] ?? 'unknown';
          if (!_missingTableWarned.has(tableName)) {
            _missingTableWarned.add(tableName);
            console.warn(`[db/client] Table "${tableName}" does not exist yet — returning empty result (run /api/migrate to create schema)`);
          }
        } else if (err instanceof TimeoutError) {
          // Already logged with structured context in withDbTimeout.
        } else {
          console.error(`[db/client] Query error (${opts.operation ?? 'unknown'}):`, err);
        }
        return [];
      }
    },

    /**
     * Strict variant: throws on error (mirrors dbQueryStrict behaviour).
     * On timeout, throws a {@link TimeoutError} with operation + requestId context.
     */
    async queryStrict<T = Record<string, unknown>>(
      strings: TemplateStringsArray,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...values: any[]
    ): Promise<T[]> {
      const client = getClient();
      if (!client) {
        throw new Error('[db/client] DATABASE_URL is not configured — cannot execute query.');
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await withDbTimeout((client as any)(strings, ...values), effectiveTimeoutMs, timeoutOpts);
      return result as T[];
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Default timeout accessor (for diagnostics / health reporting)
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the effective default DB query timeout (from DB_QUERY_TIMEOUT_MS env, or 5000 ms). */
export function getDbQueryTimeoutMs(): number {
  return DB_QUERY_TIMEOUT_MS;
}
