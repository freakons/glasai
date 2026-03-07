/**
 * Omterminal Typography System
 * Defines the type scale for each UI context.
 * Fonts: DM Mono (terminal/labels), Instrument Serif (display), DM Sans (body)
 */

export const fontFamilies = {
  sans: "'DM Sans', sans-serif",
  display: "'Instrument Serif', Georgia, serif",
  mono: "'DM Mono', monospace",
} as const;

export const typography = {
  /**
   * Terminal header — monospace, uppercase, wide tracking.
   * Used for the topbar identity, live indicators, and system labels.
   */
  terminalHeader: {
    fontFamily: fontFamilies.mono,
    fontSize: '8.5px',
    fontWeight: '600',
    letterSpacing: '0.14em',
    textTransform: 'uppercase' as const,
    lineHeight: '1',
  },

  /**
   * Page titles — display serif, large, italic.
   * Used for h1 headings on each section page.
   */
  pageTitle: {
    fontFamily: fontFamilies.display,
    fontSize: '30px',
    fontStyle: 'italic' as const,
    fontWeight: '400',
    letterSpacing: '-0.02em',
    lineHeight: '1.15',
  },

  /**
   * Section titles — display serif, medium, italic.
   * Used for card headlines and sub-section h2s.
   */
  sectionTitle: {
    fontFamily: fontFamilies.display,
    fontSize: '18px',
    fontStyle: 'italic' as const,
    fontWeight: '400',
    letterSpacing: '-0.01em',
    lineHeight: '1.3',
  },

  /**
   * Body text — sans, readable size.
   * Used for article summaries and general content.
   */
  body: {
    fontFamily: fontFamilies.sans,
    fontSize: '13.5px',
    fontWeight: '400',
    letterSpacing: '0',
    lineHeight: '1.7',
  },

  /**
   * Metadata — mono, small.
   * Used for timestamps, source tags, and secondary info.
   */
  metadata: {
    fontFamily: fontFamilies.mono,
    fontSize: '10.5px',
    fontWeight: '400',
    letterSpacing: '0.04em',
    lineHeight: '1.4',
  },

  /**
   * Labels — mono, extra small, uppercase.
   * Used for badge text, filter pills, and nav section headers.
   */
  label: {
    fontFamily: fontFamilies.mono,
    fontSize: '9px',
    fontWeight: '700',
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    lineHeight: '1',
  },
} as const;

export type TypographyScale = keyof typeof typography;
