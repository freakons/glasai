import type { EntityMomentumResult } from '@/lib/entities/computeEntityMomentum';

const LABEL_STYLES: Record<string, { color: string; border: string; arrow: string }> = {
  Surging: { color: 'var(--amber-l)', border: 'rgba(217,119,6,0.4)', arrow: '\u2191\u2191' },
  Rising:  { color: 'var(--emerald-l)', border: 'rgba(16,185,129,0.4)', arrow: '\u2191' },
  Stable:  { color: 'var(--text3)', border: 'var(--border2)', arrow: '\u2192' },
  Cooling: { color: 'var(--sky-l, var(--text3))', border: 'var(--border2)', arrow: '\u2193' },
};

interface EntityMomentumBadgeProps {
  result: EntityMomentumResult;
  showScore?: boolean;
}

export function EntityMomentumBadge({ result, showScore = true }: EntityMomentumBadgeProps) {
  const style = LABEL_STYLES[result.momentumLabel] ?? LABEL_STYLES.Stable;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: 'var(--fm)',
        fontSize: 9,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: style.color,
        padding: '2px 8px',
        borderRadius: 10,
        border: `1px solid ${style.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      <span>{style.arrow}</span>
      <span>{result.momentumLabel}</span>
      {showScore && (
        <span style={{ opacity: 0.7 }}>{result.momentumScore}</span>
      )}
    </span>
  );
}
