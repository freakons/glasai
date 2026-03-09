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

declare global {
  // eslint-disable-next-line no-var
  var __neonSql: NeonQueryFunction<false, false> | undefined;
}

function getClient(): NeonQueryFunction<false, false> | null {
  if (globalThis.__neonSql) return globalThis.__neonSql;
  if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'Missing DATABASE_URL environment variable. Database connection cannot be established.'
      );
    }
    console.warn('[db/client] DATABASE_URL is not set — database operations will be skipped.');
    return null;
  }
  globalThis.__neonSql = neon(process.env.DATABASE_URL);
  return globalThis.__neonSql;
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
