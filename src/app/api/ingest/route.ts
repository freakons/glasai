export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { validateEnvironment } from '@/lib/env';
import { ingestGNews } from '@/services/ingestion/gnewsFetcher';

export const maxDuration = 10; // Vercel Hobby plan limit

/**
 * Auth strategy:
  * 1. Vercel's own cron scheduler sends requests with User-Agent: vercel-cron/1.0
   *    These are always trusted (only Vercel infrastructure can set this).
    * 2. Manual triggers must pass ?secret=CRON_SECRET or x-cron-secret header.
     */
     function isAuthorized(req: NextRequest): boolean {
       const expected = process.env.CRON_SECRET || '';

         // Vercel cron system sends this user-agent — trust it unconditionally
           const userAgent = req.headers.get('user-agent') || '';
             if (userAgent.includes('vercel-cron')) {
                 return true;
                   }

                     // Manual trigger: check query param or custom header
                       const querySecret = new URL(req.url).searchParams.get('secret') || '';
                         const headerSecret = req.headers.get('x-cron-secret') || '';

                           if (!expected) return true; // No secret configured — allow all (local dev)
                             return querySecret === expected || headerSecret === expected;
                             }

                             export async function GET(req: NextRequest) {
                               const t0 = Date.now();
                               validateEnvironment(['CRON_SECRET', 'GNEWS_API_KEY']);

                               if (!isAuthorized(req)) {
                                   return new NextResponse('Unauthorized', { status: 401 });
                                     }

                                       try {
                                           const result = await ingestGNews();

                                               const baseUrl = req.headers.get('x-forwarded-host')
                                                     ? `https://${req.headers.get('x-forwarded-host')}`
                                                           : 'https://www.omterminal.com';

                                                               const secret = process.env.CRON_SECRET || '';

                                                                   // Trigger snapshot regeneration (fire-and-forget)
                                                                       fetch(`${baseUrl}/api/snapshot?secret=${secret}`, { method: 'GET' })
                                                                             .catch((err) => console.error('[ingest] snapshot trigger failed:', err));

                                                                                 // Trigger signals engine (fire-and-forget)
                                                                                     fetch(`${baseUrl}/api/signals?secret=${secret}`, { method: 'GET' })
                                                                                           .catch((err) => console.error('[ingest] signals trigger failed:', err));

                                                                                               console.log(`[ingest] ingested=${result.ingested} skipped=${result.skipped} ms=${Date.now() - t0}`);
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
                                                                                                                                                 