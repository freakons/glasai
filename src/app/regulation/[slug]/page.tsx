import { notFound } from 'next/navigation';
import Link from 'next/link';
import { REGULATIONS } from '@/lib/data/regulations';

import type { Metadata } from 'next';

export function generateStaticParams() {
  return REGULATIONS.map((r) => ({ slug: r.id }));
}

export function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return params.then(({ slug }) => {
    const reg = REGULATIONS.find((r) => r.id === slug);
    if (!reg) return { title: 'Not Found' };
    return {
      title: `${reg.title} — OM Terminal`,
      description: reg.summary,
    };
  });
}

export const revalidate = 300;

export default async function RegulationDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const reg = REGULATIONS.find((r) => r.id === slug);
  if (!reg) notFound();

  const STATUS_COLOR: Record<string, string> = {
    active: 'var(--emerald-l)',
    pending: 'var(--amber-l)',
    passed: 'var(--sky-l)',
  };

  const TYPE_COLOR: Record<string, string> = {
    law: 'var(--rose-l)',
    bill: 'var(--amber-l)',
    exec: 'var(--violet-l)',
    policy: 'var(--sky-l)',
    report: 'var(--emerald-l)',
  };

  return (
    <div className="page-enter">
      <div style={{ marginBottom: 16 }}>
        <Link href="/regulation" style={{ fontFamily: 'var(--fm)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--text3)', textDecoration: 'none' }}>
          ← Back to Regulation
        </Link>
      </div>

      <div className="hero" style={{ padding: '36px 40px', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <span style={{ fontSize: 32 }}>{reg.flag}</span>
          <div>
            <h1 style={{ fontFamily: 'var(--fd)', fontSize: 30, fontStyle: 'italic', color: 'var(--text)', letterSpacing: '-0.02em' }}>
              {reg.title}
            </h1>
            <div style={{ fontFamily: 'var(--fm)', fontSize: 11, color: 'var(--text2)' }}>{reg.country} · {reg.date}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
          <span style={{
            fontFamily: 'var(--fm)', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const,
            padding: '3px 10px', borderRadius: 20, border: '1px solid',
            color: TYPE_COLOR[reg.type], borderColor: `${TYPE_COLOR[reg.type]}40`, background: `${TYPE_COLOR[reg.type]}15`,
          }}>{reg.type}</span>
          <span style={{
            fontFamily: 'var(--fm)', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const,
            padding: '3px 10px', borderRadius: 20, border: '1px solid',
            color: STATUS_COLOR[reg.status], borderColor: `${STATUS_COLOR[reg.status]}40`, background: `${STATUS_COLOR[reg.status]}15`,
          }}>{reg.status}</span>
        </div>

        <p style={{ fontSize: 16, color: 'var(--text2)', lineHeight: 1.8, maxWidth: 640, marginBottom: 24 }}>
          {reg.summary}
        </p>

        <div style={{
          padding: '18px 20px', borderRadius: 'var(--rs)',
          background: 'linear-gradient(135deg, rgba(225,29,72,0.08), rgba(217,119,6,0.05))',
          border: '1px solid rgba(225,29,72,0.15)',
        }}>
          <div style={{ fontFamily: 'var(--fm)', fontSize: 8.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: 'var(--rose-l)', marginBottom: 6 }}>
            Impact Assessment
          </div>
          <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.75 }}>
            {reg.impact}
          </p>
        </div>
      </div>
    </div>
  );
}
