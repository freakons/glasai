/**
 * Database Abstraction Layer — Future integration point.
 *
 * When ready to integrate a real database:
 * 1. Install the database client: npm install @supabase/supabase-js
 * 2. Set environment variables: SUPABASE_URL, SUPABASE_SERVICE_KEY
 * 3. Uncomment and configure the client below
 * 4. Update data service functions in ./index.ts to use db queries
 *
 * Supported databases (in order of recommendation):
 * - Supabase (PostgreSQL + Auth + Realtime) — best for MVP
 * - Neon (serverless PostgreSQL) — best for edge functions
 * - PlanetScale (serverless MySQL) — best for global scale
 */

export interface DatabaseConfig {
  provider: 'supabase' | 'neon' | 'planetscale' | 'mock';
  url?: string;
  key?: string;
}

/** Current database configuration — defaults to mock (seed data) */
export function getDatabaseConfig(): DatabaseConfig {
  const provider = process.env.DB_PROVIDER as DatabaseConfig['provider'] || 'mock';

  return {
    provider,
    url: process.env.SUPABASE_URL || process.env.DATABASE_URL,
    key: process.env.SUPABASE_SERVICE_KEY || process.env.DATABASE_KEY,
  };
}

/**
 * Database client factory.
 * Returns null when using mock data (current state).
 * Returns configured client when database env vars are set.
 */
export function createDatabaseClient() {
  const config = getDatabaseConfig();

  if (config.provider === 'mock' || !config.url) {
    return null;
  }

  // Future: Initialize actual database client here
  // const supabase = createClient(config.url, config.key);
  // return supabase;
  return null;
}
