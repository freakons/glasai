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
 * Query params (all require CRON_SECRET auth):
 *   ?dry_run=true   — preview what would be sent without actually sending or
 *                      recording sends. Returns per-user alert counts and
 *                      subject lines. Safe to call repeatedly.
 *   ?user_id=<id>   — restrict processing to a single user (by cookie UID).
 *                      Useful for testing one subscriber before launching to all.
 *                      Combines with dry_run for full safety.
 *
 * Behavior:
 *   1. Collects all enabled email subscriptions (or single user if ?user_id)
 *   2. For each user, checks if a digest was already sent today
 *   3. Fetches personal + platform alerts from the last 24 hours
 *   4. Renders and sends the digest email via Resend (unless dry_run)
 *   5. Records the send to prevent duplicates (unless dry_run)
 *
 * Safe fallbacks:
 *   - If RESEND_KEY is missing, returns a graceful "not configured" response
 *   - If a user has no alerts, skips them
 *   - If already sent today, skips the user
 *   - Never crashes the job for one bad subscription/email
 *
 * ── Developer testing guide ──────────────────────────────────────────────────
 *
 * Required env vars:
 *   CRON_SECRET    — auth secret for cron/manual invocation
 *   RESEND_KEY     — Resend API key for email delivery
 *   DIGEST_FROM    — (optional) sender address, defaults to OM Terminal <digest@omterminal.com>
 *
 * Manual invocation examples:
 *   # Full dry run — see what would be sent to all subscribers
 *   curl "https://omterminal.com/api/alerts/send-digest?secret=$CRON_SECRET&dry_run=true"
 *
 *   # Dry run for one user — verify a specific subscriber's digest
 *   curl "https://omterminal.com/api/alerts/send-digest?secret=$CRON_SECRET&dry_run=true&user_id=<uid>"
 *
 *   # Live send for one user — test actual delivery before launching to all
 *   curl "https://omterminal.com/api/alerts/send-digest?secret=$CRON_SECRET&user_id=<uid>"
 *
 *   # Production run — Vercel cron calls this daily at 7:00 UTC
 *   (no query params needed — cron sends Authorization: Bearer header)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getEnabledEmailSubscriptions,
  getDigestAlertsForUser,
  getTopPlatformDigestAlerts,
  hasDigestBeenSent,
  recordDigestSend,
  getEmailSubscription,
} from '@/db/queries';
import { renderDigestEmail, buildDigestSubject } from '@/lib/alerts/renderDigestEmail';

export const runtime = 'nodejs';

const RESEND_API = 'https://api.resend.com/emails';

