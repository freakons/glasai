'use client';

import { useEffect, useRef, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type MarketBias = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
type Direction  = 'UP' | 'DOWN' | 'NEUTRAL';

interface Signal {
  direction: Direction;
}

interface OpportunitiesResponse {
  marketBias: MarketBias;
  signals:    Signal[];
  timestamp:  string;
}

interface PulseCounts {
  bullish: number;
  bearish: number;
  neutral: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 10_000;

const BIAS_STYLES: Record<MarketBias, { text: string; ring: string }> = {
  BULLISH: { text: 'text-green-400',  ring: 'ring-green-400/40'  },
  BEARISH: { text: 'text-red-400',    ring: 'ring-red-400/40'    },
  NEUTRAL: { text: 'text-zinc-400',   ring: 'ring-zinc-500/40'   },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────

function countDirections(signals: Signal[]): PulseCounts {
  let bullish = 0;
  let bearish = 0;
  let neutral = 0;
  for (const s of signals) {
    if      (s.direction === 'UP')   bullish++;
    else if (s.direction === 'DOWN') bearish++;
    else                             neutral++;
  }
  return { bullish, bearish, neutral };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function CountRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/[0.06] last:border-0">
      <span className="text-xs font-mono uppercase tracking-widest text-zinc-500">
        {label}
      </span>
      <span className={`text-sm font-mono font-semibold tabular-nums ${color}`}>
        {value}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function MarketPulse() {
  const [counts,    setCounts]    = useState<PulseCounts | null>(null);
  const [bias,      setBias]      = useState<MarketBias | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  function fetchPulse() {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    fetch('/api/opportunities', { signal: ctrl.signal })
      .then((res) => {
        if (!res.ok) throw new Error('non-ok');
        return res.json() as Promise<OpportunitiesResponse>;
      })
      .then((data) => {
        setCounts(countDirections(data.signals));
        setBias(data.marketBias);
        setUpdatedAt(data.timestamp);
        setError(false);
      })
      .catch((err) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(true);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchPulse();
    const id = setInterval(fetchPulse, POLL_INTERVAL_MS);
    return () => {
      clearInterval(id);
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const biasStyle = bias ? BIAS_STYLES[bias] : BIAS_STYLES.NEUTRAL;

  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-4"
      style={{ background: 'var(--glass)', border: '1px solid var(--border)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-mono uppercase tracking-[0.12em] text-zinc-500">
          Market Pulse
        </span>

        <div className="flex items-center gap-2">
          {/* Live dot */}
          <span
            className={`w-1.5 h-1.5 rounded-full inline-block ${
              error ? 'bg-red-400' : 'bg-cyan-400'
            }`}
            style={error ? undefined : { boxShadow: '0 0 6px var(--cyan-l)' }}
          />
          {updatedAt && (
            <span className="text-[10px] font-mono text-zinc-600">
              {new Date(updatedAt).toLocaleTimeString([], {
                hour:   '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </span>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <p className="text-xs font-mono text-zinc-500">Scanning…</p>
      )}

      {/* Error */}
      {!loading && error && (
        <p className="text-xs font-mono text-red-400">
          Unable to reach signal feed — retrying.
        </p>
      )}

      {/* Data */}
      {!loading && !error && counts && bias && (
        <>
          {/* Direction counts */}
          <div>
            <CountRow label="Bullish" value={counts.bullish} color="text-green-400" />
            <CountRow label="Bearish" value={counts.bearish} color="text-red-400"   />
            <CountRow label="Neutral" value={counts.neutral} color="text-zinc-400"  />
          </div>

          {/* Bias badge */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-[9px] font-mono uppercase tracking-[0.12em] text-zinc-500">
              Bias
            </span>
            <span
              className={`text-xs font-mono font-bold uppercase tracking-widest px-3 py-1 rounded-full ring-1 ${biasStyle.text} ${biasStyle.ring}`}
            >
              {bias}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
