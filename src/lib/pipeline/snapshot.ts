/**
 * Omterminal — Page Snapshot Generation
 *
 * Generates precomputed read-model snapshots for public-facing pages.
 * Called as a stage in the canonical pipeline run so user-facing reads
 * consume cheap, precomputed data rather than recomputing on every request.
 *
 * Snapshots are stored in:
 *   1. page_snapshots DB table (primary, durable)
 *   2. Redis cache (fast-path, if configured)
 *
 * Keys generated:
 *   homepage:stats        — site-wide counts for the homepage ticker
 *   signals:top           — top 20 recent signals
 *   funding:aggregates    — funding rounds + total
 *   models:overview       — AI model listing
 *   regulation:overview   — regulation listing
 *   entities:overview     — entity listing
 */

import { dbQuery, tableExists } from '@/db/client';
import { setCache, isRedisConfigured } from '@/lib/cache/redis';

const SNAPSHOT_TTL_SECONDS = parseInt(process.env.SNAPSHOT_TTL_SECONDS ?? '300', 10);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SnapshotResult {
  snapshotsGenerated: number;
  snapshots: string[];
  errors: string[];
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Generate all page snapshots. Returns counts and any per-snapshot errors. */
export async function generatePageSnapshots(): Promise<SnapshotResult> {
  const generators: Array<[string, () => Promise<unknown>]> = [
    ['homepage:stats',        generateHomepageStats],
    ['signals:top',           generateTopSignals],
    ['funding:aggregates',    generateFundingAggregates],
    ['models:overview',       generateModelsOverview],
    ['regulation:overview',   generateRegulationOverview],
    ['entities:overview',     generateEntitiesOverview],
  ];

  const snapshots: string[] = [];
  const errors: string[] = [];

  for (const [key, fn] of generators) {
    try {
      const payload = await fn();
      await persistSnapshot(key, payload);
      snapshots.push(key);
    } catch (err) {
      errors.push(`${key}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { snapshotsGenerated: snapshots.length, snapshots, errors };
}

/**
 * Read a snapshot from cache (Redis → DB → null).
 * Returns null when no snapshot exists or all sources fail.
 */
export async function readSnapshot<T = unknown>(key: string): Promise<T | null> {
  // Try Redis fast-path first
  if (isRedisConfigured()) {
    try {
      const { getCache } = await import('@/lib/cache/redis');
      const cached = await getCache<T>(`snapshot:${key}`);
      if (cached !== null) return cached;
    } catch {
      // Fall through to DB
    }
  }

  // DB fallback
  try {
    if (!(await tableExists('page_snapshots'))) return null;

    const rows = await dbQuery<{
      payload: T;
      generated_at: string;
      ttl_seconds: number;
    }>`
      SELECT payload, generated_at, ttl_seconds
      FROM page_snapshots
      WHERE key = ${key}
    `;

    if (rows.length === 0) return null;

    const row = rows[0];
    const ageSeconds = (Date.now() - new Date(row.generated_at).getTime()) / 1000;

    // Reject snapshots older than 2× TTL (stale beyond reasonable tolerance)
    if (ageSeconds > row.ttl_seconds * 2) return null;

    return row.payload;
  } catch {
    return null;
  }
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function persistSnapshot(key: string, payload: unknown): Promise<void> {
  const payloadJson = JSON.stringify(payload);

  // Write to DB (upsert)
  await dbQuery`
    INSERT INTO page_snapshots (key, payload, generated_at, ttl_seconds)
    VALUES (${key}, ${payloadJson}::jsonb, NOW(), ${SNAPSHOT_TTL_SECONDS})
    ON CONFLICT (key) DO UPDATE
      SET payload      = EXCLUDED.payload,
          generated_at = EXCLUDED.generated_at,
          ttl_seconds  = EXCLUDED.ttl_seconds
  `;

  // Also prime the Redis cache
  if (isRedisConfigured()) {
    await setCache(`snapshot:${key}`, payload, SNAPSHOT_TTL_SECONDS);
  }
}

// ── Snapshot generators ───────────────────────────────────────────────────────

async function generateHomepageStats(): Promise<unknown> {
  type CoreRow = { signals: string; companies: string; sources: string };
  const rows = await dbQuery<CoreRow>`
    SELECT
      (SELECT COUNT(*) FROM signals
        WHERE status IS NULL OR status NOT IN ('rejected'))::text AS signals,
      (SELECT COUNT(*) FROM entities)::text AS companies,
      (SELECT COUNT(DISTINCT source) FROM articles)::text AS sources
  `;
  const c = rows[0] ?? { signals: '0', companies: '0', sources: '0' };

  const [regsExist, modelsExist, fundingExist] = await Promise.all([
    tableExists('regulations'),
    tableExists('ai_models'),
    tableExists('funding_rounds'),
  ]);

  let regulations = 0, models = 0, fundingRounds = 0, totalFundingUsdM = 0;

  if (regsExist) {
    const r = await dbQuery<{ count: string }>`SELECT COUNT(*)::text AS count FROM regulations`;
    regulations = parseInt(r[0]?.count ?? '0', 10) || 0;
  }

  if (modelsExist) {
    const r = await dbQuery<{ count: string }>`SELECT COUNT(*)::text AS count FROM ai_models`;
    models = parseInt(r[0]?.count ?? '0', 10) || 0;
  }

  if (fundingExist) {
    const r = await dbQuery<{ count: string }>`SELECT COUNT(*)::text AS count FROM funding_rounds`;
    fundingRounds = parseInt(r[0]?.count ?? '0', 10) || 0;
    try {
      const f = await dbQuery<{ total: string }>`
        SELECT COALESCE(SUM(amount_usd_m), 0)::text AS total
        FROM funding_rounds
        WHERE amount_usd_m IS NOT NULL
      `;
      totalFundingUsdM = parseFloat(f[0]?.total ?? '0') || 0;
    } catch {
      // migration 004 not yet applied — amount_usd_m column absent
    }
  }

  return {
    signals:          parseInt(c.signals,   10) || 0,
    companies:        parseInt(c.companies, 10) || 0,
    sources:          parseInt(c.sources,   10) || 0,
    regulations,
    models,
    fundingRounds,
    totalFundingUsdM,
    generatedAt: new Date().toISOString(),
  };
}

async function generateTopSignals(): Promise<unknown> {
  const rows = await dbQuery<{
    id: string; title: string; category: string; signal_type: string;
    entity_name: string; summary: string;
    confidence: number; confidence_score: string;
    date: string; created_at: string;
  }>`
    SELECT id, title, category, signal_type, entity_name, summary,
           confidence, confidence_score, date, created_at
    FROM signals
    WHERE status IS NULL OR status NOT IN ('rejected')
    ORDER BY created_at DESC
    LIMIT 20
  `;
  return { signals: rows, count: rows.length, generatedAt: new Date().toISOString() };
}

async function generateFundingAggregates(): Promise<unknown> {
  if (!(await tableExists('funding_rounds'))) {
    return { rounds: [], totalUsdM: 0, count: 0, generatedAt: new Date().toISOString() };
  }

  // Try with amount_usd_m (migration 004), fall back without
  let rows: Array<{ company: string; amount: string; round: string; date: string; amount_usd_m?: string }> = [];
  try {
    rows = await dbQuery<{ company: string; amount: string; round: string; date: string; amount_usd_m: string }>`
      SELECT company, amount, round, date, amount_usd_m
      FROM funding_rounds
      ORDER BY created_at DESC
      LIMIT 20
    `;
  } catch {
    rows = await dbQuery<{ company: string; amount: string; round: string; date: string }>`
      SELECT company, amount, round, date
      FROM funding_rounds
      ORDER BY created_at DESC
      LIMIT 20
    `;
  }

  const totalUsdM = rows.reduce((s, r) => s + (parseFloat(r.amount_usd_m ?? '0') || 0), 0);
  return { rounds: rows, totalUsdM, count: rows.length, generatedAt: new Date().toISOString() };
}

async function generateModelsOverview(): Promise<unknown> {
  if (!(await tableExists('ai_models'))) {
    return { models: [], count: 0, generatedAt: new Date().toISOString() };
  }
  const rows = await dbQuery<{
    id: string; name: string; company: string; type: string; release_date: string;
  }>`
    SELECT id, name, company, type, release_date
    FROM ai_models
    ORDER BY created_at DESC
    LIMIT 20
  `;
  return { models: rows, count: rows.length, generatedAt: new Date().toISOString() };
}

async function generateRegulationOverview(): Promise<unknown> {
  if (!(await tableExists('regulations'))) {
    return { regulations: [], count: 0, generatedAt: new Date().toISOString() };
  }
  const rows = await dbQuery<{
    id: string; title: string; country: string; status: string; type: string; date: string;
  }>`
    SELECT id, title, country, status, type, date
    FROM regulations
    ORDER BY created_at DESC
    LIMIT 20
  `;
  return { regulations: rows, count: rows.length, generatedAt: new Date().toISOString() };
}

async function generateEntitiesOverview(): Promise<unknown> {
  const rows = await dbQuery<{
    id: string; name: string; type: string; country: string;
  }>`
    SELECT id, name, type, country
    FROM entities
    ORDER BY created_at ASC
    LIMIT 50
  `;
  return { entities: rows, count: rows.length, generatedAt: new Date().toISOString() };
}
