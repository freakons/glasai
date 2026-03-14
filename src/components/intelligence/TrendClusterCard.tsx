import Link from 'next/link';
import type { SignalCluster } from '@/lib/signals/clusterSignals';

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  background: 'var(--glass)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r, 12px)',
  padding: '16px 20px',
  cursor: 'pointer',
  transition: 'border-color 0.15s ease, background 0.15s ease',
  textDecoration: 'none',
  display: 'block',
};

const TITLE: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--text)',
  lineHeight: 1.4,
};

const ENTITY_ROW: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  marginTop: 8,
};

const ENTITY_TAG: React.CSSProperties = {
  fontSize: 10,
  fontFamily: 'var(--fm)',
  letterSpacing: '0.04em',
  color: 'var(--text2)',
  background: 'var(--glass2)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '2px 7px',
};

const META_ROW: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  marginTop: 10,
};

const SIGNAL_COUNT: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text2)',
  fontVariantNumeric: 'tabular-nums',
};

// ─────────────────────────────────────────────────────────────────────────────
// Momentum badge config
// ─────────────────────────────────────────────────────────────────────────────

const MOMENTUM_CONFIG = {
  rising: {
    label: 'Rising',
    symbol: '↑',
    color: 'var(--emerald-l, #34d399)',
    borderColor: 'rgba(5,150,105,0.35)',
  },
  stable: {
    label: 'Stable',
    symbol: '→',
    color: 'var(--text3, rgba(255,255,255,0.4))',
    borderColor: 'var(--border2, rgba(255,255,255,0.08))',
  },
  cooling: {
    label: 'Cooling',
    symbol: '↓',
    color: 'var(--sky-l, #38bdf8)',
    borderColor: 'rgba(14,165,233,0.35)',
  },
} as const;

const MOMENTUM_BADGE: React.CSSProperties = {
  fontFamily: 'var(--fm)',
  fontSize: 9,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  padding: '2px 8px',
  borderRadius: 10,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  whiteSpace: 'nowrap',
  lineHeight: 1.4,
};

const CATEGORY_BADGE: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: '#a78bfa',
  background: 'rgba(124,58,237,0.12)',
  padding: '2px 7px',
  borderRadius: 4,
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface TrendClusterCardProps {
  cluster: SignalCluster;
}

/**
 * TrendClusterCard — displays a signal cluster as an emerging trend.
 * Shows title, entities, signal count, and momentum indicator.
 * Links to /trend/[id] for expanded view.
 */
export function TrendClusterCard({ cluster }: TrendClusterCardProps) {
  const mc = MOMENTUM_CONFIG[cluster.momentum];

  return (
    <Link href={`/trend/${cluster.id}`} style={CARD}>
      {/* Header: title + momentum */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <p style={TITLE}>{cluster.title}</p>
        <span
          style={{
            ...MOMENTUM_BADGE,
            color: mc.color,
            border: `1px solid ${mc.borderColor}`,
            flexShrink: 0,
          }}
          title={`Trend momentum: ${mc.label}`}
        >
          <span style={{ fontSize: 10, lineHeight: 1 }}>{mc.symbol}</span>
          {mc.label}
        </span>
      </div>

      {/* Meta row: category + signal count */}
      <div style={META_ROW}>
        <span style={CATEGORY_BADGE}>{cluster.category}</span>
        <span style={SIGNAL_COUNT}>
          {cluster.signalCount} signal{cluster.signalCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Entities */}
      <div style={ENTITY_ROW}>
        {cluster.entities.map((entity) => (
          <span key={entity} style={ENTITY_TAG}>
            {entity}
          </span>
        ))}
      </div>
    </Link>
  );
}
