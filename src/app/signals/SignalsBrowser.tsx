'use client';

import { useEffect, useState } from 'react';
import { type Signal, type SignalCategory, type SignalContext } from '@/data/mockSignals';
import { SignalImpactBadge } from '@/components/signals/SignalImpactBadge';
import { SignalMomentumBadge } from '@/components/signals/SignalMomentumBadge';
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
// Data fetching — refreshes on the client after SSR initial load
// ─────────────────────────────────────────────────────────────────────────────

async function refreshSignals(current: Signal[]): Promise<Signal[]> {
  try {
    const res = await fetch('/api/signals', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data.signals) && data.signals.length > 0) {
      return data.signals as Signal[];
    }
    return current;
  } catch {
    return current;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal card — intelligence context panel (progressive disclosure)
// ─────────────────────────────────────────────────────────────────────────────

function SignalContextPanel({ ctx }: { ctx: SignalContext }) {
  // Defensive guards: although TypeScript types say these are arrays, incoming
  // data may be null/undefined if a context was partially written or malformed.
  const entities    = Array.isArray(ctx.affectedEntities) ? ctx.affectedEntities : [];
  const implications = Array.isArray(ctx.implications) ? ctx.implications : [];

  const hasSummary      = Boolean(ctx.summary);
  const hasWhy          = Boolean(ctx.whyItMatters);
  const hasEntities     = entities.length > 0;
  const hasImplications = implications.length > 0;

  if (!hasSummary && !hasWhy && !hasEntities && !hasImplications) return null;

  return (
    <div style={{
      marginTop: 8,
      padding: '10px 12px',
      background: 'rgba(255,255,255,0.03)',
      borderRadius: 6,
      border: '1px solid rgba(255,255,255,0.07)',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      {/* Context summary — editorial headline from the AI layer */}
      {hasSummary && (
        <div style={{
          fontSize: '12px',
          lineHeight: 1.5,
          color: 'rgba(255,255,255,0.75)',
          fontStyle: 'italic',
        }}>
          {ctx.summary}
        </div>
      )}

      {/* Why it matters */}
      {hasWhy && (
        <div>
          <div style={{
            fontFamily: 'var(--fm)',
            fontSize: '9px',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--text3)',
            marginBottom: 4,
          }}>
            Why it matters
          </div>
          <div style={{
            fontSize: '11.5px',
            color: 'rgba(255,255,255,0.65)',
            lineHeight: 1.55,
          }}>
            {ctx.whyItMatters}
          </div>
        </div>
      )}

      {/* Affected entities */}
      {hasEntities && (
        <div>
          <div style={{
            fontFamily: 'var(--fm)',
            fontSize: '9px',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--text3)',
            marginBottom: 5,
          }}>
            Affected entities
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {entities.map((e, i) => (
              <span key={i} style={{
                fontFamily: 'var(--fm)',
                fontSize: '9.5px',
                color: 'rgba(255,255,255,0.6)',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 4,
                padding: '2px 7px',
                whiteSpace: 'nowrap',
              }}>
                {e.name ?? '—'}{e.role ? ` · ${e.role}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Implications */}
      {hasImplications && (
        <div>
          <div style={{
            fontFamily: 'var(--fm)',
            fontSize: '9px',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--text3)',
            marginBottom: 5,
          }}>
            Implications
          </div>
          <ul style={{
            margin: 0,
            paddingLeft: 0,
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}>
            {implications.map((imp, i) => (
              <li key={i} style={{
                display: 'flex',
                gap: 6,
                fontSize: '11px',
                color: 'rgba(255,255,255,0.6)',
                lineHeight: 1.5,
              }}>
                <span style={{
                  flexShrink: 0,
                  color: 'var(--indigo-l)',
                  fontSize: '9px',
                  marginTop: 2,
                }}>→</span>
                {imp}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal card
// ─────────────────────────────────────────────────────────────────────────────

function SignalItem({ signal }: { signal: Signal }) {
  const grad = categoryGradient(signal.category);
  const confColor = confidenceColor(signal.confidence);
  const [ctxOpen, setCtxOpen] = useState(false);
  const ctx = signal.context ?? null;

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontFamily: 'var(--fm)',
            fontSize: '10.5px',
            color: confColor,
            letterSpacing: '0.05em',
          }}>
            {signal.confidence}% confidence
          </span>
          <SignalImpactBadge
            signal={{
              significanceScore: signal.significanceScore,
              confidenceScore: signal.confidence,
              sourceSupportCount: signal.sourceSupportCount,
              affectedEntitiesCount: signal.context?.affectedEntities?.length ?? null,
            }}
            showLabel={false}
          />
          {signal.momentum && (
            <SignalMomentumBadge momentum={signal.momentum} showLabel={false} />
          )}
        </div>
      </div>

      {/* Title */}
      <div className="nc-title">{signal.title}</div>

      {/* Summary */}
      <div className="nc-body">{signal.summary}</div>

      {/* Confidence bar */}
      <div style={{ marginBottom: ctx ? 10 : 14 }}>
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

      {/* Intelligence context — only rendered when a ready context exists */}
      {ctx && (
        <div style={{ marginBottom: 10 }}>
          <button
            onClick={() => setCtxOpen((o: boolean) => !o)}
            aria-expanded={ctxOpen}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              fontFamily: 'var(--fm)',
              fontSize: '9.5px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--indigo-l)',
              opacity: 0.85,
            }}
          >
            <span style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              border: '1px solid var(--indigo-l)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              fontSize: '8px',
              lineHeight: 1,
            }}>
              {ctxOpen ? '−' : '+'}
            </span>
            Intel Context
          </button>
          {ctxOpen && <SignalContextPanel ctx={ctx} />}
        </div>
      )}

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

interface SignalsBrowserProps {
  /** Pre-fetched signals from the server component (SSR). */
  initialSignals: Signal[];
}

export function SignalsBrowser({ initialSignals }: SignalsBrowserProps) {
  const [active, setActive] = useState<'all' | SignalCategory>('all');
  const [signals, setSignals] = useState<Signal[]>(initialSignals);

  // Refresh from API on mount to pick up any signals added since SSR
  useEffect(() => {
    refreshSignals(initialSignals).then(setSignals);
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
