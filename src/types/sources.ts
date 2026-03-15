/**
 * Omterminal — Source Type Definitions
 *
 * Shared type definitions for the modular source system.
 * Used by all category files under src/config/sources/.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Source type enum
//
//   rss        — RSS or Atom feed
//   gnews      — GNews API query
//   arxiv      — arXiv preprint server feed
//   github     — GitHub releases / repo activity feed
//   social     — Social platform feed or account
//   regulation — Government / regulatory body feed
// ─────────────────────────────────────────────────────────────────────────────

export type SourceType =
  | 'rss'
  | 'gnews'
  | 'arxiv'
  | 'github'
  | 'social'
  | 'regulation';

// ─────────────────────────────────────────────────────────────────────────────
// Source category enum
//
//   news       — News media, newsletters, and industry analysis
//   company    — AI companies, model labs, and tech firm official blogs
//   research   — Academic institutions, preprint servers, research labs
//   developer  — Developer tools, open-source projects, GitHub releases
//   social     — Social media accounts and community feeds
//   policy     — Government bodies, regulators, and standards organisations
// ─────────────────────────────────────────────────────────────────────────────

export type SourceCategory =
  | 'news'
  | 'company'
  | 'research'
  | 'developer'
  | 'social'
  | 'policy';

// ─────────────────────────────────────────────────────────────────────────────
// Source definition
//
// Reliability score (1–10) guide:
//   10 — First-party company / model lab blog (direct source)
//    9 — Major research institution, government body
//    8 — Established news media outlet, official company tech blog
//    7 — Reputable VC firm or industry publication
//    6 — Industry blogs, newsletters, analyst commentary
//    5 — Social media or community sources
//
// Health metadata fields (lastSuccessAt, lastFailureAt, failureCount) are
// defined here for future monitoring integration but are NOT yet persisted.
// ─────────────────────────────────────────────────────────────────────────────

export interface SourceDefinition {
  /** Stable, machine-friendly identifier (snake_case) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Feed type describing how this source is ingested */
  type: SourceType;
  /** Logical category grouping for this source */
  category: SourceCategory;
  /** RSS/Atom/GitHub feed URL (required for rss, arxiv, github, regulation types) */
  url?: string;
  /** Search query string (required for gnews, arxiv query-based sources) */
  query?: string;
  /** Entity identifier for social/official account sources */
  entity?: string;
  /** Editorial reliability score (1–10) for signal scoring */
  reliability: number;
  /** Whether this source is actively ingested */
  enabled: boolean;

  // ── Health metadata (future use — not yet persisted) ──────────────────────
  /** ISO timestamp of the last successful fetch */
  lastSuccessAt?: string;
  /** ISO timestamp of the last fetch failure */
  lastFailureAt?: string;
  /** Consecutive failure count since last success */
  failureCount?: number;
}
