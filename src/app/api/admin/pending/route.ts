/**
 * GET /api/admin/pending
 *
 * Returns signals with status = 'review', ordered newest first.
 * Powers the admin review dashboard.
 *
 * Auth:   Authorization: Bearer <ADMIN_SECRET>
 * Query:  ?limit=<number>  (default 50, max 200)
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbQuery } from '@/db/client';

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) return false;
  const header = req.headers.get('authorization') ?? '';
  return header === `Bearer ${expected}`;
}

interface PendingSignalRow {
  id: string;
  title: string;
  summary: string | null;
  description: string;
  category: string | null;
  entity_id: string | null;
  entity_name: string | null;
  confidence: number | null;
  trust_score: number | null;
  source: string | null;
  ai_model: string | null;
  status: string;
  created_at: string;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200);

  const rows = await dbQuery<PendingSignalRow>`
    SELECT
      id,
      title,
      summary,
      description,
      category,
      entity_id,
      entity_name,
      confidence,
      trust_score,
      source,
      ai_model,
      status,
      created_at
    FROM signals
    WHERE  status = 'review'
    ORDER BY created_at DESC
    LIMIT  ${limit}
  `;

  return NextResponse.json({ ok: true, signals: rows, count: rows.length });
}
