export const runtime = 'nodejs';

/**
 * Omterminal — Source Health API
 *
 * GET /api/sources/health
 *
 * Returns a diagnostic summary of ingestion source reliability, derived
 * from the source_health table populated by the RSS ingestion pipeline.
 *
 * Response shape:
 * {
 *   totalSources     — total rows in source_health
 *   healthySources   — sources with last_success_at within the last 6 hours
 *   failingSources   — sources with failure_count >= 3
 *   staleSources     — sources with last_success_at older than 24 hours
 *   worstSources     — top sources by highest failure_count
 *   topSources       — top sources by highest articles_fetched
 * }
 *
 * Health Score per source:
 *   score = reliability - failure_count + min(articles_fetched / 10, 3)
 *   Clamped to [0, 10].
 *   reliability is looked up from the source registry (default 5 if unknown).
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbQuery, tableExists } from '@/db/client';
import { getSourceById, allSources, getEnabledSources } from '@/config/sources/index';
import type { SourceCategory } from '@/types/sources';

// ── Thresholds ────────────────────────────────────────────────────────────────

const HEALTHY_HOURS   = 6;
const STALE_HOURS     = 24;
const FAILING_THRESHOLD = 3;
const TOP_SOURCES_LIMIT = 10;

// ── Types ─────────────────────────────────────────────────────────────────────

interface SourceHealthRow {
  id: string;
  source_id: string;
  last_success_at: string | null;
  last_failure_at: string | null;
  failure_count: number;
  last_error: string | null;
  last_checked_at: string | null;
  articles_fetched: number;
}

interface SourceHealthSummary {
  sourceId: string;
  failureCount: number;
  articlesFetched: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  score: number;
}

// ── Score calculation ─────────────────────────────────────────────────────────

/**
 * Compute a health score in [0, 10].
 *
 * score = reliability - failure_count + min(articles_fetched / 10, 3)
 *
 * reliability is sourced from the static source registry (default 5).
 */
function computeScore(row: SourceHealthRow): number {
  const sourceDef = getSourceById(row.source_id);
  const reliability = sourceDef?.reliability ?? 5;
  const bonus = Math.min(row.articles_fetched / 10, 3);
  const raw = reliability - row.failure_count + bonus;
  return Math.max(0, Math.min(10, raw));
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  // Gracefully handle missing table (migration not yet applied)
  const tableReady = await tableExists('source_health');
  if (!tableReady) {
    return NextResponse.json(
      {
        error: 'source_health table not found — run POST /api/migrate to apply migrations',
        totalSources: 0,
        healthySources: 0,
        failingSources: 0,
        staleSources: 0,
        worstSources: [],
        topSources: [],
      },
      { status: 503 },
    );
  }

  const rows = await dbQuery<SourceHealthRow>`
    SELECT
      id,
      source_id,
      last_success_at,
      last_failure_at,
      failure_count,
      last_error,
      last_checked_at,
      articles_fetched
    FROM source_health
    ORDER BY last_checked_at DESC NULLS LAST
  `;

  if (rows.length === 0) {
    return NextResponse.json({
      totalSources: 0,
      healthySources: 0,
      failingSources: 0,
      staleSources: 0,
      worstSources: [],
      topSources: [],
    });
  }

  const now = Date.now();
  const healthyCutoff = HEALTHY_HOURS * 3_600_000;
  const staleCutoff   = STALE_HOURS   * 3_600_000;

  let healthySources = 0;
  let failingSources = 0;
  let staleSources   = 0;

  const summaries: SourceHealthSummary[] = rows.map((row) => {
    const lastSuccessMs = row.last_success_at ? new Date(row.last_success_at).getTime() : null;

    const isHealthy = lastSuccessMs !== null && (now - lastSuccessMs) < healthyCutoff;
    const isFailing = row.failure_count >= FAILING_THRESHOLD;
    const isStale   = lastSuccessMs === null || (now - lastSuccessMs) > staleCutoff;

    if (isHealthy)  healthySources++;
    if (isFailing)  failingSources++;
    if (isStale)    staleSources++;

    return {
      sourceId:       row.source_id,
      failureCount:   row.failure_count,
      articlesFetched: row.articles_fetched,
      lastSuccessAt:  row.last_success_at,
      lastFailureAt:  row.last_failure_at,
      lastCheckedAt:  row.last_checked_at,
      lastError:      row.last_error,
      score:          Math.round(computeScore(row) * 10) / 10,
    };
  });

  // Worst sources: highest failure_count (descending), limit TOP_SOURCES_LIMIT
  const worstSources = [...summaries]
    .filter((s) => s.failureCount > 0)
    .sort((a, b) => b.failureCount - a.failureCount)
    .slice(0, TOP_SOURCES_LIMIT);

  // Top sources: highest articles_fetched (descending), limit TOP_SOURCES_LIMIT
  const topSources = [...summaries]
    .filter((s) => s.articlesFetched > 0)
    .sort((a, b) => b.articlesFetched - a.articlesFetched)
    .slice(0, TOP_SOURCES_LIMIT);

  // ── Source category coverage ─────────────────────────────────────────────
  // Show how many sources are configured vs enabled vs recently healthy per category
  const categories: SourceCategory[] = ['news', 'company', 'research', 'developer', 'social', 'policy'];
  const enabledSources = getEnabledSources();
  const categoryStats = categories.map((cat) => {
    const configured = allSources.filter(s => s.category === cat).length;
    const enabled = enabledSources.filter(s => s.category === cat).length;
    const healthyInDb = summaries.filter(s => {
      const def = getSourceById(s.sourceId);
      if (!def || def.category !== cat) return false;
      return s.lastSuccessAt !== null && (now - new Date(s.lastSuccessAt).getTime()) < healthyCutoff;
    }).length;
    return { category: cat, configured, enabled, recentlyHealthy: healthyInDb };
  });

  return NextResponse.json({
    totalSources:   rows.length,
    healthySources,
    failingSources,
    staleSources,
    worstSources,
    topSources,
    registry: {
      totalConfigured: allSources.length,
      totalEnabled: enabledSources.length,
      categoryCoverage: categoryStats,
    },
  });
}
