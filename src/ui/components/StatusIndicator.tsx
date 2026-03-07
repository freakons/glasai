type StatusState = 'live' | 'pending' | 'passed' | 'inactive';

interface StatusIndicatorProps {
  state?: StatusState;
  label?: string;
  className?: string;
}

const stateClass: Record<StatusState, string> = {
  live: 'active',
  pending: 'pending',
  passed: 'passed',
  inactive: '',
};

/**
 * StatusIndicator — a semantic status dot.
 *
 * - live:     emerald, pulsing ring animation
 * - pending:  amber, static
 * - passed:   sky blue, static
 * - inactive: muted, static
 *
 * Optionally renders a text label next to the dot.
 */
export function StatusIndicator({ state = 'live', label, className = '' }: StatusIndicatorProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 ${className}`}
      aria-label={label ?? state}
    >
      <span className={`sdot ${stateClass[state]}`} />
      {label && (
        <span
          style={{
            fontFamily: 'var(--fm)',
            fontSize: '10px',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text2)',
          }}
        >
          {label}
        </span>
      )}
    </span>
  );
}
