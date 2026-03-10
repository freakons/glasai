export const runtime = 'nodejs';
import { NextRequest, NextResponse }                    from 'next/server';
import { validateEnvironment }                           from '@/lib/env';
import { createRequestId, logWithRequestId }             from '@/lib/requestId';
import { runPipelineSafe }                               from '@/lib/pipelineTrigger';
import { enqueue }                                       from '@/lib/queue';
import { recordPipelineRun }                             from '@/lib/pipelineHealth';
import { ingestGNews }                                  from '@/services/ingestion/gnewsFetcher';
import { getRecentEvents }                              from '@/services/storage/eventStore';
import { generateSignalsFromEvents }                    from '@/services/signals/signalEngine';
import { saveSignals }                                  from '@/services/storage/signalStore';

export const maxDuration = 10; // Vercel Hobby plan limit

// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) return true; // No secret configured — allow in local dev

  // Vercel cron scheduler
  const userAgent = req.headers.get('user-agent') || '';
  if (userAgent.includes('vercel-cron')) return true;

  const cronHeader  = req.headers.get('x-vercel-cron-secret') || '';
  const querySecret = new URL(req.url).searchParams.get('secret') || '';
  return cronHeader === expected || querySecret === expected;
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const reqId = createRequestId();
  validateEnvironment(['CRON_SECRET', 'GNEWS_API_KEY', 'DATABASE_URL']);

  if (!isAuthorized(req)) {
    return NextResponse.json(
      { status: 'error', message: 'Unauthorized' },
      { status: 401 },
    );
  }

  // ── Step 1: Ingestion (now writes to canonical events table) ──────────────
  const ingestResult = await ingestGNews();

  // ── Step 2: Signal generation from events ─────────────────────────────────
  const events  = await getRecentEvents(500);
  const signals = generateSignalsFromEvents(events);
  const signalsGenerated = await saveSignals(signals);

  recordPipelineRun(signalsGenerated);

  const durationMs = Date.now() - t0;
  logWithRequestId(
    reqId,
    'pipeline/run',
    `ingested=${ingestResult.ingested} events=${events.length} signals=${signalsGenerated} ms=${durationMs}`,
  );

  await enqueue(async () => {
    await runPipelineSafe();
  });

  return NextResponse.json({
    status:  'ok',
    message: 'pipeline executed',
    diagnostics: {
      gnewsFetched: ingestResult.total,
      gnewsIngested: ingestResult.ingested,
      gnewsSkipped: ingestResult.skipped,
      eventsLoaded: events.length,
      signalsGenerated,
      durationMs,
    },
  });
}

export const GET = POST;
