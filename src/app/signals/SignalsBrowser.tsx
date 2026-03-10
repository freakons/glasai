'use client';

import { useEffect, useState } from 'react';
import MOCK_SIGNALS, { type Signal, type SignalCategory } from '@/data/mockSignals';
import { CommandBar } from '@/ui/layout/CommandBar';

// ─────────────────────────────────────────────────────────────────────────────
// Types & constants
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORIES: Array<{ key: 'all' | SignalCategory; label: string }> = [
  { key: 'all',        label: 'All'        },
  { key: 'models',     label: 'Models'     },
  { key: 'funding',    label: 'Funding'    },
  { key: 'regulation', label: 'Regulation' },
  { key: 'research',   label: 'Research'   },
  { key: 'agents',     label: 'Agents'     },
  { key: 'product',    label: 'Product'    },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function categoryGradient(cat: SignalCategory): string {
  switch (cat) {
    case 'models':     return 'linear-gradient(90deg, var(--violet), var(--indigo-l))';
    case 'funding':    return 'linear-gradient(90deg, var(--amber), var(--amber-l))';
    case 'regulation': return 'linear-gradient(90deg, var(--rose), var(--amber-l))';
    case 'research':   return 'linear-gradient(90deg, var(--sky), var(--cyan-l))';
    case 'agents':     return 'linear-gradient(90deg, var(--cyan), var(--indigo-l))';
    case 'product':    return 'linear-gradient(90deg, var(--emerald), var(--cyan-l))';
    default:           return 'linear-gradient(90deg, var(--indigo), var(--cyan))';
  }
}

function confidenceColor(pct: number): string {
  if (pct >= 90) return 'var(--emerald-l)';
  if (pct >= 75) return 'var(--amber)';
  return 'var(--text3)';
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Data fetching
// ─────────────────────────────────────────────────────────────────────────────

async function fetchSignals(): Promise<Signal[]> {
  try {
    const res = await fetch('/api/signals', { next: { revalidate: 60 } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data.signals) && data.signals.length > 0) {
      return data.signals as Signal[];
    }
    // In production, return empty to show explicit empty state instead of fake data
    if (process.env.NODE_ENV === 'production') return [];
    return MOCK_SIGNALS;
  } catch {
    if (process.env.NODE_ENV === 'production') return [];
    return MOCK_SIGNALS;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal card
// ─────────────────────────────────────────────────────────────────────────────

function SignalItem({ signal }: { signal: Signal }) {
  const grad = categoryGradient(signal.category);
  const confColor = confidenceColor(signal.confidence);

  return (
    <div
      className="nc"
      style={{ '--cc': grad } as React.CSSProperties}
    >
      {/* Top row: category badge + confidence */}
      <div className="nc-top">
        <span className={`badge ${signal.category}`}>
          {signal.category.toUpperCase()}
        </span>
        <span style={{
          fontFamily: 'var(--fm)',
          fontSize: '10.5px',
          color: confColor,
          letterSpacing: '0.05em',
        }}>
          {signal.confidence}% confidence
        </span>
      </div>

      {/* Title */}
      <div className="nc-title">{signal.title}</div>

      {/* Summary */}
      <div className="nc-body">{signal.summary}</div>

      {/* Confidence bar */}
      <div style={{ marginBottom: 14 }}>
        <div style={{
          height: 3,
          borderRadius: 2,
          background: 'rgba(255,255,255,0.07)',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${signal.confidence}%`,
            borderRadius: 2,
            background: confColor,
            transition: 'width 0.6s cubic-bezier(.4,0,.2,1)',
          }} />
        </div>
      </div>

      {/* Footer */}
      <div className="nc-foot">
        <span className="nc-src">
          <span style={{
            width: 4, height: 4, borderRadius: '50%',
            background: 'var(--indigo-l)', display: 'inline-block', flexShrink: 0,
          }} />
          {signal.entityName}
        </span>
        <span style={{ fontFamily: 'var(--fm)', fontSize: '10.5px', color: 'var(--text3)' }}>
          {formatDate(signal.date)}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Category stats banner
// ─────────────────────────────────────────────────────────────────────────────

function SignalStats({ signals }: { signals: Signal[] }) {
  const counts = signals.reduce<Record<string, number>>((acc, s) => {
    acc[s.category] = (acc[s.category] ?? 0) + 1;
    return acc;
  }, {});

  const avgConf = signals.length > 0
    ? Math.round(signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length)
    : 0;

  return (
    <div className="stats-row" style={{ marginBottom: 20 }}>
      {[
        { n: String(signals.length),         l: 'Total Signals',  glow: 'rgba(79,70,229,0.4)',  color: 'var(--indigo-l)'  },
        { n: String(counts.models ?? 0),     l: 'Model Signals',  glow: 'rgba(124,58,237,0.4)', color: 'var(--violet-l)' },
        { n: String(counts.funding ?? 0),    l: 'Funding Signals',glow: 'rgba(217,119,6,0.4)',  color: 'var(--amber-l)'  },
        { n: String(counts.regulation ?? 0), l: 'Regulation',     glow: 'rgba(225,29,72,0.4)',  color: 'var(--rose-l)'   },
        { n: `${avgConf}%`, l: 'Avg Confidence', glow: 'rgba(5,150,105,0.4)', color: 'var(--emerald-l)' },
      ].map(({ n, l, glow, color }) => (
        <div key={l} style={{
          background: 'var(--glass)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r)',
          padding: '14px 16px',
          backdropFilter: 'var(--blur)',
        }}>
          <div style={{
            fontFamily: 'var(--fd)',
            fontSize: 26,
            fontStyle: 'italic',
            color,
            textShadow: `0 0 20px ${glow}`,
            lineHeight: 1,
            marginBottom: 4,
          }}>{n}</div>
          <div style={{
            fontFamily: 'var(--fm)',
            fontSize: 10,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--text3)',
          }}>{l}</div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main browser component
// ─────────────────────────────────────────────────────────────────────────────

export function SignalsBrowser() {
  const [active, setActive] = useState<'all' | SignalCategory>('all');
  const [signals, setSignals] = useState<Signal[]>(
    process.env.NODE_ENV === 'production' ? [] : MOCK_SIGNALS,
  );

  // Fetch from API on mount; silently keep mock data if it fails
  useEffect(() => {
    fetchSignals().then(setSignals);
  }, []);

  const filtered = active === 'all'
    ? signals
    : signals.filter((s) => s.category === active);

  return (
    <>
      <SignalStats signals={signals} />

      {/* Category filters */}
      <div className="filters">
        {CATEGORIES.map(({ key, label }) => (
          <button
            key={key}
            className={`fp${active === key ? ' on' : ''}`}
            onClick={() => setActive(key)}
          >
            {label}
            {key !== 'all' && (
              <span style={{
                marginLeft: 5,
                fontFamily: 'var(--fm)',
                fontSize: 9,
                opacity: 0.6,
              }}>
                {signals.filter((s) => s.category === key).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Signal grid */}
      <div className="news-grid" style={{ marginBottom: 24 }}>
        {filtered.map((signal) => (
          <SignalItem key={signal.id} signal={signal} />
        ))}
      </div>

      {/* Terminal command bar */}
      <CommandBar />
    </>
  );
}
