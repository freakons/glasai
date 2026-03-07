/**
 * Omterminal Color System
 * Professional intelligence workstation palette.
 * These values correspond to the @theme tokens defined in globals.css.
 */

export const colors = {
  // ── Primary backgrounds ───────────────────────────────────────────
  primary: '#0A2540',
  ink: '#05050f',
  ink2: '#0a0a1a',

  // ── Glass surfaces ────────────────────────────────────────────────
  glass: 'rgba(255,255,255,0.032)',
  glass2: 'rgba(255,255,255,0.055)',
  glass3: 'rgba(255,255,255,0.085)',

  // ── Borders ───────────────────────────────────────────────────────
  border: 'rgba(255,255,255,0.065)',
  border2: 'rgba(255,255,255,0.115)',
  border3: 'rgba(255,255,255,0.18)',

  // ── Text ──────────────────────────────────────────────────────────
  text: '#eeeef8',
  text2: '#8888a8',
  text3: '#44445a',

  // ── Signal colors ─────────────────────────────────────────────────
  signals: {
    /** Intelligence signals — cyan */
    signals: { base: '#06b6d4', light: '#67e8f9' },
    /** AI model releases — purple */
    models: { base: '#7c3aed', light: '#a78bfa' },
    /** Funding events — green */
    funding: { base: '#059669', light: '#34d399' },
    /** Regulatory updates — amber */
    regulation: { base: '#d97706', light: '#fbbf24' },
    /** Critical alerts — red */
    alerts: { base: '#e11d48', light: '#fb7185' },
  },

  // ── Extended palette (used by existing CSS) ───────────────────────
  indigo: '#4f46e5',
  indigoLight: '#818cf8',
  cyan: '#06b6d4',
  cyanLight: '#67e8f9',
  violet: '#7c3aed',
  violetLight: '#a78bfa',
  amber: '#d97706',
  amberLight: '#fbbf24',
  rose: '#e11d48',
  roseLight: '#fb7185',
  emerald: '#059669',
  emeraldLight: '#34d399',
  sky: '#0284c7',
  skyLight: '#38bdf8',
} as const;

export type SignalCategory = keyof typeof colors.signals;
