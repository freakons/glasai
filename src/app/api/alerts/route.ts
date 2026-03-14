/**
 * Omterminal — Alerts API
 *
 * GET  /api/alerts              — fetch recent alerts + unread count
 *   ?since=<ISO timestamp>      — only return alerts created after this time
 *   ?limit=<number>             — max alerts to return (default 20)
 * PATCH /api/alerts             — mark alert(s) as read
 *   body: { id: string }        — mark single alert read
 *   body: { all: true }         — mark all alerts read
 *
 * When the user has an omterminal_uid cookie, the response includes both
 * platform alerts (user_id IS NULL) and personal alerts for that user.
 * Without a cookie, only platform alerts are returned.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAlerts, getUnreadAlertCount, markAlertRead, markAllAlertsRead } from '@/db/queries';
import { getUserIdFromRequest } from '@/lib/userId';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const since = searchParams.get('since') ?? undefined;
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10) || 20, 100);
    const userId = getUserIdFromRequest(request) ?? undefined;

    const [alerts, unreadCount] = await Promise.all([
      getAlerts(limit, since, userId),
      getUnreadAlertCount(userId),
    ]);
    return NextResponse.json({ alerts, unreadCount });
  } catch {
    return NextResponse.json({ alerts: [], unreadCount: 0 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const userId = getUserIdFromRequest(request) ?? undefined;

    if (body.all === true) {
      await markAllAlertsRead(userId);
      return NextResponse.json({ ok: true });
    }

    if (typeof body.id === 'string') {
      await markAlertRead(body.id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: 'Missing id or all parameter' }, { status: 400 });
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 });
  }
}
