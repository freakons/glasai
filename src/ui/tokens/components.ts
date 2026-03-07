/**
 * Omterminal Component Tokens
 * Base design tokens for reusable UI surfaces.
 * These reference CSS custom properties from globals.css.
 */

import { colors } from './colors';

/** Glass surface base style */
export const glassSurface = {
  background: 'rgba(255,255,255,0.05)',
  backdropFilter: 'blur(10px) saturate(140%)',
  WebkitBackdropFilter: 'blur(10px) saturate(140%)',
  border: `1px solid ${colors.border}`,
  borderRadius: '12px',
} as const;

/** Card tokens */
export const card = {
  padding: '18px',
  borderRadius: '12px',
  background: 'var(--glass)',
  border: '1px solid var(--border)',
  transition: 'all 0.18s cubic-bezier(.4,0,.2,1)',
  hoverBackground: 'var(--glass2)',
  hoverBorder: '1px solid var(--border2)',
  hoverTransform: 'translateY(-3px)',
  hoverShadow: '0 14px 40px rgba(0,0,0,0.42)',
} as const;

/** Panel tokens — larger, prominent surfaces */
export const panel = {
  padding: '24px',
  borderRadius: '16px',
  background: 'var(--glass)',
  border: '1px solid var(--border)',
  backdropFilter: 'var(--blur)',
  WebkitBackdropFilter: 'var(--blur)',
} as const;

/** Button variant tokens */
export const button = {
  primary: {
    fontFamily: 'var(--fm)',
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    padding: '11px 22px',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #4f46e5, #06b6d4)',
    color: '#fff',
    border: 'none',
    boxShadow: '0 8px 24px rgba(79,70,229,0.35)',
    cursor: 'pointer',
  },
  secondary: {
    fontFamily: 'var(--fm)',
    fontSize: '11px',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    padding: '11px 22px',
    borderRadius: '8px',
    background: 'var(--glass2)',
    border: '1px solid var(--border2)',
    color: 'var(--text2)',
    cursor: 'pointer',
  },
  ghost: {
    fontFamily: 'var(--fm)',
    fontSize: '9.5px',
    letterSpacing: '0.05em',
    padding: '5px 11px',
    borderRadius: '7px',
    border: '1px solid var(--border)',
    background: 'var(--glass)',
    color: 'var(--text2)',
    cursor: 'pointer',
  },
} as const;

/** Badge tokens by signal category */
export const badge = {
  signals: {
    color: 'var(--cyan-l)',
    borderColor: 'rgba(6,182,212,0.3)',
    background: 'rgba(6,182,212,0.1)',
  },
  models: {
    color: 'var(--violet-l)',
    borderColor: 'rgba(124,58,237,0.3)',
    background: 'rgba(124,58,237,0.1)',
  },
  funding: {
    color: 'var(--amber-l)',
    borderColor: 'rgba(217,119,6,0.3)',
    background: 'rgba(217,119,6,0.1)',
  },
  regulation: {
    color: 'var(--rose-l)',
    borderColor: 'rgba(225,29,72,0.3)',
    background: 'rgba(225,29,72,0.1)',
  },
  alerts: {
    color: 'var(--rose-l)',
    borderColor: 'rgba(225,29,72,0.3)',
    background: 'rgba(225,29,72,0.14)',
  },
} as const;

/** Status indicator states */
export const statusIndicator = {
  live: {
    background: 'var(--emerald-l)',
    boxShadow: '0 0 7px var(--emerald)',
    animation: 'ping 1.6s ease-in-out infinite',
  },
  pending: {
    background: 'var(--amber-l)',
  },
  passed: {
    background: 'var(--sky-l)',
  },
  inactive: {
    background: 'var(--text3)',
  },
} as const;

export type ButtonVariant = keyof typeof button;
export type BadgeCategory = keyof typeof badge;
export type StatusState = keyof typeof statusIndicator;
