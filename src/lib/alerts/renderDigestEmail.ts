/**
 * Omterminal — Daily Intelligence Digest Email Renderer
 *
 * Generates a professional, calm intelligence brief email.
 * Includes two sections:
 *   1. "Your watched entities" — personal alerts for the user's watchlist
 *   2. "Platform intelligence" — top platform-wide alerts
 *
 * The design follows Omterminal's dark-theme brand: #05050f background,
 * indigo accents, monospace labels, and serif-italic headings.
 */

import type { AlertRecord } from '@/db/queries';
import { escapeHtml, truncate } from '@/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface DigestEmailInput {
  personalAlerts: AlertRecord[];
  platformAlerts: AlertRecord[];
  baseUrl?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Alert type labels & colors
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  watched_entity_high_impact: { label: 'High Impact', color: '#fb7185' },
  watched_entity_rising:      { label: 'Momentum',    color: '#fbbf24' },
  watched_entity_trend:       { label: 'Trend',       color: '#a78bfa' },
  signal_high_impact:         { label: 'High Impact', color: '#fb7185' },
  signal_rising_momentum:     { label: 'Momentum',    color: '#fbbf24' },
  trend_detected:             { label: 'Trend',       color: '#a78bfa' },
  trend_rising:               { label: 'Rising',      color: '#fbbf24' },
};

const PRIORITY_LABEL: Record<number, string> = {
  2: 'HIGH',
  1: 'MED',
  0: 'LOW',
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function alertRow(alert: AlertRecord, baseUrl: string): string {
  const config = TYPE_CONFIG[alert.type] ?? { label: alert.type, color: '#818cf8' };
  const priority = PRIORITY_LABEL[alert.priority] ?? '';
  const detailUrl = alert.signalId
    ? `${baseUrl}/signals/${encodeURIComponent(alert.signalId)}`
    : alert.trendId
      ? `${baseUrl}/trends`
      : baseUrl;

  return `
    <tr>
      <td style="padding:16px 0;border-bottom:1px solid #1e1e30;">
        <div style="margin-bottom:6px;">
          <span style="font-family:monospace;font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${config.color};background:${config.color}18;border:1px solid ${config.color}30;border-radius:20px;padding:2px 10px;">${config.label}</span>
          ${priority ? `<span style="font-family:monospace;font-size:9px;letter-spacing:0.1em;color:#44445a;margin-left:8px;">${priority}</span>` : ''}
          ${alert.entityName ? `<span style="font-family:monospace;font-size:9px;letter-spacing:0.08em;color:#44445a;margin-left:8px;">${escapeHtml(alert.entityName)}</span>` : ''}
        </div>
        <div style="font-family:Georgia,serif;font-size:15px;font-style:italic;color:#eeeef8;letter-spacing:-0.01em;line-height:1.4;margin-bottom:4px;">
          <a href="${detailUrl}" style="color:#eeeef8;text-decoration:none;">${escapeHtml(alert.title)}</a>
        </div>
        <div style="font-size:12.5px;color:#8888a8;line-height:1.6;">${escapeHtml(truncate(alert.message, 180))}</div>
      </td>
    </tr>`;
}

function sectionHeader(title: string, count: number): string {
  return `
    <tr>
      <td style="padding:24px 0 10px;">
        <div style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#6366f1;">${escapeHtml(title)} · ${count}</div>
      </td>
    </tr>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main renderer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render the daily intelligence digest as an HTML email string.
 * Returns null if there are no alerts to include.
 */
export function renderDigestEmail(input: DigestEmailInput): string | null {
  const { personalAlerts, platformAlerts, baseUrl = 'https://omterminal.com' } = input;

  if (personalAlerts.length === 0 && platformAlerts.length === 0) {
    return null;
  }

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const personalSection = personalAlerts.length > 0
    ? `${sectionHeader('Your Watched Entities', personalAlerts.length)}
       ${personalAlerts.map((a) => alertRow(a, baseUrl)).join('')}`
    : '';

  const platformSection = platformAlerts.length > 0
    ? `${sectionHeader('Platform Intelligence', platformAlerts.length)}
       ${platformAlerts.map((a) => alertRow(a, baseUrl)).join('')}`
    : '';

  const totalAlerts = personalAlerts.length + platformAlerts.length;
  const introText = personalAlerts.length > 0
    ? `Your daily intelligence brief is ready. <strong style="color:#eeeef8;">${totalAlerts} alert${totalAlerts > 1 ? 's' : ''}</strong> across your watched entities and platform intelligence.`
    : `Your daily intelligence brief is ready. <strong style="color:#eeeef8;">${totalAlerts} alert${totalAlerts > 1 ? 's' : ''}</strong> from platform intelligence.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>OM Terminal · Daily Intelligence Digest</title>
</head>
<body style="margin:0;padding:0;background:#05050f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#05050f;padding:40px 20px;">
    <tr>
      <td>
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;">

          <!-- Header -->
          <tr>
            <td style="padding-bottom:28px;border-bottom:1px solid #1e1e30;">
              <div style="font-family:Georgia,serif;font-size:22px;font-style:italic;color:#818cf8;letter-spacing:-0.02em;">OM Terminal</div>
              <div style="font-family:monospace;font-size:9px;letter-spacing:0.16em;text-transform:uppercase;color:#44445a;margin-top:4px;">DAILY INTELLIGENCE DIGEST · ${escapeHtml(today.toUpperCase())}</div>
            </td>
          </tr>

          <!-- Intro -->
          <tr>
            <td style="padding:24px 0 4px;">
              <p style="margin:0;font-size:14px;color:#8888a8;line-height:1.7;">${introText}</p>
            </td>
          </tr>

          <!-- Personal alerts -->
          <tr>
            <td>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${personalSection}
              </table>
            </td>
          </tr>

          <!-- Platform alerts -->
          <tr>
            <td>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${platformSection}
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:28px 0 0;">
              <a href="${baseUrl}" style="display:inline-block;padding:10px 24px;border-radius:10px;background:#6366f1;color:#fff;font-family:monospace;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;">Open OM Terminal</a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:32px;border-top:1px solid #1e1e30;margin-top:32px;">
              <p style="margin:0;font-size:11px;color:#44445a;line-height:1.7;">
                You receive this because you enabled daily digests on
                <a href="${baseUrl}" style="color:#818cf8;text-decoration:none;">OM Terminal</a>.
                Visit your <a href="${baseUrl}/watchlist" style="color:#818cf8;text-decoration:none;">watchlist</a> to pause or disable.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Build a concise subject line for the daily digest.
 */
export function buildDigestSubject(
  personalAlerts: AlertRecord[],
  platformAlerts: AlertRecord[],
): string {
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const total = personalAlerts.length + platformAlerts.length;

  // Lead with the highest-priority alert title if available
  const lead = personalAlerts[0] ?? platformAlerts[0];
  if (lead) {
    return `OM Terminal Daily · ${truncate(lead.title, 50)} · ${today}`;
  }

  return `OM Terminal Daily · ${total} alert${total !== 1 ? 's' : ''} · ${today}`;
}
