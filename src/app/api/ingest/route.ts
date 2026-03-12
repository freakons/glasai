export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { validateEnvironment } from '@/lib/env';
import { ingestGNews } from '@/services/ingestion/gnewsFetcher';
import { createRequestId, logWithRequestId } from '@/lib/requestId';
import { withPipelineLock, pipelineLockedResponse } from '@/lib/pipelineLock';
import { dbQuery } from '@/db/client';

export const maxDuration = 10; // Vercel Hobby plan limit

/**
 * POST/GET /api/ingest
 *
 * Narrowly-scoped internal admin ingestion route.
 * Only runs the GNews ingestion step — no orchestration, no downstream
 * fire-and-forget triggers. Full pipeline orchestration lives exclusively
 * in POST /api/pipeline/run.
 *
 * Auth:
 *   - x-vercel-cron-secret header == CRON_SECRET env
 *   - x-admin-secret header == ADMIN_SECRET env
 *   - No secrets configured → open in local dev only (NODE_ENV !== production)
 *
 * NOTE: This route is intentionally NOT scheduled as a Vercel cron job.
 * The canonical scheduled entrypoint is /api/pipeline/run.
 */

function isAuthorized(req: NextRequest): boolean {
  const cronSecret  = process.env.CRON_SECRET  ?? '';
  const adminSecret = process.env.ADMIN_SECRET ?? '';
  const isProd      = process.env.NODE_ENV === 'production';

  // In production, missing secrets must fail closed — never open the endpoint.
  if (isProd && !cronSecret && !adminSecret) return false;

  // In development with no secrets configured, allow for ergonomics.
  if (!cronSecret && !adminSecret) return true;

  // Do NOT trust User-Agent for authentication — it is trivially spoofable.
  const cronHeader  = req.headers.get('x-vercel-cron-secret') ?? '';
  const adminHeader = req.headers.get('x-admin-secret') ?? '';

  if (cronSecret  && cronHeader  === cronSecret)  return true;
  if (adminSecret && adminHeader === adminSecret) return true;

  return false;
}

export async function GET(req: NextRequest) {
  const t0    = Date.now();
  const reqId = createRequestId();
  validateEnvironment(['GNEWS_API_KEY']);

  if (!isAuthorized(req)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // ── Concurrency lock ──────────────────────────────────────────────────────
  try {
    const guard = await withPipelineLock('ingest', reqId, 'ingest', async () => {
      const result = await ingestGNews();

      // Post-ingest diagnostics (authenticated path only — never exposed publicly)
      let diagnostics: Record<string, unknown> = {};
      try {
        const eventsCount = await dbQuery<{ count: string }>`SELECT COUNT(*) AS count FROM events`;
        const latestEvent = await dbQuery<{ id: string; type: string; title: string; company: string; timestamp: string }>`
          SELECT id, type, title, company, timestamp FROM events ORDER BY timestamp DESC LIMIT 1
        `;
        diagnostics = {
          eventsTableCount: parseInt(eventsCount[0]?.count ?? '0', 10),
          latestEvent: latestEvent[0] ?? null,
        };
      } catch {
        diagnostics = { error: 'diagnostics query failed' };
      }

      return { result, diagnostics };
    });

    if (guard.locked) {
      return pipelineLockedResponse(reqId, guard);
    }

    const { result, diagnostics } = guard.result;
    logWithRequestId(reqId, 'ingest', `total=${result.total} ingested=${result.ingested} skipped=${result.skipped} ms=${Date.now() - t0}`);
    return NextResponse.json({
      ok: true,
      ...result,
      diagnostics,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[ingest] route error:', err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500 },
    );
  }
}

export const POST = GET;
