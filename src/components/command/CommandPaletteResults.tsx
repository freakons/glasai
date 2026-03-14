'use client';

import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SearchResult {
  type: 'entity' | 'signal' | 'trend' | 'event' | 'action';
  label: string;
  subtitle: string;
  href: string;
  metadata?: Record<string, string | number>;
}

interface GroupedResults {
  entities: SearchResult[];
  signals: SearchResult[];
  trends: SearchResult[];
  events: SearchResult[];
  actions: SearchResult[];
}

interface CommandPaletteResultsProps {
  results: GroupedResults;
  selectedIndex: number;
  onSelect: (result: SearchResult) => void;
  suggestion?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Badge colors per type
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  entity: { bg: 'rgba(79,70,229,0.18)', color: '#818cf8', label: 'Entity' },
  signal: { bg: 'rgba(6,182,212,0.18)', color: '#67e8f9', label: 'Signal' },
  trend:  { bg: 'rgba(124,58,237,0.18)', color: '#a78bfa', label: 'Trend' },
  event:  { bg: 'rgba(217,119,6,0.18)', color: '#fbbf24', label: 'Event' },
  action: { bg: 'rgba(5,150,105,0.18)', color: '#34d399', label: 'Action' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Section labels
// ─────────────────────────────────────────────────────────────────────────────

const SECTION_ORDER: Array<{ key: keyof GroupedResults; label: string }> = [
  { key: 'entities', label: 'Entities' },
  { key: 'trends', label: 'Trends' },
  { key: 'signals', label: 'Signals' },
  { key: 'events', label: 'Events' },
  { key: 'actions', label: 'Actions' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function CommandPaletteResults({
  results,
  selectedIndex,
  onSelect,
  suggestion,
}: CommandPaletteResultsProps) {
  // Flatten results to compute global indices
  const flatResults: SearchResult[] = [];
  for (const section of SECTION_ORDER) {
    flatResults.push(...results[section.key]);
  }

  if (flatResults.length === 0 && !suggestion) {
    return (
      <div className="cmd-empty">
        <div className="cmd-empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="28" height="28">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </div>
        <p className="cmd-empty-title">No results found</p>
        <p className="cmd-empty-hint">Try searching for an entity, signal, or trend</p>
      </div>
    );
  }

  let globalIdx = 0;

  return (
    <div className="cmd-results">
      {suggestion && (
        <div className="cmd-suggestion">{suggestion}</div>
      )}
      {SECTION_ORDER.map(({ key, label }) => {
        const items = results[key];
        if (items.length === 0) return null;

        const sectionStart = globalIdx;

        return (
          <div key={key} className="cmd-section">
            <div className="cmd-section-label">{label}</div>
            {items.map((item, i) => {
              const thisIdx = sectionStart + i;
              const isSelected = thisIdx === selectedIndex;
              globalIdx++;
              const style = TYPE_STYLES[item.type] || TYPE_STYLES.action;

              return (
                <button
                  key={`${item.type}-${item.href}-${i}`}
                  className={`cmd-row${isSelected ? ' cmd-row-active' : ''}`}
                  data-index={thisIdx}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelect(item);
                  }}
                  onMouseEnter={(e) => {
                    // Allow mouse hover to update selection via data attribute
                    const el = e.currentTarget.closest('.cmd-results');
                    if (el) el.dispatchEvent(new CustomEvent('cmd-hover', { detail: thisIdx }));
                  }}
                  type="button"
                >
                  <span
                    className="cmd-badge"
                    style={{ background: style.bg, color: style.color }}
                  >
                    {style.label}
                  </span>
                  <span className="cmd-row-content">
                    <span className="cmd-row-label">{item.label}</span>
                    <span className="cmd-row-subtitle">{item.subtitle}</span>
                  </span>
                  {item.metadata && Object.keys(item.metadata).length > 0 && (
                    <span className="cmd-row-meta">
                      {Object.entries(item.metadata).slice(0, 2).map(([k, v]) => (
                        <span key={k} className="cmd-meta-tag">{k}: {v}</span>
                      ))}
                    </span>
                  )}
                  {isSelected && (
                    <span className="cmd-row-enter">
                      <kbd>↵</kbd>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
