'use client';

import { useState } from 'react';
import { SignalCard } from '@/components/cards/SignalCard';
import { NewsCard } from '@/components/cards/NewsCard';
import type { SignalWithRankMeta } from '@/lib/signals/feedComposer';
import type { Article } from '@/lib/data/news';

// ─────────────────────────────────────────────────────────────────────────────
// Filter categories — must match signal.category values from the DB
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: 'all',        label: 'All Signals' },
  { key: 'models',     label: 'Models' },
  { key: 'agents',     label: 'Agents' },
  { key: 'funding',    label: 'Funding' },
  { key: 'research',   label: 'Research' },
  { key: 'regulation', label: 'Regulation' },
  { key: 'product',    label: 'Products' },
] as const;

type FilterKey = (typeof CATEGORIES)[number]['key'];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface IntelligenceFeedProps {
  signals: SignalWithRankMeta[];
  articles: Article[];
}

export function IntelligenceFeed({ signals, articles }: IntelligenceFeedProps) {
  const [active, setActive] = useState<FilterKey>('all');

  const filtered = active === 'all'
    ? signals
    : signals.filter((s) => s.category === active);

  // Count signals per category for filter badges
  const counts = signals.reduce<Record<string, number>>((acc, s) => {
    acc[s.category] = (acc[s.category] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      {/* ── Filters ───────────────────────────────────────────────────── */}
      <div className="filters" role="tablist" aria-label="Filter signals by category">
        {CATEGORIES.map(({ key, label }) => (
          <button
            key={key}
            role="tab"
            aria-selected={active === key}
            className={`fp${active === key ? ' on' : ''}`}
            onClick={() => setActive(key)}
          >
            {label}
            {key !== 'all' && counts[key] != null && counts[key] > 0 && (
              <span className="fp-count">{counts[key]}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Signal feed (filtered) ────────────────────────────────────── */}
      {filtered.length > 0 && (
        <div className="news-grid">
          {filtered.map((signal) => (
            <SignalCard key={signal.id} signal={signal} />
          ))}
        </div>
      )}

      {/* ── Empty filter state ────────────────────────────────────────── */}
      {filtered.length === 0 && signals.length > 0 && (
        <div className="feed-empty">
          <p className="feed-empty-title">No signals in this category</p>
          <p className="feed-empty-sub">
            Try selecting a different filter, or check back — new intelligence is ingested continuously.
          </p>
          <button
            className="fp on"
            style={{ marginTop: 12 }}
            onClick={() => setActive('all')}
          >
            Show all signals
          </button>
        </div>
      )}

      {/* ── Article fallback (when no signals at all) ─────────────────── */}
      {signals.length === 0 && articles.length > 0 && (
        <div className="news-grid">
          {articles.filter(a => !a.featured).map((article) => (
            <NewsCard key={article.id} article={article} />
          ))}
        </div>
      )}

      {/* ── Empty state (no data) ─────────────────────────────────────── */}
      {signals.length === 0 && articles.length === 0 && (
        <div className="feed-empty">
          <p className="feed-empty-title">No intelligence data yet</p>
          <p className="feed-empty-sub">
            The intelligence feed will populate automatically as the pipeline ingests data.
          </p>
        </div>
      )}
    </>
  );
}
