/**
 * Omterminal Layout Tokens
 * Shell dimensions used for the fixed sidebar, topbar, and ticker.
 * These mirror the CSS custom properties in globals.css.
 */

export const layout = {
  /** Fixed left sidebar width */
  sidebarWidth: '220px',
  /** Sticky top navigation bar height */
  topbarHeight: '52px',
  /** Scrolling intelligence ticker height */
  tickerHeight: '32px',
} as const;

/**
 * Layout CSS class helpers.
 * Use these class names to apply shell structure.
 *
 *   app           — root flex container
 *   sidebar       — fixed left panel
 *   main-content  — right content area (margin-left: --sidebar)
 *   topbar        — sticky top bar
 *   ticker        — scrolling news ticker strip
 *   content       — inner page padding container
 *   footer-bar    — fixed status bar at bottom
 */
export const layoutClasses = {
  app: 'app',
  sidebar: 'sidebar',
  mainContent: 'main-content',
  topbar: 'topbar',
  ticker: 'ticker',
  content: 'content',
  footerBar: 'footer-bar',
} as const;

/**
 * Grid layout helpers.
 */
export const gridClasses = {
  newsGrid: 'news-grid',
  govGrid: 'gov-grid',
  statsRow: 'stats-row',
  featureGrid: 'feature-grid',
} as const;
