import { NextResponse } from 'next/server';
import { dbQuery }      from '@/db/client';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const rows = await dbQuery<{ now: string }>`SELECT NOW() AS now`;

    if (rows.length === 0) {
      throw new Error('SELECT NOW() returned no rows');
    }

    return NextResponse.json(
      { status: 'ok', database: 'connected', timestamp: Date.now() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { status: 'error', database: 'not_connected', message },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
