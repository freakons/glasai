'use client';

import { useEffect, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SignalConfidenceMeterProps {
  /**
   * Confidence score from 0.0 to 1.0.
   * Values are clamped to the [0, 1] range before rendering.
   */
  confidence: number;
  /**
   * Optional extra class names applied to the root element.
   * Useful for overriding margin / width from a parent layout.
   */
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map a confidence score to the design-system fill colour.
 *  >= 0.80 → emerald  (strong signal)
 *  >= 0.60 → amber    (moderate signal)
 *  <  0.60 → muted    (weak / uncertain)
 */
function confidenceColor(confidence: number): string {
  if (confidence >= 0.8) return 'var(--emerald-l)';
  if (confidence >= 0.6) return 'var(--amber)';
  return 'var(--text3)';
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SignalConfidenceMeter — professional intelligence-style horizontal bar meter.
 *
 * Visualises a confidence score (0.0 – 1.0) with:
 * - A monospaced "Confidence" label
 * - A coloured fill bar that animates to width on mount
 * - A percentage readout aligned to the right of the bar
 *
 * Colour thresholds follow the design system signal palette:
 *   >= 80% → emerald  (strong)
 *   >= 60% → amber    (moderate)
 *   <  60% → muted    (weak)
 *
 * @example
 * <SignalConfidenceMeter confidence={0.86} />
 */
export function SignalConfidenceMeter({
  confidence,
  className = '',
}: SignalConfidenceMeterProps) {
  const clamped = Math.min(Math.max(confidence, 0), 1);
  const pct = Math.round(clamped * 100);
  const color = confidenceColor(clamped);

  // Animate bar width from 0 → pct on mount.
  // We defer the target width by one animation frame so the CSS transition fires.
  const [fillWidth, setFillWidth] = useState(0);

  useEffect(() => {
    const id = requestAnimationFrame(() => setFillWidth(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);

  return (
    <div
      className={className}
      style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}
    >
      {/* ── Label ─────────────────────────────────────────────────────────── */}
      <span
        style={{
          fontFamily: 'var(--fm)',
          fontSize: '9.5px',
          letterSpacing: '0.09em',
          textTransform: 'uppercase',
          color: 'var(--text2)',
        }}
      >
        Confidence
      </span>

      {/* ── Bar + percentage ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Muted track */}
        <div
          style={{
            flex: 1,
            height: '4px',
            borderRadius: '2px',
            background: 'rgba(255,255,255,0.07)',
            overflow: 'hidden',
          }}
        >
          {/* Coloured fill — animates width on mount */}
          <div
            style={{
              height: '100%',
              width: `${fillWidth}%`,
              borderRadius: '2px',
              background: color,
              transition: 'width 0.55s cubic-bezier(.4,0,.2,1)',
            }}
          />
        </div>

        {/* Percentage readout */}
        <span
          style={{
            fontFamily: 'var(--fm)',
            fontSize: '11px',
            color: 'var(--text)',
            minWidth: '32px',
            textAlign: 'right',
            flexShrink: 0,
          }}
        >
          {pct}%
        </span>
      </div>
    </div>
  );
}
