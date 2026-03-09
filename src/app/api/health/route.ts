export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { pingRedis } from '@/lib/cache/redis';
import { getActiveProviderName } from '@/lib/ai';

export async function GET() {
  const redisStatus = await pingRedis();

  const health = {
    ok: true,
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'unknown',
    version: '1.0.0',
    db_provider: process.env.DB_PROVIDER || 'neon',
    redis: redisStatus,
    llmProvider: getActiveProviderName() ?? 'not_resolved',
  };

  return NextResponse.json(health, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
