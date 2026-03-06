import { notFound } from 'next/navigation';
import Link from 'next/link';
import { MODELS } from '@/lib/data/models';

import type { Metadata } from 'next';

/** Static generation: pre-render all model detail pages at build time */
export function generateStaticParams() {
  return MODELS.map((m) => ({ slug: m.id }));
}

export function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return params.then(({ slug }) => {
    const model = MODELS.find((m) => m.id === slug);
    if (!model) return { title: 'Not Found' };
    return {
      title: `${model.name} — OM Terminal`,
      description: model.summary,
    };
  });
}

export const revalidate = 300;

export default async function ModelDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const model = MODELS.find((m) => m.id === slug);
  if (!model) notFound();

  const TYPE_COLOR: Record<string, string> = {
    proprietary: 'var(--indigo-l)',
    'open-weight': 'var(--amber-l)',
    'open-source': 'var(--emerald-l)',
  };

  return (
    <div className="page-enter">
      <div style={{ marginBottom: 16 }}>
        <Link href="/models" style={{ fontFamily: 'var(--fm)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--text3)', textDecoration: 'none' }}>
          ← Back to Models
        </Link>
      </div>

      <div className="hero" style={{ padding: '36px 40px', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: 'var(--glass2)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
          }}>{model.icon}</div>
          <div>
            <h1 style={{ fontFamily: 'var(--fd)', fontSize: 32, fontStyle: 'italic', color: 'var(--text)', letterSpacing: '-0.02em' }}>
              {model.name}
            </h1>
            <div style={{ fontFamily: 'var(--fm)', fontSize: 11, color: 'var(--text2)' }}>{model.company}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const, marginBottom: 24 }}>
          <span style={{
            fontFamily: 'var(--fm)', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const,
            padding: '3px 10px', borderRadius: 20, border: '1px solid', color: TYPE_COLOR[model.type] || 'var(--text2)',
            borderColor: `${TYPE_COLOR[model.type] || 'var(--text2)'}40`,
            background: `${TYPE_COLOR[model.type] || 'var(--text2)'}15`,
          }}>{model.type}</span>
          <span style={{
            fontFamily: 'var(--fm)', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const,
            padding: '3px 10px', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--glass)',
            color: 'var(--text2)',
          }}>{model.contextWindow} context</span>
          <span style={{
            fontFamily: 'var(--fm)', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const,
            padding: '3px 10px', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--glass)',
            color: 'var(--text2)',
          }}>{model.releaseDate}</span>
        </div>

        <p style={{ fontSize: 16, color: 'var(--text2)', lineHeight: 1.8, maxWidth: 640 }}>
          {model.summary}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        <div className="stat" style={{ '--sc': 'rgba(79,70,229,0.4)', '--sv': 'var(--indigo-l)' } as React.CSSProperties}>
          <div className="stat-n">{model.contextWindow}</div>
          <div className="stat-l">Context Window</div>
        </div>
        <div className="stat" style={{ '--sc': 'rgba(6,182,212,0.4)', '--sv': 'var(--cyan-l)' } as React.CSSProperties}>
          <div className="stat-n">{model.releaseDate}</div>
          <div className="stat-l">Release Date</div>
        </div>
        <div className="stat" style={{ '--sc': 'rgba(217,119,6,0.4)', '--sv': 'var(--amber-l)' } as React.CSSProperties}>
          <div className="stat-n" style={{ fontSize: 20 }}>{model.keyCapability}</div>
          <div className="stat-l">Key Capability</div>
        </div>
      </div>
    </div>
  );
}
