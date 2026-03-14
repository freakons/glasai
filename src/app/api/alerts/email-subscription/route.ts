/**
 * Omterminal — Email Digest Subscription API
 *
 * GET  /api/alerts/email-subscription — get current subscription status
 * POST /api/alerts/email-subscription — create or update subscription
 *   body: { email: string, isEnabled?: boolean }
 *
 * Uses the existing cookie-based user identity (omterminal_uid).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/userId';
import { getEmailSubscription, upsertEmailSubscription } from '@/db/queries';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ subscription: null });
  }

  try {
    const sub = await getEmailSubscription(userId);
    return NextResponse.json({ subscription: sub });
  } catch {
    return NextResponse.json({ subscription: null });
  }
}

export async function POST(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json(
      { error: 'User identity required. Please refresh the page.' },
      { status: 401 },
    );
  }

  let email: string;
  let isEnabled: boolean;
  try {
    const body = await request.json();
    email = (body.email || '').trim().toLowerCase();
    isEnabled = body.isEnabled !== false;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  }

  try {
    await upsertEmailSubscription(userId, email, isEnabled);
    const sub = await getEmailSubscription(userId);
    return NextResponse.json({ ok: true, subscription: sub });
  } catch (err) {
    console.error('[email-subscription] Error:', err);
    return NextResponse.json({ error: 'Failed to save subscription.' }, { status: 500 });
  }
}
