import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  const resendKey = process.env.RESEND_KEY;
  const audienceId = process.env.RESEND_AUDIENCE;

  if (!resendKey || !audienceId) {
    return NextResponse.json({ ok: true });
  }

  let email = '';
  try {
    const body = await req.json();
    email = (body.email || '').trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
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

    if (res.ok || res.status === 409) {
      return NextResponse.json({ ok: true });
    }

    const err = await res.json().catch(() => ({}));
    console.error('Resend subscribe error:', err);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('subscribe handler:', err);
    return NextResponse.json({ ok: true });
  }
}
