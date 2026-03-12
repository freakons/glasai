export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getPipelineHealth }         from '@/lib/pipelineHealth';
import { createRequestId }           from '@/lib/requestId';

/**
 * GET /api/health/pipeline
 *
 * Requires x-admin-secret header for access.
 * Returns in-process pipeline health state (last_run, signals_ingested, status)
 * with structured grade and requestId correlation.
 */
export function GET(req: NextRequest) {
  const adminSecret = process.env.ADMIN_SECRET ?? '';
  const provided    = req.headers.get('x-admin-secret') ?? '';

  if (!adminSecret || provided !== adminSecret) {
    return NextResponse.json({ ok: false, status: 'unauthorized' }, { status: 401 });
  }

  const requestId = req.headers.get('x-request-id') ?? createRequestId();
  const health = getPipelineHealth();

  // Grade: healthy if we have a recorded run, degraded if unknown
  const grade = health.status === 'ok' ? 'healthy' : 'degraded';

  return Response.json({
    status:           grade,
    pipelineStatus:   health.status,
    ok:               true,
    timestamp:        new Date().toISOString(),
    requestId,
    last_run:         health.last_run,
    signals_ingested: health.signals_ingested,
  });
}
