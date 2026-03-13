/**
 * Omterminal — Historical Data Consistency Checks
 *
 * Read-only diagnostic queries that detect integrity issues across the data
 * model: orphaned rows, duplicate entities, missing backlinks, null/stale
 * scores, suspicious timestamps, and partially written pipeline runs.
 *
 * All checks are read-only by default. Optional safe repair helpers are
 * clearly marked and must be called explicitly.
 *
 * Usage:
 *   import { runAllConsistencyChecks } from '@/db/consistencyChecks';
 *   const report = await runAllConsistencyChecks();
 */

import { dbQuery, tableExists } from '@/db/client';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type IssueSeverity = 'critical' | 'warning' | 'info';

export interface ConsistencyIssue {
  /** Short machine-readable check identifier. */
  check: string;
  /** Human-readable description of what was checked. */
  description: string;
  severity: IssueSeverity;
  /** Number of affected rows/records. */
  count: number;
  /** Recommended action for operators. */
  recommendation: string;
  /** Optional sample IDs for debugging (max 5). */
  sampleIds?: string[];
}

export interface ConsistencyReport {
  /** ISO timestamp of when the report was generated. */
  timestamp: string;
  /** Total number of checks executed. */
  checksRun: number;
  /** Total issues found. */
  issuesFound: number;
  /** Overall severity: the highest severity among all issues, or 'healthy'. */
  overallSeverity: 'healthy' | IssueSeverity;
  /** Breakdown by severity. */
  summary: { critical: number; warning: number; info: number };
  /** Individual check results (only issues — passed checks are omitted for brevity). */
  issues: ConsistencyIssue[];
  /** Names of checks that passed cleanly. */
  passed: string[];
  /** Duration of the full check suite in milliseconds. */
  durationMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual checks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Orphaned signal_entities rows: signal_id or entity_id points to a
 * non-existent parent record. CASCADE should prevent this, but partial
 * writes or manual deletes can leave orphans.
 */
async function checkOrphanedSignalEntities(): Promise<ConsistencyIssue | null> {
  if (!(await tableExists('signal_entities'))) return null;

  const rows = await dbQuery<{ orphan_type: string; cnt: string; sample_id: string | null }>`
    SELECT 'missing_signal' AS orphan_type, COUNT(*)::text AS cnt,
           (array_agg(se.signal_id))[1] AS sample_id
    FROM signal_entities se
    LEFT JOIN signals s ON s.id = se.signal_id
    WHERE s.id IS NULL
    UNION ALL
    SELECT 'missing_entity' AS orphan_type, COUNT(*)::text AS cnt,
           (array_agg(se.entity_id))[1] AS sample_id
    FROM signal_entities se
    LEFT JOIN entities e ON e.id = se.entity_id
    WHERE e.id IS NULL
  `;

  const total = rows.reduce((sum, r) => sum + (parseInt(r.cnt, 10) || 0), 0);
  if (total === 0) return null;

  const sampleIds = rows.map(r => r.sample_id).filter(Boolean) as string[];
  return {
    check: 'orphaned_signal_entities',
    description: 'signal_entities rows referencing non-existent signals or entities',
    severity: total > 50 ? 'critical' : 'warning',
    count: total,
    recommendation: 'DELETE orphaned signal_entities rows or investigate missing parent records.',
    sampleIds: sampleIds.slice(0, 5),
  };
}

/**
 * Orphaned signal_contexts rows: signal_id points to a non-existent signal.
 */
async function checkOrphanedSignalContexts(): Promise<ConsistencyIssue | null> {
  if (!(await tableExists('signal_contexts'))) return null;

  const rows = await dbQuery<{ cnt: string; sample_id: string | null }>`
    SELECT COUNT(*)::text AS cnt,
           (array_agg(sc.signal_id))[1] AS sample_id
    FROM signal_contexts sc
    LEFT JOIN signals s ON s.id = sc.signal_id
    WHERE s.id IS NULL
  `;

  const count = parseInt(rows[0]?.cnt ?? '0', 10) || 0;
  if (count === 0) return null;

  return {
    check: 'orphaned_signal_contexts',
    description: 'signal_contexts rows referencing non-existent signals',
    severity: count > 20 ? 'critical' : 'warning',
    count,
    recommendation: 'DELETE orphaned signal_contexts rows.',
    sampleIds: rows[0]?.sample_id ? [rows[0].sample_id] : [],
  };
}

/**
 * Events with source_article_id set to a non-existent article.
 * ON DELETE SET NULL should clear these, but the column could have
 * been populated with a bad ID from the pipeline.
 */
async function checkOrphanedEventArticles(): Promise<ConsistencyIssue | null> {
  const rows = await dbQuery<{ cnt: string; sample_id: string | null }>`
    SELECT COUNT(*)::text AS cnt,
           (array_agg(e.id))[1] AS sample_id
    FROM events e
    WHERE e.source_article_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM articles a WHERE a.id = e.source_article_id)
  `;

  const count = parseInt(rows[0]?.cnt ?? '0', 10) || 0;
  if (count === 0) return null;

  return {
    check: 'orphaned_event_articles',
    description: 'Events referencing non-existent source articles (source_article_id)',
    severity: 'warning',
    count,
    recommendation: 'SET source_article_id = NULL on affected events, or investigate missing articles.',
    sampleIds: rows[0]?.sample_id ? [rows[0].sample_id] : [],
  };
}

/**
 * Signals with NULL significance_score — these are pre-migration 008 rows
 * that should be backfilled on the next engine run.
 */
async function checkNullSignificanceScores(): Promise<ConsistencyIssue | null> {
  const rows = await dbQuery<{ cnt: string; total: string; sample_id: string | null }>`
    SELECT
      COUNT(*) FILTER (WHERE significance_score IS NULL)::text AS cnt,
      COUNT(*)::text AS total,
      (array_agg(id) FILTER (WHERE significance_score IS NULL))[1] AS sample_id
    FROM signals
  `;

  const count = parseInt(rows[0]?.cnt ?? '0', 10) || 0;
  const total = parseInt(rows[0]?.total ?? '0', 10) || 0;
  if (count === 0) return null;

  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return {
    check: 'null_significance_scores',
    description: `Signals missing significance_score (${pct}% of ${total} total)`,
    severity: pct > 50 ? 'warning' : 'info',
    count,
    recommendation: 'Re-run the signals engine to backfill significance scores on legacy rows.',
    sampleIds: rows[0]?.sample_id ? [rows[0].sample_id] : [],
  };
}

/**
 * Signals with NULL trust_score — should be populated by evaluateSignalTrust.
 */
async function checkNullTrustScores(): Promise<ConsistencyIssue | null> {
  const rows = await dbQuery<{ cnt: string; total: string; sample_id: string | null }>`
    SELECT
      COUNT(*) FILTER (WHERE trust_score IS NULL)::text AS cnt,
      COUNT(*)::text AS total,
      (array_agg(id) FILTER (WHERE trust_score IS NULL))[1] AS sample_id
    FROM signals
  `;

  const count = parseInt(rows[0]?.cnt ?? '0', 10) || 0;
  const total = parseInt(rows[0]?.total ?? '0', 10) || 0;
  if (count === 0) return null;

  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return {
    check: 'null_trust_scores',
    description: `Signals missing trust_score (${pct}% of ${total} total)`,
    severity: pct > 50 ? 'warning' : 'info',
    count,
    recommendation: 'Re-run the trust engine to backfill trust scores.',
    sampleIds: rows[0]?.sample_id ? [rows[0].sample_id] : [],
  };
}

/**
 * Duplicate canonical entities: entities that share the same name
 * (case-insensitive). The UNIQUE constraint on `name` prevents exact
 * duplicates, but casing variants could slip through depending on
 * collation, or duplicates could exist from before the constraint.
 */
async function checkDuplicateEntities(): Promise<ConsistencyIssue | null> {
  const rows = await dbQuery<{ lower_name: string; cnt: string }>`
    SELECT LOWER(name) AS lower_name, COUNT(*)::text AS cnt
    FROM entities
    GROUP BY LOWER(name)
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 10
  `;

  if (rows.length === 0) return null;

  const total = rows.reduce((sum, r) => sum + (parseInt(r.cnt, 10) || 0), 0);
  return {
    check: 'duplicate_entities',
    description: 'Entities with duplicate names (case-insensitive)',
    severity: 'warning',
    count: total,
    recommendation: 'Merge duplicate entities and update referencing signal_entities rows.',
    sampleIds: rows.slice(0, 5).map(r => r.lower_name),
  };
}

/**
 * Signals that reference entity_id but no matching entity exists.
 */
async function checkSignalsMissingEntities(): Promise<ConsistencyIssue | null> {
  const rows = await dbQuery<{ cnt: string; sample_id: string | null }>`
    SELECT COUNT(*)::text AS cnt,
           (array_agg(s.id))[1] AS sample_id
    FROM signals s
    WHERE s.entity_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM entities e WHERE e.id = s.entity_id)
  `;

  const count = parseInt(rows[0]?.cnt ?? '0', 10) || 0;
  if (count === 0) return null;

  return {
    check: 'signals_missing_entities',
    description: 'Signals referencing entity_id that does not exist in entities table',
    severity: 'warning',
    count,
    recommendation: 'Create the missing entity or clear entity_id on the affected signals.',
    sampleIds: rows[0]?.sample_id ? [rows[0].sample_id] : [],
  };
}

/**
 * Events that reference entity_id but no matching entity exists.
 */
async function checkEventsMissingEntities(): Promise<ConsistencyIssue | null> {
  const rows = await dbQuery<{ cnt: string; sample_id: string | null }>`
    SELECT COUNT(*)::text AS cnt,
           (array_agg(e.id))[1] AS sample_id
    FROM events e
    WHERE e.entity_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM entities ent WHERE ent.id = e.entity_id)
  `;

  const count = parseInt(rows[0]?.cnt ?? '0', 10) || 0;
  if (count === 0) return null;

  return {
    check: 'events_missing_entities',
    description: 'Events referencing entity_id that does not exist in entities table',
    severity: 'warning',
    count,
    recommendation: 'Create the missing entity or clear entity_id on the affected events.',
    sampleIds: rows[0]?.sample_id ? [rows[0].sample_id] : [],
  };
}

/**
 * Suspicious timestamps: records with created_at or timestamp far in the
 * future (> 24h from now) or impossibly old (before 2020).
 */
async function checkSuspiciousTimestamps(): Promise<ConsistencyIssue | null> {
  const rows = await dbQuery<{ tbl: string; cnt: string; sample_id: string | null }>`
    SELECT 'signals' AS tbl, COUNT(*)::text AS cnt,
           (array_agg(id))[1] AS sample_id
    FROM signals
    WHERE created_at > NOW() + INTERVAL '24 hours'
       OR created_at < '2020-01-01'::timestamptz
    UNION ALL
    SELECT 'events' AS tbl, COUNT(*)::text AS cnt,
           (array_agg(id))[1] AS sample_id
    FROM events
    WHERE timestamp > NOW() + INTERVAL '24 hours'
       OR timestamp < '2020-01-01'::timestamptz
    UNION ALL
    SELECT 'articles' AS tbl, COUNT(*)::text AS cnt,
           (array_agg(id))[1] AS sample_id
    FROM articles
    WHERE published_at > NOW() + INTERVAL '24 hours'
       OR published_at < '2020-01-01'::timestamptz
  `;

  const total = rows.reduce((sum, r) => sum + (parseInt(r.cnt, 10) || 0), 0);
  if (total === 0) return null;

  const detail = rows
    .filter(r => parseInt(r.cnt, 10) > 0)
    .map(r => `${r.tbl}: ${r.cnt}`)
    .join(', ');

  return {
    check: 'suspicious_timestamps',
    description: `Records with timestamps far in the future or before 2020 (${detail})`,
    severity: 'warning',
    count: total,
    recommendation: 'Review and correct timestamps on affected records.',
    sampleIds: rows.map(r => r.sample_id).filter(Boolean).slice(0, 5) as string[],
  };
}

/**
 * Partially persisted pipeline runs: runs with status = 'started' that
 * never completed (no completed_at, and started more than 1 hour ago).
 */
async function checkStalePipelineRuns(): Promise<ConsistencyIssue | null> {
  if (!(await tableExists('pipeline_runs'))) return null;

  const rows = await dbQuery<{ cnt: string; sample_id: string | null }>`
    SELECT COUNT(*)::text AS cnt,
           (array_agg(id::text))[1] AS sample_id
    FROM pipeline_runs
    WHERE status = 'started'
      AND run_at < NOW() - INTERVAL '1 hour'
  `;

  const count = parseInt(rows[0]?.cnt ?? '0', 10) || 0;
  if (count === 0) return null;

  return {
    check: 'stale_pipeline_runs',
    description: 'Pipeline runs stuck in "started" status for over 1 hour',
    severity: count > 5 ? 'critical' : 'warning',
    count,
    recommendation: 'Mark stale pipeline_runs as "error" and investigate pipeline crashes.',
    sampleIds: rows[0]?.sample_id ? [rows[0].sample_id] : [],
  };
}

/**
 * Signals with no linked signal_entities at all — may indicate the entity
 * linker skipped them or failed.
 */
async function checkSignalsWithoutEntityLinks(): Promise<ConsistencyIssue | null> {
  if (!(await tableExists('signal_entities'))) return null;

  const rows = await dbQuery<{ cnt: string; total: string; sample_id: string | null }>`
    SELECT
      COUNT(*) FILTER (WHERE se.signal_id IS NULL)::text AS cnt,
      COUNT(*)::text AS total,
      (array_agg(s.id) FILTER (WHERE se.signal_id IS NULL))[1] AS sample_id
    FROM signals s
    LEFT JOIN signal_entities se ON se.signal_id = s.id
  `;

  const count = parseInt(rows[0]?.cnt ?? '0', 10) || 0;
  const total = parseInt(rows[0]?.total ?? '0', 10) || 0;
  if (count === 0) return null;

  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return {
    check: 'signals_without_entity_links',
    description: `Signals with no signal_entities links (${pct}% of ${total})`,
    severity: pct > 80 ? 'warning' : 'info',
    count,
    recommendation: 'Re-run entity linker to populate signal_entities for unlinked signals.',
    sampleIds: rows[0]?.sample_id ? [rows[0].sample_id] : [],
  };
}

/**
 * Expired pipeline locks that were never cleaned up.
 */
async function checkExpiredPipelineLocks(): Promise<ConsistencyIssue | null> {
  if (!(await tableExists('pipeline_locks'))) return null;

  const rows = await dbQuery<{ cnt: string; sample_key: string | null }>`
    SELECT COUNT(*)::text AS cnt,
           (array_agg(lock_key))[1] AS sample_key
    FROM pipeline_locks
    WHERE expires_at < NOW()
  `;

  const count = parseInt(rows[0]?.cnt ?? '0', 10) || 0;
  if (count === 0) return null;

  return {
    check: 'expired_pipeline_locks',
    description: 'Pipeline locks that have expired but not been cleaned up',
    severity: 'info',
    count,
    recommendation: 'DELETE expired rows from pipeline_locks.',
    sampleIds: rows[0]?.sample_key ? [rows[0].sample_key] : [],
  };
}

/**
 * Signals missing contexts: signals that have no corresponding
 * signal_contexts row at all (not even pending).
 */
async function checkSignalsMissingContexts(): Promise<ConsistencyIssue | null> {
  if (!(await tableExists('signal_contexts'))) return null;

  const rows = await dbQuery<{ cnt: string; total: string; sample_id: string | null }>`
    SELECT
      COUNT(*) FILTER (WHERE sc.id IS NULL)::text AS cnt,
      COUNT(*)::text AS total,
      (array_agg(s.id) FILTER (WHERE sc.id IS NULL))[1] AS sample_id
    FROM signals s
    LEFT JOIN signal_contexts sc ON sc.signal_id = s.id
  `;

  const count = parseInt(rows[0]?.cnt ?? '0', 10) || 0;
  const total = parseInt(rows[0]?.total ?? '0', 10) || 0;
  if (count === 0) return null;

  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return {
    check: 'signals_missing_contexts',
    description: `Signals with no signal_contexts row (${pct}% of ${total})`,
    severity: pct > 80 ? 'warning' : 'info',
    count,
    recommendation: 'Trigger context generation for signals missing a signal_contexts row.',
    sampleIds: rows[0]?.sample_id ? [rows[0].sample_id] : [],
  };
}

/**
 * Confidence score out-of-range: signals where confidence_score falls
 * outside the expected [0, 1] range despite the CHECK constraint.
 * This can happen if data was inserted before the constraint existed.
 */
async function checkConfidenceScoreRange(): Promise<ConsistencyIssue | null> {
  const rows = await dbQuery<{ cnt: string; sample_id: string | null }>`
    SELECT COUNT(*)::text AS cnt,
           (array_agg(id))[1] AS sample_id
    FROM signals
    WHERE confidence_score IS NOT NULL
      AND (confidence_score < 0 OR confidence_score > 1)
  `;

  const count = parseInt(rows[0]?.cnt ?? '0', 10) || 0;
  if (count === 0) return null;

  return {
    check: 'confidence_score_out_of_range',
    description: 'Signals with confidence_score outside [0, 1]',
    severity: 'critical',
    count,
    recommendation: 'Clamp confidence_score to [0, 1] and investigate the source of bad data.',
    sampleIds: rows[0]?.sample_id ? [rows[0].sample_id] : [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Safe repair helpers (explicit, low-risk)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Delete orphaned signal_entities rows where the parent signal or entity
 * no longer exists. This is safe because the rows are already functionally
 * dead — they reference nothing.
 *
 * Returns the number of rows deleted.
 */
export async function repairOrphanedSignalEntities(): Promise<number> {
  if (!(await tableExists('signal_entities'))) return 0;

  const result = await dbQuery<{ deleted: string }>`
    WITH deleted_missing_signal AS (
      DELETE FROM signal_entities se
      WHERE NOT EXISTS (SELECT 1 FROM signals s WHERE s.id = se.signal_id)
      RETURNING 1
    ),
    deleted_missing_entity AS (
      DELETE FROM signal_entities se
      WHERE NOT EXISTS (SELECT 1 FROM entities e WHERE e.id = se.entity_id)
      RETURNING 1
    )
    SELECT
      ((SELECT COUNT(*) FROM deleted_missing_signal) +
       (SELECT COUNT(*) FROM deleted_missing_entity))::text AS deleted
  `;

  return parseInt(result[0]?.deleted ?? '0', 10) || 0;
}

/**
 * Mark stale pipeline runs (stuck in 'started' for over 1 hour) as 'error'.
 * Returns the number of rows updated.
 */
export async function repairStalePipelineRuns(): Promise<number> {
  if (!(await tableExists('pipeline_runs'))) return 0;

  const result = await dbQuery<{ updated: string }>`
    WITH fixed AS (
      UPDATE pipeline_runs
      SET status = 'error',
          error_msg = COALESCE(error_msg, 'Automatically marked as error: stuck in started state')
      WHERE status = 'started'
        AND run_at < NOW() - INTERVAL '1 hour'
      RETURNING 1
    )
    SELECT COUNT(*)::text AS updated FROM fixed
  `;

  return parseInt(result[0]?.updated ?? '0', 10) || 0;
}

/**
 * Delete expired pipeline locks. These are functionally dead and block
 * nothing, but cleaning them prevents clutter.
 * Returns the number of rows deleted.
 */
export async function repairExpiredPipelineLocks(): Promise<number> {
  if (!(await tableExists('pipeline_locks'))) return 0;

  const result = await dbQuery<{ deleted: string }>`
    WITH removed AS (
      DELETE FROM pipeline_locks
      WHERE expires_at < NOW()
      RETURNING 1
    )
    SELECT COUNT(*)::text AS deleted FROM removed
  `;

  return parseInt(result[0]?.deleted ?? '0', 10) || 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator
// ─────────────────────────────────────────────────────────────────────────────

/** All registered check functions. */
const ALL_CHECKS: Array<{ name: string; fn: () => Promise<ConsistencyIssue | null> }> = [
  { name: 'orphaned_signal_entities',    fn: checkOrphanedSignalEntities },
  { name: 'orphaned_signal_contexts',    fn: checkOrphanedSignalContexts },
  { name: 'orphaned_event_articles',     fn: checkOrphanedEventArticles },
  { name: 'null_significance_scores',    fn: checkNullSignificanceScores },
  { name: 'null_trust_scores',           fn: checkNullTrustScores },
  { name: 'duplicate_entities',          fn: checkDuplicateEntities },
  { name: 'signals_missing_entities',    fn: checkSignalsMissingEntities },
  { name: 'events_missing_entities',     fn: checkEventsMissingEntities },
  { name: 'suspicious_timestamps',       fn: checkSuspiciousTimestamps },
  { name: 'stale_pipeline_runs',         fn: checkStalePipelineRuns },
  { name: 'signals_without_entity_links', fn: checkSignalsWithoutEntityLinks },
  { name: 'expired_pipeline_locks',      fn: checkExpiredPipelineLocks },
  { name: 'signals_missing_contexts',    fn: checkSignalsMissingContexts },
  { name: 'confidence_score_out_of_range', fn: checkConfidenceScoreRange },
];

/**
 * Run all consistency checks and produce a structured report.
 *
 * All checks are read-only. No mutations are performed.
 * Each check returns null when no issue is found — only actual issues
 * are included in the report.
 */
export async function runAllConsistencyChecks(): Promise<ConsistencyReport> {
  const t0 = Date.now();
  const issues: ConsistencyIssue[] = [];
  const passed: string[] = [];

  // Run checks concurrently for speed — they are all independent reads.
  const results = await Promise.allSettled(
    ALL_CHECKS.map(async ({ name, fn }) => {
      const issue = await fn();
      return { name, issue };
    }),
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      if (result.value.issue) {
        issues.push(result.value.issue);
      } else {
        passed.push(result.value.name);
      }
    } else {
      // Check threw — report it as a warning so operators know
      issues.push({
        check: 'check_error',
        description: `A consistency check failed to execute: ${result.reason}`,
        severity: 'warning',
        count: 0,
        recommendation: 'Investigate the error. The underlying table may be missing or inaccessible.',
      });
    }
  }

  // Sort: critical first, then warning, then info
  const severityOrder: Record<IssueSeverity, number> = { critical: 0, warning: 1, info: 2 };
  issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const summary = {
    critical: issues.filter(i => i.severity === 'critical').length,
    warning:  issues.filter(i => i.severity === 'warning').length,
    info:     issues.filter(i => i.severity === 'info').length,
  };

  const overallSeverity: ConsistencyReport['overallSeverity'] =
    summary.critical > 0 ? 'critical' :
    summary.warning > 0  ? 'warning'  :
    summary.info > 0     ? 'info'     : 'healthy';

  return {
    timestamp: new Date().toISOString(),
    checksRun: ALL_CHECKS.length,
    issuesFound: issues.length,
    overallSeverity,
    summary,
    issues,
    passed,
    durationMs: Date.now() - t0,
  };
}

/**
 * Run a subset of checks by name.
 * Useful for targeted diagnostics or testing individual checks.
 */
export async function runConsistencyCheck(checkName: string): Promise<ConsistencyIssue | null> {
  const check = ALL_CHECKS.find(c => c.name === checkName);
  if (!check) throw new Error(`Unknown consistency check: ${checkName}`);
  return check.fn();
}

/** List all available check names. */
export function listCheckNames(): string[] {
  return ALL_CHECKS.map(c => c.name);
}
