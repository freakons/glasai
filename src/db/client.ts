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
// ─────────────────────────────────────────────────────────────────────────────

let _sql: NeonQueryFunction<false, false> | null = null;

function getClient(): NeonQueryFunction<false, false> | null {
  if (_sql) return _sql;
  if (!process.env.DATABASE_URL) {
    console.warn('[db/client] DATABASE_URL is not set — database operations will be skipped.');
    return null;
  }
  _sql = neon(process.env.DATABASE_URL);
  return _sql;
}

// ─────────────────────────────────────────────────────────────────────────────
// Query helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute a tagged-template SQL query and return typed rows.
 *
 * Returns an empty array when DATABASE_URL is absent (safe for build time).
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
    const result = await (client as any)(strings, ...values);
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
