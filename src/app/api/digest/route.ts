import { NextRequest, NextResponse } from 'next/server';
import { escapeHtml, truncate } from '@/utils';

export const runtime = 'edge';

const RESEND_API = 'https://api.resend.com';

export async function GET(req: NextRequest) {
  const cronSecret = req.headers.get('x-vercel-cron-secret') || '';
  const querySecret = new URL(req.url).searchParams.get('secret') || '';
  const expected = process.env.CRON_SECRET || '';

  if (expected && cronSecret !== expected && querySecret !== expected) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const resendKey = process.env.RESEND_KEY;
  const audienceId = process.env.RESEND_AUDIENCE;
  const from = process.env.DIGEST_FROM || 'OM Terminal <digest@omterminal.com>';

  if (!resendKey || !audienceId) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }

  try {
    const baseUrl = req.headers.get('x-forwarded-host')
      ? `https://${req.headers.get('x-forwarded-host')}`
      : 'https://omterminal.com';

    const newsRes = await fetch(`${baseUrl}/api/news?q=artificial+intelligence&max=20`);
    const { articles = [] } = newsRes.ok ? await newsRes.json() : {};

    const picks = selectStories(articles);
    if (Object.keys(picks).length === 0) {
      return NextResponse.json({ ok: true, sent: 0, reason: 'No stories' });
    }

    const contacts = await getContacts(resendKey, audienceId);
    if (contacts.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, reason: 'No subscribers' });
    }

    const subject = buildSubject(picks);
    const html = buildHtml(picks);

    const batch = contacts.slice(0, 50).map((c: { email: string }) => ({
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

    return NextResponse.json({ ok: true, sent, total: contacts.length });
  } catch (err) {
    console.error('digest error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

interface DigestArticle {
  cat: string;
  title: string;
  body: string;
  sourceUrl?: string;
}

function selectStories(articles: DigestArticle[]) {
  const priority = ['regulation', 'models', 'funding', 'agents', 'research', 'product'];
  const picks: Record<string, DigestArticle> = {};
  for (const cat of priority) {
    const match = articles.find((a: DigestArticle) => a.cat === cat && !Object.values(picks).includes(a));
    if (match) picks[cat] = match;
    if (Object.keys(picks).length >= 5) break;
  }
  return picks;
}

function buildSubject(picks: Record<string, DigestArticle>) {
  const week = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const lead = Object.values(picks)[0];
  return `OM Terminal Weekly · ${lead ? truncate(lead.title, 55) : 'AI Intelligence Digest'} · ${week}`;
}

function buildHtml(picks: Record<string, DigestArticle>) {
  const catLabel: Record<string, string> = { regulation: '⚖️ Regulation', models: '🤖 Models', funding: '💰 Funding', agents: '⚡ Agents', research: '🔬 Research', product: '📦 Product' };
  const catColor: Record<string, string> = { regulation: '#fb7185', models: '#818cf8', funding: '#fbbf24', agents: '#67e8f9', research: '#38bdf8', product: '#34d399' };

  const stories = Object.entries(picks).map(([cat, a]) => `
    <tr><td style="padding:24px 0;border-bottom:1px solid #1e1e30;">
      <div style="margin-bottom:8px;"><span style="font-family:monospace;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${catColor[cat]||'#818cf8'};background:${catColor[cat]||'#818cf8'}18;border:1px solid ${catColor[cat]||'#818cf8'}30;border-radius:20px;padding:2px 10px;">${catLabel[cat]||cat}</span></div>
      <h2 style="margin:0 0 8px;font-family:Georgia,serif;font-size:18px;font-style:italic;font-weight:400;color:#eeeef8;letter-spacing:-0.02em;line-height:1.35;"><a href="${a.sourceUrl||'https://omterminal.com'}" style="color:#eeeef8;text-decoration:none;">${escapeHtml(a.title)}</a></h2>
      <p style="margin:0 0 10px;font-size:13.5px;color:#8888a8;line-height:1.7;">${escapeHtml(truncate(a.body, 200))}</p>
      <a href="${a.sourceUrl||'https://omterminal.com'}" style="font-family:monospace;font-size:10.5px;letter-spacing:0.06em;text-transform:uppercase;color:#818cf8;text-decoration:none;">Read full story →</a>
    </td></tr>`).join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>OM Terminal Weekly Intelligence Digest</title></head><body style="margin:0;padding:0;background:#05050f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#05050f;padding:40px 20px;"><tr><td><table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;"><tr><td style="padding-bottom:32px;border-bottom:1px solid #1e1e30;"><div style="font-family:Georgia,serif;font-size:22px;font-style:italic;color:#818cf8;letter-spacing:-0.02em;">OM Terminal</div><div style="font-family:monospace;font-size:9px;letter-spacing:0.16em;text-transform:uppercase;color:#44445a;margin-top:4px;">AI INTELLIGENCE DIGEST · WEEKLY</div></td></tr><tr><td style="padding:28px 0 4px;"><p style="margin:0;font-size:14px;color:#8888a8;line-height:1.7;">Your weekly briefing on AI regulation, model releases, and funding. <strong style="color:#eeeef8;">${Object.keys(picks).length} signals</strong> this week.</p></td></tr><tr><td><table width="100%" cellpadding="0" cellspacing="0">${stories}</table></td></tr><tr><td style="padding-top:32px;border-top:1px solid #1e1e30;"><a href="https://omterminal.com" style="font-family:Georgia,serif;font-size:13px;font-style:italic;color:#818cf8;text-decoration:none;">OM Terminal</a></td></tr></table></td></tr></table></body></html>`;
}

async function getContacts(key: string, audienceId: string) {
  try {
    const res = await fetch(`${RESEND_API}/audiences/${audienceId}/contacts`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || []).filter((c: { unsubscribed?: boolean }) => !c.unsubscribed);
  } catch {
    return [];
  }
}
