/** Signal category mapped to CSS class */
type SignalCategory = 'signals' | 'models' | 'funding' | 'regulation' | 'alerts';

/** Legacy/extended categories supported by the existing CSS */
type ExtendedCategory = SignalCategory | 'agents' | 'research' | 'product';

interface BadgeProps {
  /** The signal category determines badge color */
  category: ExtendedCategory;
  /** Display label — defaults to the category name */
  label?: string;
  className?: string;
}

/**
 * Badge — compact label for signal categorization.
 *
 * Color mapping:
 *   signals / agents → cyan
 *   models          → indigo/violet
 *   funding         → amber
 *   regulation / alerts → rose
 *   research        → sky
 *   product         → emerald
 */
export function Badge({ category, label, className = '' }: BadgeProps) {
  // Map signal categories to existing CSS classes
  const cssClass = category === 'signals' ? 'agents' : category;
  return (
    <span className={`badge ${cssClass} ${className}`}>
      {label ?? category}
    </span>
  );
}
