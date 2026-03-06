/**
 * /api/subscribe — Add email to Resend audience
 *
 * Called by the email capture modal in index.html.
 * Replaces the Google Apps Script webhook.
 *
 * Environment variables required:
 *   RESEND_KEY       — Resend.com API key
 *   RESEND_AUDIENCE  — Resend audience ID
 */

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const resendKey  = process.env.RESEND_KEY;
  const audienceId = process.env.RESEND_AUDIENCE;

  if (!resendKey || !audienceId) {
    // Silently succeed — don't break the UI if not configured yet
    return json({ ok: true });
  }

  let email = '';
  try {
    const body = await req.json();
    email = (body.email || '').trim().toLowerCase();
  } catch {
    return json({ error: 'Invalid body' }, 400);
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Invalid email' }, 400);
  }

  try {
    const res = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        unsubscribed: false,
        data: { source: 'omterminal-waitlist', joined: new Date().toISOString() },
      }),
    });

    // 409 = already subscribed — treat as success
    if (res.ok || res.status === 409) {
      return json({ ok: true });
    }

    const err = await res.json().catch(() => ({}));
    console.error('Resend subscribe error:', err);
    return json({ ok: true }); // Don't expose errors to client
  } catch (err) {
    console.error('subscribe handler:', err);
    return json({ ok: true }); // Fail silently — UX must not break
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
