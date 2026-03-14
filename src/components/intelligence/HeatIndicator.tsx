import type { HeatLevel } from '@/lib/intelligence/heatScore';

// ─────────────────────────────────────────────────────────────────────────────
// Styles per heat level
// ─────────────────────────────────────────────────────────────────────────────

const HEAT_COLORS: Record<HeatLevel, string> = {
  0: 'var(--text3, rgba(255,255,255,0.25))',
  1: 'var(--text2, rgba(255,255,255,0.5))',
  2: 'var(--amber-l, #fbbf24)',
  3: 'var(--rose-l, #fb7185)',
};

const HEAT_LABELS: Record<HeatLevel, string> = {
  0: 'Quiet',
  1: 'Light',
  2: 'Moderate',
  3: 'High',
};

const MAX_BARS = 3;
const BAR_CHAR_FILLED = '█';
const BAR_CHAR_EMPTY = '░';

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface HeatIndicatorProps {
  level: HeatLevel;
  /** Show the "Activity:" label prefix. Defaults to true. */
  showLabel?: boolean;
  style?: React.CSSProperties;
}

/**
 * HeatIndicator — compact, terminal-style activity intensity indicator.
 *
 * Renders filled/empty block characters to convey heat at a glance:
 *   ███  = high activity
 *   ██░  = moderate
 *   █░░  = light
 *   ░░░  = quiet
 */
export function HeatIndicator({
  level,
  showLabel = true,
  style,
}: HeatIndicatorProps) {
  const filled = level;
  const empty = MAX_BARS - filled;
  const color = HEAT_COLORS[level];
  const label = HEAT_LABELS[level];

  return (
    <span
      style={{
        fontFamily: 'var(--fm)',
        fontSize: 9,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        whiteSpace: 'nowrap',
        lineHeight: 1.4,
        color,
        ...style,
      }}
      title={`Activity: ${label}`}
      aria-label={`Activity level: ${label}`}
    >
      {showLabel && (
        <span style={{ opacity: 0.7, fontSize: 8 }}>Activity</span>
      )}
      <span style={{ letterSpacing: '0.04em', fontSize: 10 }}>
        {BAR_CHAR_FILLED.repeat(filled)}
        <span style={{ opacity: 0.3 }}>{BAR_CHAR_EMPTY.repeat(empty)}</span>
      </span>
    </span>
  );
}
