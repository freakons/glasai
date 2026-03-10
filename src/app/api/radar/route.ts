export const runtime = 'nodejs';
/**
 * Omterminal — Real-time Trend Radar API
 *
 * GET /api/radar
 *   Runs all alert detectors, sorts by score, and returns the top 10 alerts.
 *
 * Response: { timestamp, alerts }
 */

import { NextResponse } from 'next/server';
import { detectAlerts } from '@/intelligence/alertEngine';

export async function GET() {
  try {
    const alerts = await detectAlerts();

    const top10 = alerts
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    const source = top10.length > 0 ? 'db' : 'empty';
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      alerts:    top10,
      count:     top10.length,
      source,
    }, { headers: { 'x-data-origin': source } });
  } catch (err) {
    console.error('[api/radar] alert engine error:', err);
    return NextResponse.json(
      { timestamp: new Date().toISOString(), alerts: [], count: 0, source: 'error' },
      { status: 503, headers: { 'x-data-origin': 'error' } },
    );
  }
}
