/**
 * Omterminal — Intelligence Source Registry (Compatibility Layer)
 *
 * Derives the INTELLIGENCE_SOURCES array from the modular source registry
 * in src/config/sources/. This preserves backward compatibility for downstream
 * consumers (sourceTrust, rssFetcher, classifier) that depend on the legacy
 * SourceCategory taxonomy and reliabilityScore field.
 *
 * The canonical source of truth is now src/config/sources/index.ts.
 */

import {
  allSources,
  type SourceDefinition,
  type SourceCategory as NewSourceCategory,
} from './sources';

// ─────────────────────────────────────────────────────────────────────────────
// Legacy type definitions (preserved for downstream compatibility)
// ─────────────────────────────────────────────────────────────────────────────

export type SourceCategory =
  | 'model_lab'
  | 'big_tech'
  | 'research'
  | 'policy'
  | 'venture_capital'
  | 'industry_analysis';

export interface Source {
  id: string;
  name: string;
  category: SourceCategory;
  rss: string;
  region?: string;
  reliabilityScore?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Category mapping: new canonical → legacy
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_MAP: Record<NewSourceCategory, SourceCategory> = {
  company:   'model_lab',
  research:  'research',
  news:      'industry_analysis',
  developer: 'big_tech',
  social:    'industry_analysis',
  policy:    'policy',
};

// ─────────────────────────────────────────────────────────────────────────────
// Derived registry
// ─────────────────────────────────────────────────────────────────────────────

export const INTELLIGENCE_SOURCES: Source[] = allSources.map((s: SourceDefinition) => ({
  id: s.id,
  name: s.name,
  category: CATEGORY_MAP[s.category],
  rss: s.url ?? '',
  region: 'US',
  reliabilityScore: s.reliability,
}));

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns all sources for a given legacy category */
export function getSourcesByCategory(category: SourceCategory): Source[] {
  return INTELLIGENCE_SOURCES.filter((s) => s.category === category);
}

/** Returns a source by its stable id, or undefined if not found */
export function getSourceById(id: string): Source | undefined {
  return INTELLIGENCE_SOURCES.find((s) => s.id === id);
}

export default INTELLIGENCE_SOURCES;
