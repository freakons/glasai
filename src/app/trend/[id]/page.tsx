import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MOCK_SIGNALS } from '@/data/mockSignals';
import { clusterSignals } from '@/lib/signals/clusterSignals';
import { computeTrendEvolution } from '@/lib/trends/trendEvolution';
import { TrendEvolutionChart } from '@/components/intelligence/TrendEvolutionChart';
import { Badge } from '@/components/ui/Badge';

import type { Metadata } from 'next';

export const revalidate = 300;

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const GLASS_CARD: React.CSSProperties = {
  padding: '20px 24px',
  borderRadius: 'var(--r, 12px)',
  background: 'var(--glass)',
  border: '1px solid var(--border)',
};

const SECTION_HEADER: React.CSSProperties = {
  fontFamily: 'var(--fm)',
  fontSize: 9,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--text3)',
  marginBottom: 16,
};

const MOMENTUM_COLORS = {
  rising: { color: 'var(--emerald-l, #34d399)', bg: 'rgba(5,150,105,0.15)', symbol: '↑' },
  stable: { color: 'var(--text2)', bg: 'rgba(255,255,255,0.05)', symbol: '→' },
  cooling: { color: 'var(--sky-l, #38bdf8)', bg: 'rgba(14,165,233,0.15)', symbol: '↓' },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

interface TrendPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: TrendPageProps): Promise<Metadata> {
  const { id } = await params;
  const clusters = clusterSignals(MOCK_SIGNALS);
  const cluster = clusters.find((c) => c.id === id);
  return {
    title: cluster ? `${cluster.title} — Omterminal` : 'Trend — Omterminal',
  };
}

export default async function TrendPage({ params }: TrendPageProps) {
  const { id } = await params;
  const clusters = clusterSignals(MOCK_SIGNALS);
  const cluster = clusters.find((c) => c.id === id);

  if (!cluster) return notFound();

  const mc = MOMENTUM_COLORS[cluster.momentum];
  const evolution = computeTrendEvolution(cluster.signals);

  return (
    <>
      {/* Breadcrumb */}
      <div style={{ marginBottom: 16 }}>
        <Link
          href="/intelligence"
          style={{ fontSize: 12, color: 'var(--text2)', textDecoration: 'none' }}
        >
          ← Intelligence Feed
        </Link>
      </div>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <h1 style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--text)',
            fontFamily: 'var(--font-display, Georgia, serif)',
          }}>
            {cluster.title}
          </h1>
          <span
            style={{
              fontFamily: 'var(--fm)',
              fontSize: 10,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              padding: '3px 10px',
              borderRadius: 10,
              color: mc.color,
              background: mc.bg,
              whiteSpace: 'nowrap',
            }}
          >
            {mc.symbol} {cluster.momentum}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Badge category={cluster.category} />
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>
            {cluster.signalCount} signals · {cluster.entities.length} entities
          </span>
        </div>
      </div>

      {/* Summary */}
      <div style={{ ...GLASS_CARD, marginBottom: 20 }}>
        <div style={SECTION_HEADER}>Cluster Summary</div>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text)', lineHeight: 1.65 }}>
          {cluster.summary}
        </p>
      </div>

      {/* Trend Activity */}
      <div style={{ ...GLASS_CARD, marginBottom: 20 }}>
        <div style={SECTION_HEADER}>Trend Activity</div>
        <TrendEvolutionChart evolution={evolution} />
      </div>

      {/* Entities */}
      <div style={{ ...GLASS_CARD, marginBottom: 20 }}>
        <div style={SECTION_HEADER}>Entities Involved</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {cluster.entities.map((entity) => (
            <Link
              key={entity}
              href={`/entity/${encodeURIComponent(entity.toLowerCase().replace(/\s+/g, '_'))}`}
              style={{
                fontSize: 12,
                color: 'var(--text)',
                background: 'var(--glass2)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '5px 12px',
                textDecoration: 'none',
                transition: 'border-color 0.15s ease',
              }}
            >
              {entity}
            </Link>
          ))}
        </div>
      </div>

      {/* Timeline: signals sorted by date */}
      <div style={{ ...GLASS_CARD, marginBottom: 20 }}>
        <div style={SECTION_HEADER}>Signal Timeline</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {cluster.signals.map((signal, i) => {
            const isLast = i === cluster.signals.length - 1;
            return (
              <div key={signal.id} style={{ display: 'flex', gap: 14 }}>
                {/* Timeline dot + line */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  width: 16,
                  flexShrink: 0,
                }}>
                  <div style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: 'var(--indigo-l, #818cf8)',
                    border: '2px solid var(--glass3)',
                    marginTop: 5,
                    flexShrink: 0,
                  }} />
                  {!isLast && (
                    <div style={{
                      width: 1,
                      flex: 1,
                      background: 'var(--border)',
                      minHeight: 20,
                    }} />
                  )}
                </div>

                {/* Signal content */}
                <Link
                  href={`/signals/${signal.id}`}
                  style={{
                    flex: 1,
                    paddingBottom: isLast ? 0 : 16,
                    textDecoration: 'none',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <p style={{
                      margin: 0,
                      fontSize: 13,
                      fontWeight: 500,
                      color: 'var(--text)',
                      lineHeight: 1.45,
                    }}>
                      {signal.title}
                    </p>
                    <span style={{
                      fontSize: 11,
                      color: 'var(--text3)',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {formatDate(signal.date)}
                    </span>
                  </div>
                  <p style={{
                    margin: '4px 0 0',
                    fontSize: 12,
                    color: 'var(--text2)',
                    lineHeight: 1.5,
                  }}>
                    {signal.summary}
                  </p>
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <Badge category={signal.category} />
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                      {signal.entityName}
                    </span>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}
