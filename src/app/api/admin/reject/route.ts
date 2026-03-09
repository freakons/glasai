export const runtime = 'nodejs';
/**
 * POST /api/admin/reject
 *
 * Manually sets a signal's status to 'rejected', removing it from the
 * public feed.
 *
 * Auth:  Authorization: Bearer <ADMIN_SECRET>
 * Body:  { signalId: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbQuery } from '@/db/client';

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) return false;
  const header = req.headers.get('authorization') ?? '';
  return header === `Bearer ${expected}`;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { signalId } = body as { signalId?: unknown };
  if (typeof signalId !== 'string' || signalId.trim() === '') {
    return NextResponse.json({ error: '`signalId` is required' }, { status: 400 });
  }

  const rows = await dbQuery<{ id: string }>`
    UPDATE signals
    SET    status = 'rejected', updated_at = NOW()
    WHERE  id = ${signalId.trim()}
    RETURNING id
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Signal not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, id: rows[0].id, status: 'rejected' });
}
