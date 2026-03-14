import { type ImpactLevel, computeImpact, type ImpactInput } from '@/lib/signals/impactScore';

// ─────────────────────────────────────────────────────────────────────────────
// Styles per impact level
// ─────────────────────────────────────────────────────────────────────────────

const LEVEL_STYLES: Record<ImpactLevel, { color: string; borderColor: string }> = {
  High: {
    color: 'var(--rose-l, #fb7185)',
    borderColor: 'rgba(225,29,72,0.35)',
  },
  Medium: {
    color: 'var(--amber-l, #fbbf24)',
    borderColor: 'rgba(217,119,6,0.35)',
  },
  Low: {
    color: 'var(--text3, rgba(255,255,255,0.4))',
    borderColor: 'var(--border2, rgba(255,255,255,0.08))',
  },
};

const BADGE_BASE: React.CSSProperties = {
  fontFamily: 'var(--fm)',
  fontSize: 9,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  padding: '2px 8px',
  borderRadius: 10,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  whiteSpace: 'nowrap',
  lineHeight: 1.4,
};

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface SignalImpactBadgeProps {
  /** Raw signal data used to compute impact. */
  signal: ImpactInput;
  /** Show the "Impact:" label prefix. Defaults to true. */
  showLabel?: boolean;
  /** Additional inline styles. */
  style?: React.CSSProperties;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SignalImpactBadge — compact, reusable badge that displays a signal's
 * derived impact level (High / Medium / Low).
 *
 * Visually distinct from confidence and corroboration indicators.
 * Designed for use in cards, rows, and detail headers.
 */
export function SignalImpactBadge({
  signal,
  showLabel = true,
  style,
}: SignalImpactBadgeProps) {
  const { level } = computeImpact(signal);
  const levelStyle = LEVEL_STYLES[level];

  return (
    <span
      style={{
        ...BADGE_BASE,
        color: levelStyle.color,
        border: `1px solid ${levelStyle.borderColor}`,
        ...style,
      }}
      title={`Signal impact: ${level}`}
    >
      {showLabel ? `Impact: ${level}` : level}
    </span>
  );
}
