'use client';

import { useEffect, useRef, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Direction   = 'UP' | 'DOWN' | 'NEUTRAL';
type MarketBias  = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

interface Opportunity {
  rank:        number;
  symbol:      string;
  score:       number;
  direction:   Direction;
  velocity?:   number;
  volumeSpike?: boolean;
  timestamp?:  number;
}

interface OpportunitiesResponse {
  marketBias: MarketBias;
  signals:    Opportunity[];
  timestamp:  string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 5_000;
const DISPLAY_LIMIT    = 10;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const DIRECTION_ARROW: Record<Direction, string> = {
  UP:      '↑',
  DOWN:    '↓',
  NEUTRAL: '→',
};

// Resolves to CSS variable strings or literal colors.
// UP → green, DOWN → red, NEUTRAL → muted text.
const DIRECTION_COLOR: Record<Direction, string> = {
  UP:      '#4ade80',
  DOWN:    '#f87171',
  NEUTRAL: 'var(--text3)',
};

const BIAS_COLOR: Record<MarketBias, string> = {
  BULLISH: '#4ade80',
  BEARISH: '#f87171',
  NEUTRAL: 'var(--text3)',
};

function scoreColor(score: number): string {
  if (score >= 90) return 'var(--cyan-l)';
  if (score >= 80) return 'var(--text)';
  return 'var(--text2)';
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function OpportunityFeed() {
  const [signals,   setSignals]   = useState<Opportunity[]>([]);
  const [bias,      setBias]      = useState<MarketBias | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(false);

  // Keep a stable ref to the in-flight AbortController so we can cancel it
  // when the component unmounts or before starting the next poll cycle.
  const abortRef = useRef<AbortController | null>(null);

  function fetchOpportunities() {
    // Cancel any previous in-flight request before issuing a new one.
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    fetch('/api/opportunities', { signal: ctrl.signal })
      .then((res) => {
        if (!res.ok) throw new Error('non-ok');
        return res.json() as Promise<OpportunitiesResponse>;
      })
      .then((data) => {
        setSignals(data.signals.slice(0, DISPLAY_LIMIT));
        setBias(data.marketBias);
        setUpdatedAt(data.timestamp);
        setError(false);
      })
      .catch((err) => {
        // Ignore abort errors — they are intentional.
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(true);
      })
      .finally(() => {
        setLoading(false);
      });
  }

  useEffect(() => {
    fetchOpportunities();
    const id = setInterval(fetchOpportunities, POLL_INTERVAL_MS);
    return () => {
      clearInterval(id);
      abortRef.current?.abort();
    };
    // fetchOpportunities is defined inside the component but never changes —
    // exhaustive-deps lint rule would flag this; wrapping in useCallback would
    // require adding it to deps and cause an extra re-run on mount. The
    // interval ref pattern here is intentional and safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{
      padding:      '20px 24px',
      borderRadius: 'var(--r)',
      background:   'var(--glass)',
      border:       '1px solid var(--border)',
    }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{
        display:       'flex',
        alignItems:    'center',
        justifyContent:'space-between',
        marginBottom:  16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12 }}>🔥</span>
          <span style={{
            fontFamily:    'var(--fm)',
            fontSize:      9,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color:         'var(--text3)',
          }}>
            Hot Signals
          </span>

          {/* Live pulse dot */}
          <span style={{
            width:        6,
            height:       6,
            borderRadius: '50%',
            display:      'inline-block',
            background:   error ? '#f87171' : 'var(--cyan-l)',
            boxShadow:    error ? 'none'    : '0 0 6px var(--cyan-l)',
          }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Market bias badge */}
          {bias && (
            <span style={{
              fontFamily:    'var(--fm)',
              fontSize:      9,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color:         BIAS_COLOR[bias],
              padding:       '2px 8px',
              borderRadius:  10,
              border:        `1px solid ${BIAS_COLOR[bias]}`,
            }}>
              {bias}
            </span>
          )}

          {/* Last-updated clock */}
          {updatedAt && (
            <span style={{ fontFamily: 'var(--fm)', fontSize: 10, color: 'var(--text3)' }}>
              {new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      {/* ── Loading ──────────────────────────────────────────────────────── */}
      {loading && (
        <p style={{ fontFamily: 'var(--fm)', fontSize: 12, color: 'var(--text3)' }}>
          Scanning…
        </p>
      )}

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {!loading && error && (
        <p style={{ fontFamily: 'var(--fm)', fontSize: 12, color: '#f87171' }}>
          Unable to reach signal feed — retrying.
        </p>
      )}

      {/* ── Empty ────────────────────────────────────────────────────────── */}
      {!loading && !error && signals.length === 0 && (
        <p style={{ fontFamily: 'var(--fm)', fontSize: 12, color: 'var(--text3)' }}>
          No signals above threshold.
        </p>
      )}

      {/* ── Signal table ─────────────────────────────────────────────────── */}
      {!loading && !error && signals.length > 0 && (
        <>
          {/* Column headers */}
          <div style={{
            display:             'grid',
            gridTemplateColumns: '24px 1fr auto auto',
            gap:                 '0 12px',
            padding:             '0 0 8px',
            borderBottom:        '1px solid var(--border)',
            marginBottom:        4,
          }}>
            {['#', 'Symbol', 'Dir', 'Score'].map((h) => (
              <span key={h} style={{
                fontFamily:    'var(--fm)',
                fontSize:      9,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color:         'var(--text3)',
                textAlign:     h === 'Score' || h === 'Dir' ? 'right' : 'left',
              }}>
                {h}
              </span>
            ))}
          </div>

          {/* Rows */}
          <div>
            {signals.map((sig, i) => (
              <div
                key={`${sig.symbol}-${sig.rank}`}
                style={{
                  display:             'grid',
                  gridTemplateColumns: '24px 1fr auto auto',
                  gap:                 '0 12px',
                  alignItems:          'center',
                  padding:             '8px 0',
                  borderBottom:        i < signals.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                {/* Rank */}
                <span style={{
                  fontFamily: 'var(--fm)',
                  fontSize:   11,
                  color:      'var(--text3)',
                }}>
                  {sig.rank}
                </span>

                {/* Symbol */}
                <span style={{
                  fontSize:   13,
                  fontWeight: 500,
                  color:      'var(--text)',
                  letterSpacing: '0.02em',
                }}>
                  {sig.symbol}
                </span>

                {/* Direction */}
                <span style={{
                  fontFamily: 'var(--fm)',
                  fontSize:   13,
                  fontWeight: 600,
                  color:      DIRECTION_COLOR[sig.direction],
                  textAlign:  'right',
                  minWidth:   16,
                }}>
                  {DIRECTION_ARROW[sig.direction]}
                </span>

                {/* Score */}
                <span style={{
                  fontFamily: 'var(--fm)',
                  fontSize:   13,
                  fontWeight: 600,
                  color:      scoreColor(sig.score),
                  textAlign:  'right',
                  minWidth:   32,
                }}>
                  {Math.round(sig.score)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
