/**
 * Omterminal — Intelligence Source Registry (Compatibility Layer)
 *
 * Derives the INTELLIGENCE_SOURCES array from the canonical source registry
 * in sources.ts. This preserves backward compatibility for downstream
 * consumers (sourceTrust, rssFetcher, classifier) that depend on the legacy
 * SourceCategory taxonomy and reliabilityScore field.
 *
 * The canonical source of truth is now src/config/sources.ts.
 */

import {
  SOURCES,
  type Source as CanonicalSource,
  type SourceCategory as CanonicalCategory,
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

const CATEGORY_MAP: Record<CanonicalCategory, SourceCategory> = {
  company: 'model_lab',
  research: 'research',
  media: 'industry_analysis',
  funding: 'venture_capital',
  policy: 'policy',
  infrastructure: 'big_tech',
};

// ─────────────────────────────────────────────────────────────────────────────
// Priority → reliability score mapping
// ─────────────────────────────────────────────────────────────────────────────

function priorityToReliability(priority: CanonicalSource['priority']): number {
  return priority === 'high' ? 9 : 7;
}

// ─────────────────────────────────────────────────────────────────────────────
// Derived registry
// ─────────────────────────────────────────────────────────────────────────────

export const INTELLIGENCE_SOURCES: Source[] = SOURCES.map((s) => ({
  id: s.id,
  name: s.name,
  category: CATEGORY_MAP[s.category],
  rss: s.rss,
  region: 'US',
  reliabilityScore: priorityToReliability(s.priority),
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