export async function GET(req: NextRequest) {
  const startMs = Date.now();

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
  const params = new URL(req.url).searchParams;
  const querySecret = params.get('secret') || '';

  if (bearerToken !== expected && querySecret !== expected) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 },
    );
  }

  // ── Parse mode flags ──────────────────────────────────────────────────
  const dryRun = params.get('dry_run') === 'true';
  const testUserId = params.get('user_id') || null;

  // ── Check Resend availability (not needed in dry-run) ─────────────────
  const resendKey = process.env.RESEND_KEY;
  if (!resendKey && !dryRun) {
    console.warn('[send-digest] RESEND_KEY not configured — skipping digest delivery');
    return NextResponse.json({
      ok: true,
      dryRun: false,
      total: 0,
      sent: 0,
      skippedNoAlerts: 0,
      skippedAlreadySent: 0,
      failed: 0,
      reason: 'RESEND_KEY not configured',
      durationMs: Date.now() - startMs,
    });
  }

  const from = process.env.DIGEST_FROM || 'OM Terminal <digest@omterminal.com>';
  const baseUrl = req.headers.get('x-forwarded-host')
    ? `https://${req.headers.get('x-forwarded-host')}`
    : 'https://omterminal.com';

  try {
    // ── Get subscribers ────────────────────────────────────────────────
    let subscriptions;

    if (testUserId) {
      // Single-user mode: look up this specific user
      const sub = await getEmailSubscription(testUserId);
      if (!sub) {
        return NextResponse.json({
          ok: false,
          error: 'No subscription found for the specified user_id',
          dryRun,
        }, { status: 404 });
      }
      if (!sub.isEnabled) {
        return NextResponse.json({
          ok: false,
          error: 'Subscription exists but is disabled for the specified user_id',
          dryRun,
        }, { status: 404 });
      }
      subscriptions = [sub];
    } else {
      subscriptions = await getEnabledEmailSubscriptions();
    }

    if (subscriptions.length === 0) {
      console.log('[send-digest] No enabled subscribers — nothing to send');
      return NextResponse.json({
        ok: true,
        dryRun,
        total: 0,
        sent: 0,
        skippedNoAlerts: 0,
        skippedAlreadySent: 0,
        failed: 0,
        durationMs: Date.now() - startMs,
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

    // In dry-run mode, collect preview details per user (without exposing emails)
    const previews: Array<{
      userId: string;
      personalAlertCount: number;
      platformAlertCount: number;
      subject: string;
      status: 'would_send' | 'skipped_no_alerts' | 'skipped_already_sent';
    }> = [];

    for (const sub of subscriptions) {
      try {
        // Dedup: skip if already sent today
        if (await hasDigestBeenSent(sub.userId, today)) {
          skippedAlreadySent++;
          if (dryRun) {
            previews.push({
              userId: sub.userId,
              personalAlertCount: 0,
              platformAlertCount: 0,
              subject: '',
              status: 'skipped_already_sent',
            });
          }
          continue;
        }

        // Fetch personal alerts for this user
        const personalAlerts = await getDigestAlertsForUser(sub.userId, since);

        // Skip users with no alerts at all
        if (personalAlerts.length === 0 && platformAlerts.length === 0) {
          skippedNoAlerts++;
          if (dryRun) {
            previews.push({
              userId: sub.userId,
              personalAlertCount: 0,
              platformAlertCount: 0,
              subject: '',
              status: 'skipped_no_alerts',
            });
          }
          continue;
        }

        // Render email
        const html = renderDigestEmail({ personalAlerts, platformAlerts, baseUrl });
        if (!html) {
          skippedNoAlerts++;
          if (dryRun) {
            previews.push({
              userId: sub.userId,
              personalAlertCount: personalAlerts.length,
              platformAlertCount: platformAlerts.length,
              subject: '',
              status: 'skipped_no_alerts',
            });
          }
          continue;
        }

        const subject = buildDigestSubject(personalAlerts, platformAlerts);

        if (dryRun) {
          // Dry-run: record what would be sent without sending or tracking
          sent++;
          previews.push({
            userId: sub.userId,
            personalAlertCount: personalAlerts.length,
            platformAlertCount: platformAlerts.length,
            subject,
            status: 'would_send',
          });
          continue;
        }

        // ── Live send via Resend ──────────────────────────────────────
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
          console.log(`[send-digest] Sent digest to user ${sub.userId} (${personalAlerts.length} personal, ${platformAlerts.length} platform alerts)`);
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

    const durationMs = Date.now() - startMs;

    const summary: Record<string, unknown> = {
      ok: true,
      dryRun,
      total: subscriptions.length,
      sent,
      skippedNoAlerts,
      skippedAlreadySent,
      failed,
      platformAlertCount: platformAlerts.length,
      durationMs,
    };

    if (dryRun) {
      summary.previews = previews;
    }

    console.log(`[send-digest] ${dryRun ? 'DRY RUN' : 'Digest run'} complete:`, JSON.stringify({
      ...summary,
      previews: undefined, // don't log full previews to console
    }));

    return NextResponse.json(summary);
  } catch (err) {
    console.error('[send-digest] Fatal error:', err);
    return NextResponse.json(
      { ok: false, error: 'Internal digest processing error', durationMs: Date.now() - startMs },
      { status: 500 },
    );
  }
}
