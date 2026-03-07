import { ReactNode, CSSProperties } from 'react';

interface PanelProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Optional left-side accent gradient (CSS gradient string) */
  accentGradient?: string;
}

/**
 * Panel — a larger glass surface for content sections.
 *
 * Glass spec:
 *   background: rgba(255,255,255,0.05)
 *   backdrop-filter: blur(20px) saturate(160%)
 *   border: 1px solid rgba(255,255,255,0.065)
 *   border-radius: 16px
 *   padding: 24px
 *
 * When `accentGradient` is provided a 2.5px left-side border stripe is rendered,
 * matching the regulation/government card style.
 */
export function Panel({ children, className = '', style, accentGradient }: PanelProps) {
  return (
    <div
      className={`gc ${className}`}
      style={{
        padding: '24px',
        borderRadius: '16px',
        backdropFilter: 'var(--blur)',
        WebkitBackdropFilter: 'var(--blur)',
        position: 'relative',
        overflow: 'hidden',
        ...(accentGradient
          ? ({ '--gc': accentGradient } as CSSProperties)
          : {}),
        ...style,
      }}
    >
      {accentGradient && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            width: '2.5px',
            borderRadius: '0 2px 2px 0',
            background: accentGradient,
          }}
        />
      )}
      {children}
    </div>
  );
}
