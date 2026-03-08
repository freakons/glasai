import { NextRequest, NextResponse } from 'next/server';
import { buildSnapshot } from '@/services/intelligence/buildSnapshot';

export const runtime = 'nodejs';
export const maxDuration = 10; // Vercel Hobby plan limit

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || '';

    // Vercel cron system — always trusted
      const userAgent = req.headers.get('user-agent') || '';
        if (userAgent.includes('vercel-cron')) return true;

          // Manual trigger
            const querySecret = new URL(req.url).searchParams.get('secret') || '';
              const headerSecret = req.headers.get('x-cron-secret') || '';

                if (!expected) return true;
                  return querySecret === expected || headerSecret === expected;
                  }

                  export async function GET(req: NextRequest) {
                    if (!isAuthorized(req)) {
                        return new NextResponse('Unauthorized', { status: 401 });
                          }

                            try {
                                const snapshot = await buildSnapshot();
                                    return NextResponse.json({
                                          ok: true,
                                                total: snapshot.total,
                                                      categories: Object.keys(snapshot.by_category),
                                                            generated_at: snapshot.generated_at,
                                                                });
                                                                  } catch (err) {
                                                                      console.error('[snapshot] route error:', err);
                                                                          return NextResponse.json({ error: String(err) }, { status: 500 });
                                                                            }
                                                                            }
                                                                            