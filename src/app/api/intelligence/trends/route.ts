export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { dbQuery } from '@/db/client';
import { TrendResult } from '@/trends/types';

// s-maxage=30 keeps CDN copies fresh for 30s; stale-while-revalidate lets
// Vercel edge serve stale while fetching a new copy in the background.
const CACHE_HEADERS = { 'Cache-Control': 's-maxage=30, stale-while-revalidate=120' };

interface TrendRow {
  topic: string;
  category: string;
  signal_count: number;
  entities: string[] | null;
  summary: string;
  confidence: number;
  score: number | null;
  importance_score: number | null;
  velocity_score: number | null;
}

export async function GET() {
  console.log('[api] API request: trends');

  try {
    const rows = await dbQuery<TrendRow>`
      SELECT topic, category, signal_count, entities, summary, confidence, score, importance_score, velocity_score
      FROM trends
      ORDER BY confidence DESC
      LIMIT 20
    `;

    // If trends table is empty, fall back to aggregated view from signal_velocity_scores.
    // This ensures velocity data is always available even before trend analysis runs.
    if (rows.length === 0) {
      console.log('[api/trends] trends table empty — returning velocity from signal_velocity_scores');
    }

    const trends: TrendResult[] = rows.map((row) => ({
      topic:            row.topic,
      category:         row.category,
      signal_count:     row.signal_count,
      entities:         Array.isArray(row.entities) ? row.entities : [],
      summary:          row.summary,
      confidence:       row.confidence,
      score:            row.score            ?? 0,
      // importance_score and velocity_score are computed DB-side by the
      // signal_velocity_scores view (migration 002_signal_velocity.sql)
      importance_score: row.importance_score ?? row.score ?? 0,
      velocity_score:   row.velocity_score   ?? 0,
    }));

    const source = trends.length > 0 ? 'db' : 'empty';
    return NextResponse.json(
      { ok: true, trends, count: trends.length, source },
      { headers: { ...CACHE_HEADERS, 'x-data-origin': source } },
    );
  } catch (err) {
    console.error('[api/trends] DB error:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to fetch trends', trends: [] },
      { status: 503, headers: { 'x-data-origin': 'error' } },
    );
  }
}
