import { ReactNode, CSSProperties } from 'react';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  /** Extra inline styles */
  style?: CSSProperties;
  /** Accent color shown as a top border line on hover */
  accent?: string;
  onClick?: () => void;
}

/**
 * GlassCard — the canonical glass-surface container.
 *
 * Glass spec:
 *   background: rgba(255,255,255,0.05)
 *   backdrop-filter: blur(10px) saturate(140%)
 *   border: 1px solid rgba(255,255,255,0.065)
 *   border-radius: 12px
 */
export function GlassCard({ children, className = '', style, accent, onClick }: GlassCardProps) {
  return (
    <div
      className={`gc ${className}`}
      style={{
        ...(accent ? ({ '--cc': accent } as CSSProperties) : {}),
        ...style,
      }}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
