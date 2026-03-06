import { notFound } from 'next/navigation';
import Link from 'next/link';
import { FUNDING_ROUNDS } from '@/lib/data/funding';

import type { Metadata } from 'next';

export function generateStaticParams() {
  return FUNDING_ROUNDS.map((f) => ({ slug: f.id }));
}

export function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return params.then(({ slug }) => {
    const round = FUNDING_ROUNDS.find((f) => f.id === slug);
    if (!round) return { title: 'Not Found' };
    return {
      title: `${round.company} ${round.amount} ${round.round} — OM Terminal`,
      description: round.summary,
    };
  });
}

export const revalidate = 300;

export default async function FundingDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const round = FUNDING_ROUNDS.find((f) => f.id === slug);
  if (!round) notFound();

  return (
    <div className="page-enter">
      <div style={{ marginBottom: 16 }}>
        <Link href="/funding" style={{ fontFamily: 'var(--fm)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--text3)', textDecoration: 'none' }}>
          ← Back to Funding
        </Link>
      </div>

      <div className="hero" style={{ padding: '36px 40px', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: 'var(--glass2)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
          }}>{round.icon}</div>
          <div>
            <h1 style={{ fontFamily: 'var(--fd)', fontSize: 30, fontStyle: 'italic', color: 'var(--text)', letterSpacing: '-0.02em' }}>
              {round.company} — {round.amount}
            </h1>
            <div style={{ fontFamily: 'var(--fm)', fontSize: 11, color: 'var(--text2)' }}>{round.round} · {round.date}</div>
          </div>
        </div>

        <p style={{ fontSize: 16, color: 'var(--text2)', lineHeight: 1.8, maxWidth: 640, marginBottom: 28 }}>
          {round.summary}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          <div className="stat" style={{ '--sc': 'rgba(217,119,6,0.4)', '--sv': 'var(--amber-l)' } as React.CSSProperties}>
            <div className="stat-n">{round.amount}</div>
            <div className="stat-l">Amount Raised</div>
          </div>
          <div className="stat" style={{ '--sc': 'rgba(79,70,229,0.4)', '--sv': 'var(--indigo-l)' } as React.CSSProperties}>
            <div className="stat-n">{round.valuation}</div>
            <div className="stat-l">Valuation</div>
          </div>
          <div className="stat" style={{ '--sc': 'rgba(6,182,212,0.4)', '--sv': 'var(--cyan-l)' } as React.CSSProperties}>
            <div className="stat-n" style={{ fontSize: 22 }}>{round.round}</div>
            <div className="stat-l">Round</div>
          </div>
        </div>
      </div>

      <div style={{
        padding: '20px 24px', borderRadius: 'var(--r)',
        background: 'var(--glass)', border: '1px solid var(--border)',
      }}>
        <div style={{ fontFamily: 'var(--fm)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--text3)', marginBottom: 12 }}>
          Key Investors
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
          {round.investors.map((inv) => (
            <span key={inv} style={{
              fontFamily: 'var(--fm)', fontSize: 11, padding: '5px 14px', borderRadius: 20,
              border: '1px solid var(--border2)', background: 'var(--glass)', color: 'var(--text2)',
            }}>
              {inv}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
