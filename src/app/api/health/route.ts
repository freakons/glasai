export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { dbQuery } from '@/db/client';
import { pingRedis } from '@/lib/cache/redis';
import { getActiveProviderName } from '@/lib/ai';

export async function GET() {
  // DB connectivity check
  let dbStatus: 'connected' | 'disconnected' = 'disconnected';
  try {
    const rows = await dbQuery<{ now: string }>`SELECT NOW() AS now`;
    dbStatus = rows.length > 0 ? 'connected' : 'disconnected';
  } catch {
    dbStatus = 'disconnected';
  }

  // Redis connectivity check
  const redisStatus = await pingRedis();

  const allOk = dbStatus === 'connected';

  const health = {
    ok: allOk,
    status: allOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'unknown',
    version: '1.0.0',
    db: dbStatus,
    db_provider: process.env.DB_PROVIDER || 'neon',
    redis: redisStatus,
    llmProvider: getActiveProviderName() ?? 'not_resolved',
  };

  return NextResponse.json(health, {
    status: allOk ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
