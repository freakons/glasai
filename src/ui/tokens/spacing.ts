/**
 * Omterminal Spacing System
 * Consistent spacing scale used across all UI surfaces.
 * Values correspond to the --spacing-* CSS custom properties in globals.css.
 */

export const spacing = {
  /** 4px — tight gaps, icon padding */
  xs: '4px',
  /** 8px — compact elements, badge padding */
  sm: '8px',
  /** 16px — standard component padding */
  md: '16px',
  /** 24px — card padding, section gaps */
  lg: '24px',
  /** 32px — panel padding, hero gaps */
  xl: '32px',
  /** 48px — hero padding, section separators */
  '2xl': '48px',
} as const;

export type SpacingScale = keyof typeof spacing;

/** Numeric pixel values (useful for calculations) */
export const spacingPx = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
} as const;
