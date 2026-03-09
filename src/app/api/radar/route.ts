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
  const alerts = await detectAlerts();

  const top10 = alerts
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    alerts:    top10,
  });
}
