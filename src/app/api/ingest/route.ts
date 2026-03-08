import { NextRequest, NextResponse } from 'next/server';
import { ingestGNews } from '@/services/ingestion/gnewsFetcher';

export const maxDuration = 10; // Vercel Hobby plan limit; upgrade to Pro for longer ingestion windows

export async function GET(req: NextRequest) {
    const cronSecret = req.headers.get('x-vercel-cron-secret') || '';
    const querySecret = new URL(req.url).searchParams.get('secret') || '';
    const expected = process.env.CRON_SECRET || '';

  if (expected && cronSecret !== expected && querySecret !== expected) {
        return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
        const result = await ingestGNews();

      const baseUrl = req.headers.get('x-forwarded-host')
          ? `https://${req.headers.get('x-forwarded-host')}`
              : 'https://www.omterminal.com';

      // Trigger snapshot regeneration (fire-and-forget)
      fetch(`${baseUrl}/api/snapshot?secret=${expected}`, { method: 'GET' })
          .catch((err) => console.error('[ingest] snapshot trigger failed:', err));

      // Trigger signals engine (fire-and-forget)
      fetch(`${baseUrl}/api/signals?secret=${expected}`, { method: 'GET' })
          .catch((err) => console.error('[ingest] signals trigger failed:', err));

      return NextResponse.json({
              ok: true,
              ...result,
              timestamp: new Date().toISOString(),
      });
  } catch (err) {
        console.error('[ingest] route error:', err);
        return NextResponse.json(
          { error: String(err) },
          { status: 500 }
              );
  }
}

export const POST = GET;
