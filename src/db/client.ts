/**
 * Omterminal — Database Client
 *
 * Thin wrapper around @neondatabase/serverless for use across the
 * intelligence pipeline.  Compatible with both Node.js and Edge runtimes.
 *
 * Usage:
 *   import { dbQuery } from '@/db/client';
 *   const rows = await dbQuery<MyRow>`SELECT * FROM events LIMIT 10`;
 */

import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

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
// Timeout helper
// ─────────────────────────────────────────────────────────────────────────────

export async function withDbTimeout<T>(
  promise: Promise<T>,
  timeoutMs = 5000
): Promise<T> {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('db timeout')), timeoutMs)
  );
  return Promise.race([promise, timeout]) as Promise<T>;
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
    console.error('[db/client] Query error:', err);
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

/**
 * Execute a tagged-template SQL query and throw on any error.
 *
 * Unlike dbQuery (which logs and returns []), this variant propagates errors
 * so callers can return a proper HTTP 503 instead of silently serving stale
 * or empty data.  Use this for critical read paths.
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
