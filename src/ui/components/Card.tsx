import { ReactNode, CSSProperties } from 'react';

type CardVariant = 'default' | 'featured' | 'stat';

interface CardProps {
  children: ReactNode;
  variant?: CardVariant;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
}

/**
 * Card — surface variants for intelligence feed items.
 *
 * - default: standard glass news/regulation card (.nc)
 * - featured: elevated, gradient-bordered highlight card (.featured)
 * - stat: metric display card (.stat)
 */
export function Card({ children, variant = 'default', className = '', style, onClick }: CardProps) {
  const base = variant === 'featured' ? 'featured' : variant === 'stat' ? 'stat' : 'nc';
  return (
    <div className={`${base} ${className}`} style={style} onClick={onClick}>
      {children}
    </div>
  );
}
