'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { parseCommand } from '../../terminal/commandParser';
import { routeCommand, type ResultLine } from '../../terminal/commandRouter';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface HistoryEntry {
  query: string;
  lines: ResultLine[];
  isError: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const EXAMPLE_COMMANDS = [
  'signals',
  'entity openai',
  'compare openai anthropic',
  'top entities',
  'snapshot',
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Result line renderer
// ─────────────────────────────────────────────────────────────────────────────

function lineClass(style: ResultLine['style']): string {
  switch (style) {
    case 'header':  return 'il-rl-header';
    case 'key':     return 'il-rl-key';
    case 'accent':  return 'il-rl-accent';
    case 'divider': return 'il-rl-divider';
    case 'warning': return 'il-rl-warning';
    case 'dim':     return 'il-rl-dim';
    case 'value':
    default:        return 'il-rl-value';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * CommandBar — bottom terminal input with intelligence query routing.
 *
 * Supported commands:
 *   signals                  — browse latest signals
 *   events                   — events from last 30 days
 *   entity <name>            — entity intelligence profile
 *   timeline <signal-id>     — signal event timeline
 *   snapshot                 — ecosystem overview
 *   compare <entity> <entity> — side-by-side comparison
 *   search <keyword>         — full-text search
 *   top entities             — rank by signal volume
 *   map                      — ecosystem map by sector
 *   explain <signal-id>      — deep signal analysis
 *   help                     — show all commands
 */
export function CommandBar() {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const resultsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll results to bottom whenever history grows
  useEffect(() => {
    if (resultsRef.current) {
      resultsRef.current.scrollTop = resultsRef.current.scrollHeight;
    }
  }, [history]);

  const submit = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;

    const command = parseCommand(trimmed);
    const result = routeCommand(command);

    const entry: HistoryEntry =
      result.type === 'lines'
        ? { query: trimmed, lines: result.lines, isError: false }
        : {
            query: trimmed,
            lines: [{ text: result.message, style: 'warning' }],
            isError: true,
          };

    setHistory((prev) => [...prev, entry]);
    setInputHistory((prev) => [trimmed, ...prev]);
    setHistoryIndex(-1);
    setInput('');
  }, [input]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
        return;
      }

      // Navigate input history with arrow keys
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const next = Math.min(historyIndex + 1, inputHistory.length - 1);
        setHistoryIndex(next);
        setInput(inputHistory[next] ?? '');
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = historyIndex - 1;
        if (next < 0) {
          setHistoryIndex(-1);
          setInput('');
        } else {
          setHistoryIndex(next);
          setInput(inputHistory[next] ?? '');
        }
        return;
      }

      // Escape clears results
      if (e.key === 'Escape') {
        setHistory([]);
        setHistoryIndex(-1);
        setInput('');
      }
    },
    [submit, historyIndex, inputHistory]
  );

  function fillHint(cmd: string) {
    setInput(cmd);
    inputRef.current?.focus();
  }

  return (
    <div className="il-cmd-zone">
      {/* Results panel — visible when there is history */}
      {history.length > 0 && (
        <div className="il-cmd-results" ref={resultsRef} aria-live="polite" aria-label="Command output">
          {history.map((entry, ei) => (
            <div key={ei} className="il-cmd-entry">
              <div className="il-cmd-prompt">
                <span className="il-cmd-chevron">&gt;</span>
                <span className="il-cmd-query">{entry.query}</span>
              </div>
              <div className={`il-cmd-output${entry.isError ? ' il-cmd-output--error' : ''}`}>
                {entry.lines.map((l, li) =>
                  l.text === '' ? (
                    <div key={li} className="il-rl-empty" />
                  ) : (
                    <div key={li} className={`il-rl ${lineClass(l.style)}`}>
                      {l.text}
                    </div>
                  )
                )}
              </div>
            </div>
          ))}
          <div className="il-cmd-results-hint">
            Press <kbd>Esc</kbd> to clear  ·  <kbd>↑ ↓</kbd> navigate history
          </div>
        </div>
      )}

      {/* Input bar */}
      <div className="il-cmd" role="search">
        <div className="il-cmd-input">
          {/* Terminal prompt icon */}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" x2="20" y1="19" y2="19" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="il-cmd-field"
            placeholder='Type a command or "help"…'
            aria-label="Intelligence command input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
          />
          {input && (
            <button
              className="il-cmd-clear"
              onClick={() => { setInput(''); inputRef.current?.focus(); }}
              aria-label="Clear input"
              tabIndex={-1}
            >
              ×
            </button>
          )}
        </div>

        <div className="il-cmd-hints" aria-label="Example commands">
          {EXAMPLE_COMMANDS.map((cmd) => (
            <span
              key={cmd}
              className="il-cmd-hint"
              role="button"
              tabIndex={0}
              onClick={() => fillHint(cmd)}
              onKeyDown={(e) => e.key === 'Enter' && fillHint(cmd)}
            >
              {cmd}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
