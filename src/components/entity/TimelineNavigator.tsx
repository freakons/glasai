'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import type { TimelineItem } from '@/db/queries';

// ─────────────────────────────────────────────────────────────────────────────
// Filter model
// ─────────────────────────────────────────────────────────────────────────────

export type TimelineFilter = 'all' | 'signal' | 'event' | 'funding' | 'regulation';

interface FilterOption {
  key: TimelineFilter;
  label: string;
}

const FILTER_OPTIONS: FilterOption[] = [
  { key: 'all', label: 'All' },
  { key: 'signal', label: 'Signals' },
  { key: 'event', label: 'Events' },
  { key: 'funding', label: 'Funding' },
  { key: 'regulation', label: 'Regulation' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const PILL_BASE: React.CSSProperties = {
  fontFamily: 'var(--fm)',
  fontSize: 9,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  padding: '4px 12px',
  borderRadius: 10,
  border: '1px solid var(--border2)',
  background: 'transparent',
  color: 'var(--text3)',
  cursor: 'pointer',
  transition: 'all 0.15s',
  whiteSpace: 'nowrap',
};

const PILL_ACTIVE: React.CSSProperties = {
  ...PILL_BASE,
  color: 'var(--text)',
  borderColor: 'var(--cyan-l)',
  background: 'rgba(6,182,212,0.1)',
};

const EMPTY_TEXT: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--text3)',
  lineHeight: 1.7,
};

// ─────────────────────────────────────────────────────────────────────────────
// Filter logic
// ─────────────────────────────────────────────────────────────────────────────

const FUNDING_PATTERN = /fund|invest|round|capital|financ|grant|series\s/i;
const REGULATION_PATTERN = /regulat|compliance|legislat|policy|legal|law|sanction|govern/i;

function matchesFilter(item: TimelineItem, filter: TimelineFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'signal') return item.type === 'signal';
  if (filter === 'event') return item.type === 'event';
  if (filter === 'funding') {
    return FUNDING_PATTERN.test(item.category) || FUNDING_PATTERN.test(item.title);
  }
  if (filter === 'regulation') {
    return REGULATION_PATTERN.test(item.category) || REGULATION_PATTERN.test(item.title);
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface EntityTimelineProps {
  timeline: TimelineItem[];
}

export function EntityTimeline({ timeline }: EntityTimelineProps) {
  const [activeFilter, setActiveFilter] = useState<TimelineFilter>('all');

  // Only show category filters if there's matching data
  const availableFilters = useMemo(() => {
    const hasFunding = timeline.some((item) => matchesFilter(item, 'funding'));
    const hasRegulation = timeline.some((item) => matchesFilter(item, 'regulation'));

    return FILTER_OPTIONS.filter((opt) => {
      if (opt.key === 'funding') return hasFunding;
      if (opt.key === 'regulation') return hasRegulation;
      return true;
    });
  }, [timeline]);

  const filteredItems = useMemo(
    () => timeline.filter((item) => matchesFilter(item, activeFilter)),
    [timeline, activeFilter],
  );

  return (
    <>
      {/* Timeline Navigator */}
      {timeline.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}>
          {availableFilters.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setActiveFilter(opt.key)}
              style={activeFilter === opt.key ? PILL_ACTIVE : PILL_BASE}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Timeline items */}
      {filteredItems.length === 0 ? (
        <p style={EMPTY_TEXT}>
          {timeline.length === 0
            ? 'No timeline activity available yet.'
            : 'No timeline activity for this filter yet.'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {filteredItems.map((item) => (
            <Link
              key={`${item.type}-${item.id}`}
              href={item.href}
              style={{
                display: 'block',
                padding: '12px 0 12px 12px',
                borderBottom: '1px solid var(--border)',
                borderLeft: `2px solid ${item.type === 'signal' ? 'var(--cyan-l)' : 'var(--amber-l)'}`,
                textDecoration: 'none',
                transition: 'background 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{
                  fontFamily: 'var(--fm)', fontSize: 8, letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  padding: '1px 6px', borderRadius: 8,
                  color: item.type === 'signal' ? 'var(--cyan-l)' : 'var(--amber-l)',
                  border: `1px solid ${item.type === 'signal' ? 'rgba(6,182,212,0.4)' : 'rgba(217,119,6,0.4)'}`,
                  whiteSpace: 'nowrap',
                }}>
                  {item.type}
                </span>
                <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
                  {item.title}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{
                  fontFamily: 'var(--fm)', fontSize: 9, letterSpacing: '0.1em',
                  textTransform: 'uppercase', color: 'var(--text3)',
                  padding: '2px 8px', borderRadius: 10,
                  border: '1px solid var(--border2)',
                }}>
                  {item.category}
                </span>
                <span style={{ fontFamily: 'var(--fm)', fontSize: 10, color: 'var(--text3)' }}>
                  {formatDate(item.timestamp)}
                </span>
                {item.confidence != null && item.confidence >= 80 && (
                  <span style={{ fontFamily: 'var(--fm)', fontSize: 9, color: 'var(--emerald-l)' }}>
                    {item.confidence}%
                  </span>
                )}
                {item.amount && (
                  <span style={{ fontFamily: 'var(--fm)', fontSize: 9, color: 'var(--amber-l)' }}>
                    {item.amount}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
