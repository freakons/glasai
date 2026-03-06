/**
 * /api/digest — Weekly AI Intelligence Digest
 *
 * Triggered by Vercel cron (every Friday 09:00 UTC — see vercel.json).
 * Can also be triggered manually: GET /api/digest?secret=CRON_SECRET
 *
 * Environment variables required (Vercel dashboard):
 *   RESEND_KEY        — Resend.com API key (free tier: 3K emails/month)
 *   RESEND_AUDIENCE   — Resend audience ID (for subscriber list)
 *   CRON_SECRET       — Random string to protect manual triggers
 *   DIGEST_FROM       — Sender address, e.g. "OM Terminal <digest@omterminal.com>"
 *   GNEWS_KEY         — Same key used by /api/news
 *
 * Setup:
 *   1. Create account at resend.com
 *   2. Add & verify your sending domain
 *   3. Create an Audience — copy the Audience ID to RESEND_AUDIENCE
 *   4. Add all env vars to Vercel dashboard
 */

export const config = { runtime: 'edge' };

const RESEND_API = 'https://api.resend.com';

export default async function handler(req) {
  // Auth — cron requests from Vercel carry the secret in the header
  const cronSecret = req.headers.get('x-vercel-cron-secret') || '';
  const querySecret = new URL(req.url).searchParams.get('secret') || '';
  const expected = process.env.CRON_SECRET || '';

  if (expected && cronSecret !== expected && querySecret !== expected) {
    return new Response('Unauthorized', { status: 401 });
  }

  const resendKey = process.env.RESEND_KEY;
  const audienceId = process.env.RESEND_AUDIENCE;
  const from = process.env.DIGEST_FROM || 'OM Terminal <digest@omterminal.com>';

  if (!resendKey || !audienceId) {
    console.error('Missing RESEND_KEY or RESEND_AUDIENCE');
    return new Response(JSON.stringify({ error: 'Not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // 1. Fetch latest stories from our own news endpoint
    const baseUrl = req.headers.get('x-forwarded-host')
      ? `https://${req.headers.get('x-forwarded-host')}`
      : 'https://omterminal.com';

    const newsRes = await fetch(`${baseUrl}/api/news?q=artificial+intelligence&max=20`);
    const { articles = [] } = newsRes.ok ? await newsRes.json() : {};

    // 2. Pick best story per category
    const picks = selectStories(articles);

    if (Object.keys(picks).length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'No stories' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. Fetch subscriber list from Resend
    const contacts = await getContacts(resendKey, audienceId);
    if (contacts.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'No subscribers' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 4. Build email
    const subject = buildSubject(picks);
    const html    = buildHtml(picks);

    // 5. Send — batch max 50 per Resend free tier
    const batch = contacts.slice(0, 50).map(c => ({
      from,
      to: [c.email],
      subject,
      html,
      tags: [{ name: 'type', value: 'weekly-digest' }],
    }));

    let sent = 0;
    for (const msg of batch) {
      const r = await fetch(`${RESEND_API}/emails`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(msg),
      });
      if (r.ok) sent++;
    }

    console.log(`Digest sent to ${sent}/${contacts.length} subscribers`);
    return new Response(JSON.stringify({ ok: true, sent, total: contacts.length }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('digest error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}

/* ── Pick one top story per category ── */
function selectStories(articles) {
  const priority = ['regulation', 'models', 'funding', 'agents', 'research', 'product'];
  const picks = {};
  for (const cat of priority) {
    const match = articles.find(a => a.cat === cat && !Object.values(picks).includes(a));
    if (match) picks[cat] = match;
    if (Object.keys(picks).length >= 5) break;
  }
  return picks;
}

/* ── Email subject line ── */
function buildSubject(picks) {
  const week = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const lead = Object.values(picks)[0];
  return `OM Terminal Weekly · ${lead ? truncate(lead.title, 55) : 'AI Intelligence Digest'} · ${week}`;
}

/* ── HTML email template ── */
function buildHtml(picks) {
  const catLabel = {
    regulation: '⚖️ Regulation',
    models:     '🤖 Models',
    funding:    '💰 Funding',
    agents:     '⚡ Agents',
    research:   '🔬 Research',
    product:    '📦 Product',
  };
  const catColor = {
    regulation: '#fb7185', models: '#818cf8', funding: '#fbbf24',
    agents: '#67e8f9', research: '#38bdf8', product: '#34d399',
  };

  const stories = Object.entries(picks).map(([cat, a]) => `
    <tr>
      <td style="padding:24px 0;border-bottom:1px solid #1e1e30;">
        <div style="margin-bottom:8px;">
          <span style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;
            color:${catColor[cat]||'#818cf8'};background:${catColor[cat]||'#818cf8'}18;
            border:1px solid ${catColor[cat]||'#818cf8'}30;border-radius:20px;padding:2px 10px;">
            ${catLabel[cat] || cat}
          </span>
        </div>
        <h2 style="margin:0 0 8px;font-family:Georgia,serif;font-size:18px;font-style:italic;
          font-weight:400;color:#eeeef8;letter-spacing:-0.02em;line-height:1.35;">
          <a href="${a.sourceUrl||'https://omterminal.com'}" style="color:#eeeef8;text-decoration:none;">${escHtml(a.title)}</a>
        </h2>
        <p style="margin:0 0 10px;font-size:13.5px;color:#8888a8;line-height:1.7;">
          ${escHtml(truncate(a.body, 200))}
        </p>
        <a href="${a.sourceUrl||'https://omterminal.com'}"
          style="font-family:monospace;font-size:10.5px;letter-spacing:0.06em;text-transform:uppercase;
            color:#818cf8;text-decoration:none;">
          Read full story →
        </a>
      </td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>OM Terminal Weekly Intelligence Digest</title></head>
<body style="margin:0;padding:0;background:#05050f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#05050f;padding:40px 20px;">
    <tr><td>
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;">

        <!-- Header -->
        <tr><td style="padding-bottom:32px;border-bottom:1px solid #1e1e30;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td>
              <div style="display:inline-flex;align-items:center;gap:10px;">
                <div style="width:32px;height:32px;border-radius:8px;
                  background:linear-gradient(135deg,#4f46e5,#06b6d4);
                  display:inline-block;text-align:center;line-height:32px;
                  font-family:Georgia,serif;font-size:11px;font-weight:900;color:#fff;">OM</div>
                <span style="font-family:Georgia,serif;font-size:22px;font-style:italic;
                  color:#818cf8;letter-spacing:-0.02em;">OM Terminal</span>
              </div>
              <div style="font-family:monospace;font-size:9px;letter-spacing:0.16em;
                text-transform:uppercase;color:#44445a;margin-top:4px;">
                AI INTELLIGENCE DIGEST · WEEKLY
              </div>
            </td>
            <td style="text-align:right;vertical-align:top;">
              <span style="font-family:monospace;font-size:10px;color:#44445a;">
                ${new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}
              </span>
            </td>
          </tr></table>
        </td></tr>

        <!-- Intro -->
        <tr><td style="padding:28px 0 4px;">
          <p style="margin:0;font-size:14px;color:#8888a8;line-height:1.7;">
            Your weekly briefing on AI regulation, model releases, and funding —
            structured and verified. <strong style="color:#eeeef8;">${Object.keys(picks).length} signals</strong> this week.
          </p>
        </td></tr>

        <!-- Stories -->
        <tr><td><table width="100%" cellpadding="0" cellspacing="0">${stories}</table></td></tr>

        <!-- Footer -->
        <tr><td style="padding-top:32px;border-top:1px solid #1e1e30;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td>
              <a href="https://omterminal.com" style="font-family:Georgia,serif;font-size:13px;
                font-style:italic;color:#818cf8;text-decoration:none;">OM Terminal</a>
              <div style="font-family:monospace;font-size:9px;color:#44445a;margin-top:3px;letter-spacing:0.06em;">
                AI Intelligence Terminal · Regulation · Models · Funding · Policy
              </div>
            </td>
            <td style="text-align:right;font-family:monospace;font-size:9px;color:#44445a;">
              <a href="https://omterminal.com/unsubscribe" style="color:#44445a;">Unsubscribe</a>
            </td>
          </tr></table>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}

/* ── Fetch contacts from Resend audience ── */
async function getContacts(key, audienceId) {
  try {
    const res = await fetch(`${RESEND_API}/audiences/${audienceId}/contacts`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || []).filter(c => !c.unsubscribed);
  } catch {
    return [];
  }
}

/* ── Helpers ── */
function truncate(s, n) { return s && s.length > n ? s.slice(0, n - 1) + '…' : (s || ''); }
function escHtml(s) {
  return String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
