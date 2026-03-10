export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { dbQuery } from '@/db/client';
import { Insight } from '@/insights/types';

interface InsightRow {
  title: string;
  summary: string;
  category: string;
  topics: string[] | null;
  confidence: number;
  created_at: string | null;
}

export async function GET() {
  console.log('[api] API request: insights');

  try {
    const rows = await dbQuery<InsightRow>`
      SELECT title, summary, category, topics, confidence, created_at
      FROM insights
      ORDER BY confidence DESC
      LIMIT 20
    `;

    const insights: Insight[] = rows.map((row) => ({
      title:      row.title,
      summary:    row.summary,
      category:   row.category,
      topics:     Array.isArray(row.topics) ? row.topics : [],
      confidence: row.confidence,
      created_at: row.created_at ?? undefined,
    }));

    return NextResponse.json(
      { ok: true, insights, count: insights.length, source: insights.length > 0 ? 'db' : 'empty' },
      { headers: { 'x-data-origin': insights.length > 0 ? 'db' : 'empty' } },
    );
  } catch (err) {
    console.error('[api/intelligence/insights] DB error:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to fetch insights', insights: [] },
      { status: 503, headers: { 'x-data-origin': 'error' } },
    );
  }
}
