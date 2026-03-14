/**
 * Omterminal — Alerts API
 *
 * GET  /api/alerts         — fetch recent alerts + unread count
 * PATCH /api/alerts        — mark alert(s) as read
 *   body: { id: string }   — mark single alert read
 *   body: { all: true }    — mark all alerts read
 */

import { NextResponse } from 'next/server';
import { getAlerts, getUnreadAlertCount, markAlertRead, markAllAlertsRead } from '@/db/queries';

export async function GET() {
  try {
    const [alerts, unreadCount] = await Promise.all([
      getAlerts(30),
      getUnreadAlertCount(),
    ]);
    return NextResponse.json({ alerts, unreadCount });
  } catch {
    return NextResponse.json({ alerts: [], unreadCount: 0 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();

    if (body.all === true) {
      await markAllAlertsRead();
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
