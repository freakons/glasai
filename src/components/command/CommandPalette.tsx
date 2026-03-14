'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCommandPalette } from '@/hooks/useCommandPalette';
import { CommandPaletteResults, type SearchResult } from './CommandPaletteResults';
import { interpretCommand, getCommandSuggestions } from './commandInterpreter';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface GroupedResults {
  entities: SearchResult[];
  signals: SearchResult[];
  trends: SearchResult[];
  events: SearchResult[];
  actions: SearchResult[];
}

const EMPTY_RESULTS: GroupedResults = {
  entities: [],
  signals: [],
  trends: [],
  events: [],
  actions: [],
};

// Flatten grouped results to a single array in display order
const SECTION_ORDER: Array<keyof GroupedResults> = ['entities', 'trends', 'signals', 'events', 'actions'];

function flattenResults(results: GroupedResults): SearchResult[] {
  const flat: SearchResult[] = [];
  for (const key of SECTION_ORDER) {
    flat.push(...results[key]);
  }
  return flat;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function CommandPalette() {
  const { isOpen, close } = useCommandPalette();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GroupedResults>(EMPTY_RESULTS);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<string | undefined>();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Focus input when palette opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults(EMPTY_RESULTS);
      setSelectedIndex(0);
      setSuggestion(undefined);
      // Slight delay so the modal is rendered before focusing
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Fetch default suggestions on open
  useEffect(() => {
    if (isOpen && query === '') {
      fetch('/api/search?q=')
        .then((r) => r.json())
        .then((data) => {
          if (data.ok) {
            setResults({
              entities: data.entities ?? [],
              signals: data.signals ?? [],
              trends: data.trends ?? [],
              events: data.events ?? [],
              actions: data.actions ?? [],
            });
          }
        })
        .catch(() => {});
    }
  }, [isOpen, query]);

  // Listen for hover events from results to update selection
  useEffect(() => {
    const el = resultsRef.current;
    if (!el) return;
    const handler = (e: Event) => {
      const idx = (e as CustomEvent).detail;
      if (typeof idx === 'number') setSelectedIndex(idx);
    };
    el.addEventListener('cmd-hover', handler);
    return () => el.removeEventListener('cmd-hover', handler);
  }, [isOpen]);

  // Navigate to a result
  const navigateTo = useCallback(
    (result: SearchResult) => {
      close();
      router.push(result.href);
    },
    [close, router],
  );

  // Handle search with debounce
  const doSearch = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const cmd = interpretCommand(q);

    if (cmd.isCommand) {
      // If we have a direct href and no search needed
      if (cmd.href && !cmd.searchQuery) {
        setSuggestion(cmd.suggestion);
        setResults({
          ...EMPTY_RESULTS,
          actions: [{
            type: 'action',
            label: cmd.command ? `/${cmd.command}${cmd.args ? ` ${cmd.args}` : ''}` : q,
            subtitle: cmd.suggestion || `Navigate to ${cmd.href}`,
            href: cmd.href,
          }],
        });
        setSelectedIndex(0);
        return;
      }

      if (cmd.suggestion && !cmd.searchQuery) {
        setSuggestion(cmd.suggestion);
        setResults(EMPTY_RESULTS);
        return;
      }

      // Command with a search query — search normally but with the extracted query
      if (cmd.searchQuery) {
        setSuggestion(cmd.suggestion);
        debounceRef.current = setTimeout(() => {
          setLoading(true);
          fetch(`/api/search?q=${encodeURIComponent(cmd.searchQuery!)}&limit=5`)
            .then((r) => r.json())
            .then((data) => {
              if (data.ok) {
                const grouped: GroupedResults = {
                  entities: data.entities ?? [],
                  signals: data.signals ?? [],
                  trends: data.trends ?? [],
                  events: data.events ?? [],
                  actions: data.actions ?? [],
                };
                // If command resolved a direct href, prepend it as a top action
                if (cmd.href) {
                  grouped.actions.unshift({
                    type: 'action',
                    label: `Go to /${cmd.command} ${cmd.args || ''}`.trim(),
                    subtitle: `Navigate directly`,
                    href: cmd.href,
                  });
                }
                setResults(grouped);
                setSelectedIndex(0);
              }
            })
            .catch(() => {})
            .finally(() => setLoading(false));
        }, 180);
        return;
      }
    }

    // Regular text search
    setSuggestion(undefined);
    if (!q.trim()) {
      setResults(EMPTY_RESULTS);
      setSelectedIndex(0);
      // Re-fetch defaults
      fetch('/api/search?q=')
        .then((r) => r.json())
        .then((data) => {
          if (data.ok) {
            setResults({
              entities: data.entities ?? [],
              signals: data.signals ?? [],
              trends: data.trends ?? [],
              events: data.events ?? [],
              actions: data.actions ?? [],
            });
          }
        })
        .catch(() => {});
      return;
    }

    debounceRef.current = setTimeout(() => {
      setLoading(true);
      fetch(`/api/search?q=${encodeURIComponent(q.trim())}&limit=5`)
        .then((r) => r.json())
        .then((data) => {
          if (data.ok) {
            setResults({
              entities: data.entities ?? [],
              signals: data.signals ?? [],
              trends: data.trends ?? [],
              events: data.events ?? [],
              actions: data.actions ?? [],
            });
            setSelectedIndex(0);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 180);
  }, []);

  // Input change handler
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    doSearch(val);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const flat = flattenResults(results);
    const total = flat.length;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(total, 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + Math.max(total, 1)) % Math.max(total, 1));
        break;
      case 'Enter': {
        e.preventDefault();
        if (total > 0 && selectedIndex < total) {
          navigateTo(flat[selectedIndex]);
        } else {
          // If a command with a direct href, navigate
          const cmd = interpretCommand(query);
          if (cmd.isCommand && cmd.href) {
            close();
            router.push(cmd.href);
          }
        }
        break;
      }
      case 'Escape':
        e.preventDefault();
        close();
        break;
    }
  };

  if (!isOpen) return null;

  const commandHints = query.startsWith('/') && query.length <= 1;

  return (
    <div className="cmd-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="cmd-modal" role="dialog" aria-label="Command palette">
        <div className="cmd-input-wrap">
          <svg className="cmd-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            className="cmd-input"
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Search entities, signals, trends… or type / for commands"
            spellCheck={false}
            autoComplete="off"
          />
          {loading && <span className="cmd-spinner" />}
          <kbd className="cmd-kbd">ESC</kbd>
        </div>

        <div ref={resultsRef}>
          {commandHints && (
            <div className="cmd-results">
              <div className="cmd-section">
                <div className="cmd-section-label">Commands</div>
                {getCommandSuggestions().map(({ command, description }) => (
                  <button
                    key={command}
                    className="cmd-row"
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setQuery(command + ' ');
                      doSearch(command + ' ');
                      inputRef.current?.focus();
                    }}
                  >
                    <span className="cmd-badge" style={{ background: 'rgba(255,255,255,0.06)', color: '#8888a8' }}>
                      CMD
                    </span>
                    <span className="cmd-row-content">
                      <span className="cmd-row-label" style={{ fontFamily: 'var(--fm)' }}>{command}</span>
                      <span className="cmd-row-subtitle">{description}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!commandHints && (
            <CommandPaletteResults
              results={results}
              selectedIndex={selectedIndex}
              onSelect={navigateTo}
              suggestion={suggestion}
            />
          )}
        </div>

        <div className="cmd-footer">
          <span><kbd>↑</kbd> <kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
          <span><kbd>/</kbd> commands</span>
        </div>
      </div>
    </div>
  );
}
