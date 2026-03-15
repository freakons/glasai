/**
 * Omterminal — Source Registry (Master Index)
 *
 * Merges all category source lists into a single typed registry.
 * This is the canonical source of truth for the ingestion pipeline.
 *
 * To add sources: edit the appropriate category file, not this file.
 * To disable a source: set enabled: false in its category file.
 *
 * Category files:
 *   news.ts          — Tech media, newsletters, VC blogs
 *   companyBlogs.ts  — AI labs, major tech, infrastructure company blogs
 *   research.ts      — Academic institutions, arXiv, research hubs
 *   github.ts        — GitHub release feeds (developer tools, OSS projects)
 *   social.ts        — Social media and community feeds
 *   regulation.ts    — Government bodies and regulatory agencies
 */

import { newsSources } from './news';
import { companyBlogSources } from './companyBlogs';
import { researchSources } from './research';
import { githubSources } from './github';
import { socialSources } from './social';
import { regulationSources } from './regulation';
import type { SourceDefinition, SourceCategory } from '@/types/sources';

// ─────────────────────────────────────────────────────────────────────────────
// Master source list
// ─────────────────────────────────────────────────────────────────────────────

export const allSources: SourceDefinition[] = [
  ...companyBlogSources,
  ...researchSources,
  ...newsSources,
  ...githubSources,
  ...socialSources,
  ...regulationSources,
];

// ─────────────────────────────────────────────────────────────────────────────
// Re-export category arrays for consumers that need per-category access
// ─────────────────────────────────────────────────────────────────────────────

export {
  newsSources,
  companyBlogSources,
  researchSources,
  githubSources,
  socialSources,
  regulationSources,
};

export type { SourceDefinition, SourceCategory };

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
//
// getHighPrioritySources() treats reliability >= 8 as high-priority.
// These sources are fetched first in the ingestion pipeline so that the
// most important signals are captured even if the pipeline times out.
// ─────────────────────────────────────────────────────────────────────────────

/** Returns all enabled sources */
export function getEnabledSources(): SourceDefinition[] {
  return allSources.filter((s) => s.enabled);
}

/** Returns all enabled high-reliability sources (reliability >= 8) */
export function getHighPrioritySources(): SourceDefinition[] {
  return allSources.filter((s) => s.enabled && s.reliability >= 8);
}

/** Returns all enabled sources for a given category */
export function getSourcesByCategory(category: SourceCategory): SourceDefinition[] {
  return allSources.filter((s) => s.enabled && s.category === category);
}

/** Returns a source by its stable id, or undefined if not found */
export function getSourceById(id: string): SourceDefinition | undefined {
  return allSources.find((s) => s.id === id);
}
