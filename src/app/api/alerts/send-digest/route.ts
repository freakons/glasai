/**
 * Omterminal — Daily Intelligence Digest Delivery
 *
 * GET /api/alerts/send-digest
 *
 * Protected cron endpoint that sends one digest email per enabled subscriber.
 * Designed to be called once per day via Vercel Cron.
 *
 * Auth:
 *   Accepts CRON_SECRET via Authorization: Bearer header (Vercel cron)
 *   or ?secret= query param (manual testing).
 *   Rejects all requests when CRON_SECRET is not configured.
 *
 * Behavior:
 *   1. Collects all enabled email subscriptions
 *   2. For each user, checks if a digest was already sent today
 *   3. Fetches personal + platform alerts from the last 24 hours
 *   4. Renders and sends the digest email via Resend
 *   5. Records the send to prevent duplicates
 *
 * Safe fallbacks:
 *   - If RESEND_KEY is missing, returns a graceful "not configured" response
 *   - If a user has no alerts, skips them
 *   - If already sent today, skips the user
 *   - Never crashes the job for one bad subscription/email
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getEnabledEmailSubscriptions,
  getDigestAlertsForUser,
  getTopPlatformDigestAlerts,
  hasDigestBeenSent,
  recordDigestSend,
} from '@/db/queries';
import { renderDigestEmail, buildDigestSubject } from '@/lib/alerts/renderDigestEmail';

export const runtime = 'nodejs';

const RESEND_API = 'https://api.resend.com/emails';

export async function GET(req: NextRequest) {
  // ── Auth: require CRON_SECRET ──────────────────────────────────────────
  const expected = process.env.CRON_SECRET ?? '';

  if (!expected) {
    console.error('[send-digest] CRON_SECRET is not configured — rejecting request');
    return NextResponse.json(
      { ok: false, error: 'Server misconfiguration' },
      { status: 500 },
    );
  }

  const authHeader = req.headers.get('authorization') || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const querySecret = new URL(req.url).searchParams.get('secret') || '';

  if (bearerToken !== expected && querySecret !== expected) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 },
    );
  }

  // ── Check Resend availability ────────────────────────────────────────
  const resendKey = process.env.RESEND_KEY;
  if (!resendKey) {
    console.warn('[send-digest] RESEND_KEY not configured — skipping digest delivery');
    return NextResponse.json({
      ok: true,
      sent: 0,
      skipped: 0,
      failed: 0,
      reason: 'RESEND_KEY not configured',
    });
  }

  const from = process.env.DIGEST_FROM || 'OM Terminal <digest@omterminal.com>';
  const baseUrl = req.headers.get('x-forwarded-host')
    ? `https://${req.headers.get('x-forwarded-host')}`
    : 'https://omterminal.com';

  try {
    // ── Get subscribers ────────────────────────────────────────────────
    const subscriptions = await getEnabledEmailSubscriptions();
    if (subscriptions.length === 0) {
      console.log('[send-digest] No enabled subscribers — nothing to send');
      return NextResponse.json({
        ok: true,
        total: 0,
        sent: 0,
        skippedNoAlerts: 0,
        skippedAlreadySent: 0,
        failed: 0,
      });
    }

    // ── Time window: last 24 hours ─────────────────────────────────────
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // ── Fetch platform alerts once (shared across all users) ──────────
    const platformAlerts = await getTopPlatformDigestAlerts(since, 15);

    let sent = 0;
    let skippedNoAlerts = 0;
    let skippedAlreadySent = 0;
    let failed = 0;

    for (const sub of subscriptions) {
      try {
        // Dedup: skip if already sent today
        if (await hasDigestBeenSent(sub.userId, today)) {
          skippedAlreadySent++;
          continue;
        }

        // Fetch personal alerts for this user
        const personalAlerts = await getDigestAlertsForUser(sub.userId, since);

        // Skip users with no alerts at all
        if (personalAlerts.length === 0 && platformAlerts.length === 0) {
          skippedNoAlerts++;
          continue;
        }

        // Render email
        const html = renderDigestEmail({ personalAlerts, platformAlerts, baseUrl });
        if (!html) {
          skippedNoAlerts++;
          continue;
        }

        const subject = buildDigestSubject(personalAlerts, platformAlerts);

        // Send via Resend
        const res = await fetch(RESEND_API, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from,
            to: [sub.email],
            subject,
            html,
            tags: [{ name: 'type', value: 'daily-digest' }],
          }),
        });

        if (res.ok) {
          await recordDigestSend(sub.userId, today);
          sent++;
        } else {
          const errBody = await res.text().catch(() => 'unknown');
          console.warn(`[send-digest] Resend API error for user ${sub.userId}: HTTP ${res.status} — ${errBody}`);
          failed++;
        }
      } catch (err) {
        console.warn(`[send-digest] Error processing user ${sub.userId}:`, err instanceof Error ? err.message : String(err));
        failed++;
      }
    }

    const summary = {
      ok: true,
      total: subscriptions.length,
      sent,
      skippedNoAlerts,
      skippedAlreadySent,
      failed,
    };

    console.log('[send-digest] Digest run complete:', JSON.stringify(summary));

    return NextResponse.json(summary);
  } catch (err) {
    console.error('[send-digest] Fatal error:', err);
    return NextResponse.json(
      { ok: false, error: 'Internal digest processing error' },
      { status: 500 },
    );
  }
}
