export const runtime = 'nodejs';

/**
 * Omterminal — Pipeline Flow Diagnostic Endpoint
 *
 * GET /api/debug/pipeline-flow
 *
 * DIAGNOSTIC ONLY — read-only, no side effects.
 * Used to investigate why the ingestion pipeline reports
 * 0 articlesInserted and 0 signalsGenerated despite fetching 336 articles.
 *
 * Authentication: x-admin-secret header required in production.
 * In development (NODE_ENV !== 'production'), open with no auth.
 *
 * Returns:
 * {
 *   articles24h       — articles created in the last 24 hours
 *   events24h         — events created in the last 24 hours
 *   signals24h        — signals created in the last 24 hours
 *   dedupRate         — fraction of articles that were deduped in last pipeline run
 *   topSources        — sources by articles_fetched from source_health
 *   articlesTotal     — total articles in DB
 *   eventsTotal       — total events in DB
 *   signalsTotal      — total signals in DB
 *   eventsByType      — event type breakdown for recent events
 *   articlesBySource  — article count per source (last 24h)
 *   lastPipelineRuns  — last 5 pipeline run records
 *   sourcesWithEvents — sources that produced events vs those that didn't
 *   diagnosticNotes   — human-readable root cause hints
 * }
 *
 * Root cause hypotheses being tested:
 *  1. Aggressive deduplication (all articles already in DB)
 *  2. Title fingerprint hash collision causing false-positive near-dedup
 *  3. Event extraction failure (articles exist but no events derived)
 *  4. Signal generation threshold not met (events don't cluster)
 *  5. Signals computed but already exist (ON CONFLICT DO NOTHING → 0 new inserts)
 *  6. Source health: high fetch counts but zero events
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbQuery } from '@/db/client';

// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const isProd     = process.env.NODE_ENV === 'production';
  const adminSecret = (process.env.ADMIN_SECRET ?? '').trim();

  // In dev with no secret configured, allow open access
  if (!isProd && !adminSecret) return true;

  const provided = (req.headers.get('x-admin-secret') ?? '').trim();
  return adminSecret.length > 0 && provided === adminSecret;
}

// ─────────────────────────────────────────────────────────────────────────────
// DB query helpers
// ─────────────────────────────────────────────────────────────────────────────

async function safeQuery<T>(fn: () => Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[pipeline-flow] query failed (${label}):`, err instanceof Error ? err.message : String(err));
    return fallback;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized — provide x-admin-secret header' },
      { status: 401 },
    );
  }

  // ── Step 1: Article counts (last 24h + total) ─────────────────────────────
  // Diagnoses: are articles actually in the DB? Were any added recently?
  const [articles24hRows, articlesTotalRows] = await Promise.all([
    safeQuery(
      () => dbQuery<{ count: string }>`
        SELECT COUNT(*)::text AS count FROM articles
        WHERE created_at >= NOW() - INTERVAL '24 hours'
      `,
      [],
      'articles24h',
    ),
    safeQuery(
      () => dbQuery<{ count: string }>`SELECT COUNT(*)::text AS count FROM articles`,
      [],
      'articlesTotal',
    ),
  ]);

  const articles24h   = parseInt(articles24hRows[0]?.count ?? '0', 10);
  const articlesTotal = parseInt(articlesTotalRows[0]?.count ?? '0', 10);

  // ── Step 2: Article timestamp distribution (STEP 2 — RSS timestamp check) ─
  // Diagnoses: are RSS feeds returning old timestamps, causing dedup misses?
  const articleTimestampRows = await safeQuery(
    () => dbQuery<{ bucket: string; count: string }>`
      SELECT
        CASE
          WHEN published_at >= NOW() - INTERVAL '1 hour'  THEN 'last_1h'
          WHEN published_at >= NOW() - INTERVAL '6 hours' THEN 'last_6h'
          WHEN published_at >= NOW() - INTERVAL '24 hours' THEN 'last_24h'
          WHEN published_at >= NOW() - INTERVAL '7 days'  THEN 'last_7d'
          ELSE 'older'
        END AS bucket,
        COUNT(*)::text AS count
      FROM articles
      GROUP BY bucket
      ORDER BY MIN(published_at) DESC
    `,
    [],
    'articleTimestamps',
  );

  // ── Step 3: Article dedup analysis (STEP 1 — duplicate analysis) ──────────
  // Group by source + url to surface URL-level collision patterns
  const articlesBySourceRows = await safeQuery(
    () => dbQuery<{ source: string; count: string }>`
      SELECT source, COUNT(*)::text AS count
      FROM articles
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY source
      ORDER BY count::int DESC
      LIMIT 20
    `,
    [],
    'articlesBySource',
  );

  // Detect potential title fingerprint collisions: same fingerprint, different URLs
  const titleFingerprintCollisionRows = await safeQuery(
    () => dbQuery<{ title_fingerprint: string; url_count: string; sample_url: string }>`
      SELECT
        title_fingerprint,
        COUNT(DISTINCT url)::text AS url_count,
        MIN(url)                  AS sample_url
      FROM articles
      WHERE title_fingerprint IS NOT NULL
        AND created_at >= NOW() - INTERVAL '7 days'
      GROUP BY title_fingerprint
      HAVING COUNT(DISTINCT url) > 1
      ORDER BY url_count::int DESC
      LIMIT 10
    `,
    [],
    'fingerprintCollisions',
  );

  // ── Step 4: Event counts + type breakdown (STEP 3 — event extraction) ─────
  // Diagnoses: are articles producing events? What types?
  const [events24hRows, eventsTotalRows, eventsByTypeRows] = await Promise.all([
    safeQuery(
      () => dbQuery<{ count: string }>`
        SELECT COUNT(*)::text AS count FROM events
        WHERE created_at >= NOW() - INTERVAL '24 hours'
      `,
      [],
      'events24h',
    ),
    safeQuery(
      () => dbQuery<{ count: string }>`SELECT COUNT(*)::text AS count FROM events`,
      [],
      'eventsTotal',
    ),
    safeQuery(
      // Critical: what event types exist? Signal engine only fires on specific types.
      // 'other' events NEVER generate signals. If most events are 'other', signals = 0.
      () => dbQuery<{ type: string; count: string; newest: string }>`
        SELECT
          type,
          COUNT(*)::text                            AS count,
          MAX(timestamp)                            AS newest
        FROM events
        WHERE timestamp >= NOW() - INTERVAL '14 days'
        GROUP BY type
        ORDER BY count::int DESC
      `,
      [],
      'eventsByType',
    ),
  ]);

  const events24h   = parseInt(events24hRows[0]?.count ?? '0', 10);
  const eventsTotal = parseInt(eventsTotalRows[0]?.count ?? '0', 10);

  // ── Step 5: Signal generation analysis (STEP 4 — signal filters) ──────────
  // Diagnoses: do events cluster enough to fire signals? Are signals already in DB?
  const [signals24hRows, signalsTotalRows, signalsByTypeRows] = await Promise.all([
    safeQuery(
      () => dbQuery<{ count: string }>`
        SELECT COUNT(*)::text AS count FROM signals
        WHERE created_at >= NOW() - INTERVAL '24 hours'
      `,
      [],
      'signals24h',
    ),
    safeQuery(
      () => dbQuery<{ count: string }>`SELECT COUNT(*)::text AS count FROM signals`,
      [],
      'signalsTotal',
    ),
    safeQuery(
      () => dbQuery<{ signal_type: string; count: string; newest: string }>`
        SELECT
          signal_type,
          COUNT(*)::text AS count,
          MAX(created_at) AS newest
        FROM signals
        GROUP BY signal_type
        ORDER BY count::int DESC
      `,
      [],
      'signalsByType',
    ),
  ]);

  const signals24h   = parseInt(signals24hRows[0]?.count ?? '0', 10);
  const signalsTotal = parseInt(signalsTotalRows[0]?.count ?? '0', 10);

  // ── Step 6: Signal threshold check — can events cluster? ──────────────────
  // For each signal rule, count how many qualifying events exist in the window.
  // Rules: CAPITAL_ACCELERATION ≥3 funding/14d, MODEL_RELEASE_WAVE ≥2 model_release/7d,
  //        REGULATION_ACTIVITY ≥2 regulation|policy/10d, RESEARCH_MOMENTUM ≥2 research_breakthrough/7d,
  //        COMPANY_EXPANSION ≥2 acquisition|partnership|product_launch|company_strategy/10d
  const signalCandidacyRows = await safeQuery(
    () => dbQuery<{ rule: string; event_count: string; threshold: string; can_fire: string }>`
      SELECT
        'CAPITAL_ACCELERATION (≥3 funding/14d)'     AS rule,
        COUNT(*)::text                               AS event_count,
        '3'                                          AS threshold,
        (COUNT(*) >= 3)::text                        AS can_fire
      FROM events
      WHERE type = 'funding'
        AND timestamp >= NOW() - INTERVAL '14 days'

      UNION ALL

      SELECT
        'MODEL_RELEASE_WAVE (≥2 model_release/7d)',
        COUNT(*)::text,
        '2',
        (COUNT(*) >= 2)::text
      FROM events
      WHERE type = 'model_release'
        AND timestamp >= NOW() - INTERVAL '7 days'

      UNION ALL

      SELECT
        'REGULATION_ACTIVITY (≥2 regulation|policy/10d)',
        COUNT(*)::text,
        '2',
        (COUNT(*) >= 2)::text
      FROM events
      WHERE type IN ('regulation', 'policy')
        AND timestamp >= NOW() - INTERVAL '10 days'

      UNION ALL

      SELECT
        'RESEARCH_MOMENTUM (≥2 research_breakthrough/7d)',
        COUNT(*)::text,
        '2',
        (COUNT(*) >= 2)::text
      FROM events
      WHERE type = 'research_breakthrough'
        AND timestamp >= NOW() - INTERVAL '7 days'

      UNION ALL

      SELECT
        'COMPANY_EXPANSION (≥2 strategy|acq|partner/10d)',
        COUNT(*)::text,
        '2',
        (COUNT(*) >= 2)::text
      FROM events
      WHERE type IN ('acquisition', 'partnership', 'product_launch', 'company_strategy')
        AND timestamp >= NOW() - INTERVAL '10 days'
    `,
    [],
    'signalCandidacy',
  );

  // ── Step 7: Source health crosscheck (STEP 5) ─────────────────────────────
  // Sources with high fetch counts but zero events = extraction failure indicator
  const [topSourcesRows, sourcesWithZeroEventsRows] = await Promise.all([
    safeQuery(
      () => dbQuery<{
        source_id: string;
        articles_fetched: string;
        failure_count: string;
        last_success_at: string | null;
        last_error: string | null;
      }>`
        SELECT
          source_id,
          articles_fetched::text,
          failure_count::text,
          last_success_at,
          last_error
        FROM source_health
        ORDER BY articles_fetched DESC
        LIMIT 15
      `,
      [],
      'topSources',
    ),
    safeQuery(
      // Sources present in source_health but with 0 matching events in DB
      () => dbQuery<{ source_id: string; articles_fetched: string; event_count: string }>`
        SELECT
          sh.source_id,
          sh.articles_fetched::text,
          COUNT(e.id)::text AS event_count
        FROM source_health sh
        LEFT JOIN events e ON e.tags @> ARRAY[sh.source_id]
        GROUP BY sh.source_id, sh.articles_fetched
        HAVING COUNT(e.id) = 0
        ORDER BY sh.articles_fetched::int DESC
        LIMIT 10
      `,
      [],
      'sourcesWithZeroEvents',
    ),
  ]);

  // ── Step 8: Last pipeline runs ─────────────────────────────────────────────
  const lastPipelineRunRows = await safeQuery(
    () => dbQuery<{
      id: string | null;
      stage: string;
      status: string;
      trigger_type: string | null;
      started_at: string | null;
      articles_fetched: string | null;
      articles_inserted: string | null;
      articles_deduped: string | null;
      ingested: string | null;
      signals_generated: string | null;
      duration_ms: string | null;
      error_summary: string | null;
    }>`
      SELECT
        id::text,
        stage,
        status,
        trigger_type,
        started_at,
        articles_fetched::text,
        articles_inserted::text,
        articles_deduped::text,
        ingested::text,
        signals_generated::text,
        duration_ms::text,
        error_summary
      FROM pipeline_runs
      ORDER BY started_at DESC NULLS LAST
      LIMIT 5
    `,
    [],
    'lastPipelineRuns',
  );

  // ── Step 9: Dedup rate from last run ──────────────────────────────────────
  const lastRun = lastPipelineRunRows[0];
  const lastFetched  = parseInt(lastRun?.articles_fetched  ?? lastRun?.ingested ?? '0', 10);
  const lastInserted = parseInt(lastRun?.articles_inserted ?? '0', 10);
  const lastDeduped  = parseInt(lastRun?.articles_deduped  ?? '0', 10);
  const dedupRate    = lastFetched > 0
    ? Math.round((lastDeduped / lastFetched) * 10000) / 100
    : null;

  // ── Step 10: Build diagnostic notes ───────────────────────────────────────

  const diagnosticNotes: string[] = [];

  // Note A: Are articles in the DB at all?
  if (articlesTotal === 0) {
    diagnosticNotes.push(
      'CRITICAL: articles table is EMPTY. Pipeline has never successfully inserted articles. ' +
      'Check DB connectivity, migrations, and saveArticle() errors.',
    );
  } else if (articles24h === 0 && articlesTotal > 0) {
    diagnosticNotes.push(
      `INFO: ${articlesTotal} articles exist in DB but NONE were inserted in the last 24h. ` +
      'This is normal steady-state behavior — RSS feeds return the same articles repeatedly. ' +
      'articlesInserted=0 in pipeline_runs does NOT mean the pipeline is broken.',
    );
  }

  // Note B: Are events in the DB at all?
  if (eventsTotal === 0) {
    diagnosticNotes.push(
      'CRITICAL: events table is EMPTY. Even if articles exist, no events were extracted. ' +
      'rssIngester.ts creates one event per article (even for deduped articles on re-runs). ' +
      'Check saveEvent() errors and DB connectivity.',
    );
  }

  // Note C: Signal threshold analysis
  const firingRules = signalCandidacyRows.filter(r => r.can_fire === 'true');
  const blockedRules = signalCandidacyRows.filter(r => r.can_fire === 'false');
  if (firingRules.length === 0 && eventsTotal > 0) {
    diagnosticNotes.push(
      'ROOT CAUSE CANDIDATE: Signal generation thresholds are NOT met. ' +
      'Events exist but no rule has enough qualifying events in its time window. ' +
      `Rules checked: ${signalCandidacyRows.map(r => `${r.rule}=${r.event_count}`).join(', ')}. ` +
      'The most likely sub-cause: most events are type="other" (classified as COMPANY_MOVE) ' +
      'which does not contribute to any signal rule. Check eventsByType breakdown.',
    );
  } else if (firingRules.length > 0 && signalsTotal === 0) {
    diagnosticNotes.push(
      'ROOT CAUSE CANDIDATE: Signal rules CAN fire (enough events exist) but no signals are in DB. ' +
      'Check signalEngine.findClusters() — events may not form time-window clusters even if ' +
      'the total count is sufficient. Check if event timestamps span the required window.',
    );
  } else if (firingRules.length > 0 && signalsTotal > 0 && signals24h === 0) {
    diagnosticNotes.push(
      'INFO: Signals exist in DB (' + signalsTotal + ' total) but none were NEWLY inserted in 24h. ' +
      'signalsGenerated=0 in pipeline_runs means ON CONFLICT DO NOTHING skipped existing signals. ' +
      'This is EXPECTED steady-state behavior — signals already computed from the same event set.',
    );
  }

  // Note D: Event type distribution
  const otherEventRows = eventsByTypeRows.filter(r => r.type === 'other');
  const otherCount = parseInt(otherEventRows[0]?.count ?? '0', 10);
  if (eventsTotal > 0 && otherCount / eventsTotal > 0.5) {
    diagnosticNotes.push(
      `WARNING: ${otherCount}/${eventsTotal} events (${Math.round(otherCount/eventsTotal*100)}%) ` +
      'are type="other". These events never contribute to any signal rule. ' +
      'The classifier (classifier.ts) defaults to COMPANY_MOVE when no keyword matches — ' +
      'and COMPANY_MOVE maps to event type "company_strategy", not "other". ' +
      'But if articles have no content/title, classifyArticle() may return COMPANY_MOVE ' +
      'while rssIngester uses categoryToEventType() which correctly maps it to "company_strategy".',
    );
  }

  // Note E: Title fingerprint collisions
  if (titleFingerprintCollisionRows.length > 0) {
    diagnosticNotes.push(
      `WARNING: ${titleFingerprintCollisionRows.length} title fingerprints match >1 distinct URL in the last 7 days. ` +
      'This indicates aggressive near-dedup collapsing articles that share a title pattern. ' +
      'Example: ' + titleFingerprintCollisionRows[0]?.sample_url,
    );
  }

  // Note F: Dedup rate
  if (dedupRate !== null && dedupRate === 100) {
    diagnosticNotes.push(
      `INFO: 100% dedup rate on last run (${lastDeduped}/${lastFetched} articles). ` +
      'All fetched RSS articles already exist in DB. This is normal for a running system. ' +
      'It does NOT indicate a bug — it means no new articles were published since last run.',
    );
  }

  // Note G: Blocked signal rules
  if (blockedRules.length > 0) {
    diagnosticNotes.push(
      `SIGNAL BLOCKERS: ${blockedRules.length} signal rule(s) below threshold: ` +
      blockedRules.map(r => `${r.rule} (have ${r.event_count}, need ${r.threshold})`).join('; '),
    );
  }

  // ── Assemble response ──────────────────────────────────────────────────────

  return NextResponse.json({
    ok:    true,
    asOf:  new Date().toISOString(),

    // Core pipeline flow counts
    articles24h,
    events24h,
    signals24h,
    articlesTotal,
    eventsTotal,
    signalsTotal,

    // Dedup diagnostics
    dedupRate: dedupRate !== null ? `${dedupRate}%` : 'unknown',
    titleFingerprintCollisions: titleFingerprintCollisionRows.length,
    sampleFingerprintCollisions: titleFingerprintCollisionRows.slice(0, 3),

    // Article timestamp distribution (for RSS timestamp freshness check)
    articleTimestampDistribution: articleTimestampRows,

    // Articles by source (last 24h)
    articlesBySource: articlesBySourceRows,

    // Event type breakdown (KEY for signal generation diagnosis)
    eventsByType: eventsByTypeRows,

    // Signal type breakdown
    signalsByType: signalsByTypeRows,

    // Signal candidacy — can current events fire signals?
    signalCandidacy: signalCandidacyRows.map(r => ({
      rule:       r.rule,
      eventCount: parseInt(r.event_count, 10),
      threshold:  parseInt(r.threshold, 10),
      canFire:    r.can_fire === 'true',
    })),

    // Source health
    topSources:          topSourcesRows,
    sourcesWithNoEvents: sourcesWithZeroEventsRows,

    // Last pipeline runs
    lastPipelineRuns: lastPipelineRunRows,

    // Human-readable root cause analysis
    diagnosticNotes,
  });
}
