'use client';

import type { SignalContext } from '@/types/intelligence';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface SignalContextPreviewProps {
  /** Signal context object — may be null/undefined when context is unavailable. */
  context: SignalContext | null | undefined;
  /** Whether the preview panel is currently expanded. */
  expanded: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback
// ─────────────────────────────────────────────────────────────────────────────

const FALLBACK_MESSAGE = 'Context details are still being processed.';

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SignalContextPreview — lightweight inline preview of signal context.
 *
 * Shows "Why it matters" and implications without requiring navigation
 * to the full signal detail page.  Designed for reuse across:
 *   - Intelligence feed (SignalCard)
 *   - Signals browser
 *   - Watchlist activity feed
 *   - Entity pages
 *
 * Renders nothing when collapsed (`expanded === false`).
 */
export function SignalContextPreview({ context, expanded }: SignalContextPreviewProps) {
  if (!expanded) return null;

  const hasContext = context != null;
  const whyItMatters = context?.whyItMatters;
  const implications = Array.isArray(context?.implications) ? context.implications : [];
  const sourceBasis = context?.sourceBasis;

  const hasContent = Boolean(whyItMatters) || implications.length > 0 || Boolean(sourceBasis);

  return (
    <div
      className="scp"
      role="region"
      aria-label="Signal context preview"
    >
      {/* Empty state */}
      {(!hasContext || !hasContent) && (
        <p className="scp-fallback">{FALLBACK_MESSAGE}</p>
      )}

      {/* Why it matters */}
      {whyItMatters && (
        <div className="scp-section">
          <div className="scp-label">Why it matters</div>
          <div className="scp-text">{whyItMatters}</div>
        </div>
      )}

      {/* Implications */}
      {implications.length > 0 && (
        <div className="scp-section">
          <div className="scp-label">Implications</div>
          <ul className="scp-list">
            {implications.map((imp, i) => (
              <li key={i} className="scp-list-item">
                <span className="scp-arrow">→</span>
                {imp}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Source basis snippet */}
      {sourceBasis && (
        <div className="scp-section">
          <div className="scp-label">Source basis</div>
          <div className="scp-text scp-text--muted">{sourceBasis}</div>
        </div>
      )}
    </div>
  );
}
