export const runtime = 'nodejs';

/**
 * Omterminal — Historical Data Consistency Diagnostics
 *
 * GET  /api/admin/consistency
 *   Run all read-only consistency checks and return a structured report.
 *   Auth: Authorization: Bearer <ADMIN_SECRET>
 *   Query: ?check=<name>  (optional — run a single check instead of all)
 *
 * POST /api/admin/consistency/repair
 *   Run safe, explicit repair actions on low-risk issues.
 *   Auth: Authorization: Bearer <ADMIN_SECRET>
 *   Body: { "action": "orphaned_signal_entities" | "stale_pipeline_runs" | "expired_pipeline_locks" }
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  runAllConsistencyChecks,
  runConsistencyCheck,
  listCheckNames,
  repairOrphanedSignalEntities,
  repairStalePipelineRuns,
  repairExpiredPipelineLocks,
} from '@/db/consistencyChecks';

// ── Auth ──────────────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) return false;
  const header = req.headers.get('authorization') ?? '';
  return header === `Bearer ${expected}`;
}

// ── GET: Run consistency checks ───────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const checkName = searchParams.get('check');

    // Single check mode
    if (checkName) {
      const available = listCheckNames();
      if (!available.includes(checkName)) {
        return NextResponse.json(
          { error: `Unknown check: ${checkName}`, available },
          { status: 400 },
        );
      }

      const issue = await runConsistencyCheck(checkName);
      return NextResponse.json({
        check: checkName,
        status: issue ? 'issue_found' : 'passed',
        issue: issue ?? null,
      });
    }

    // Full report
    const report = await runAllConsistencyChecks();
    return NextResponse.json(report, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (err) {
    console.error('[admin/consistency] Error running checks:', err);
    return NextResponse.json(
      { error: 'Failed to run consistency checks', detail: String(err) },
      { status: 500 },
    );
  }
}

// ── POST: Safe repair actions ─────────────────────────────────────────────────

const REPAIR_ACTIONS: Record<string, { fn: () => Promise<number>; description: string }> = {
  orphaned_signal_entities: {
    fn: repairOrphanedSignalEntities,
    description: 'Delete signal_entities rows referencing non-existent signals or entities',
  },
  stale_pipeline_runs: {
    fn: repairStalePipelineRuns,
    description: 'Mark pipeline runs stuck in "started" for >1h as "error"',
  },
  expired_pipeline_locks: {
    fn: repairExpiredPipelineLocks,
    description: 'Delete expired pipeline lock rows',
  },
};

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const action = body?.action as string | undefined;

    if (!action || !REPAIR_ACTIONS[action]) {
      return NextResponse.json(
        {
          error: 'Invalid or missing repair action',
          available: Object.entries(REPAIR_ACTIONS).map(([key, v]) => ({
            action: key,
            description: v.description,
          })),
        },
        { status: 400 },
      );
    }

    const repair = REPAIR_ACTIONS[action];
    const affected = await repair.fn();

    return NextResponse.json({
      action,
      description: repair.description,
      affectedRows: affected,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[admin/consistency] Repair error:', err);
    return NextResponse.json(
      { error: 'Repair action failed', detail: String(err) },
      { status: 500 },
    );
  }
}
