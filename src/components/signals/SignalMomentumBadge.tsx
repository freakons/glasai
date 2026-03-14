import { type MomentumLevel, computeMomentum, type MomentumInput } from '@/lib/signals/momentumScore';

// ─────────────────────────────────────────────────────────────────────────────
// Styles per momentum level
// ─────────────────────────────────────────────────────────────────────────────

const LEVEL_CONFIG: Record<MomentumLevel, { label: string; symbol: string; color: string; borderColor: string }> = {
  new: {
    label: 'New',
    symbol: '✦',
    color: 'var(--indigo-l, #818cf8)',
    borderColor: 'rgba(99,102,241,0.35)',
  },
  rising: {
    label: 'Rising',
    symbol: '↑',
    color: 'var(--emerald-l, #34d399)',
    borderColor: 'rgba(5,150,105,0.35)',
  },
  stable: {
    label: 'Stable',
    symbol: '→',
    color: 'var(--text3, rgba(255,255,255,0.4))',
    borderColor: 'var(--border2, rgba(255,255,255,0.08))',
  },
  cooling: {
    label: 'Cooling',
    symbol: '↓',
    color: 'var(--sky-l, #38bdf8)',
    borderColor: 'rgba(14,165,233,0.35)',
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

interface SignalMomentumBadgeProps {
  /** Activity counts used to derive momentum. */
  momentum: MomentumInput;
  /** Show the "Momentum:" label prefix. Defaults to true. */
  showLabel?: boolean;
  /** Show recent/previous counts as a tooltip detail. Defaults to true. */
  showCounts?: boolean;
  /** Additional inline styles. */
  style?: React.CSSProperties;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SignalMomentumBadge — compact, reusable badge that displays a signal's
 * derived momentum level (New / Rising / Stable / Cooling).
 *
 * Visually distinct from impact, confidence, and corroboration indicators.
 * Designed for use in cards, rows, and detail headers.
 */
export function SignalMomentumBadge({
  momentum,
  showLabel = true,
  showCounts = true,
  style,
}: SignalMomentumBadgeProps) {
  const { level } = computeMomentum(momentum);
  const config = LEVEL_CONFIG[level];

  const title = showCounts
    ? `Momentum: ${config.label} — ${momentum.recentCount} events in last 7 days vs ${momentum.previousCount} in prior 7 days.`
    : `Momentum: ${config.label} — Recent activity compared to the previous 7-day window.`;

  return (
    <span
      style={{
        ...BADGE_BASE,
        color: config.color,
        border: `1px solid ${config.borderColor}`,
        ...style,
      }}
      title={title}
    >
      <span style={{ fontSize: 10, lineHeight: 1 }}>{config.symbol}</span>
      {showLabel ? config.label : `${config.symbol} ${config.label}`}
    </span>
  );
}
