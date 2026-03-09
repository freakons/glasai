export const runtime = 'nodejs';
import { NextRequest, NextResponse }                    from 'next/server';
import { validateEnvironment }                           from '@/lib/env';
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
  return req.headers.get('x-vercel-cron-secret') === expected;
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  validateEnvironment(['CRON_SECRET', 'GNEWS_API_KEY', 'DATABASE_URL']);

  if (!isAuthorized(req)) {
    return NextResponse.json(
      { status: 'error', message: 'Unauthorized' },
      { status: 401 },
    );
  }

  // ── Step 1: Ingestion ─────────────────────────────────────────────────────
  const { ingested } = await ingestGNews();

  // ── Step 2: Signal generation ─────────────────────────────────────────────
  const events  = await getRecentEvents(500);
  const signals = generateSignalsFromEvents(events);
  const signalsGenerated = await saveSignals(signals);

  console.log(
    `[pipeline/run] ingested=${ingested} events=${events.length} signals=${signalsGenerated}`,
  );

  return NextResponse.json({
    status:           'pipeline_triggered',
    eventsProcessed:  ingested,
    signalsGenerated,
  });
}

export const GET = POST;
