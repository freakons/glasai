/**
 * Unified Intelligence Event type.
 *
 * All intelligence trackers produce events conforming to this shape.
 * This enables unified feeds, search, and cross-category analysis.
 */

export type IntelligenceCategory =
  | 'model_release'
  | 'regulation'
  | 'funding'
  | 'company'
  | 'policy'
  | 'research'
  | 'product';

export type EventSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface IntelligenceEvent {
  /** Unique event identifier */
  id: string;

  /** Intelligence category */
  type: IntelligenceCategory;

  /** Associated company or entity */
  company: string;

  /** Event headline */
  title: string;

  /** ISO date string */
  date: string;

  /** Short summary (1-2 sentences) */
  summary: string;

  /** "So What For You" editorial analysis */
  analysis: string;

  /** Searchable tags */
  tags: string[];

  /** Signal importance */
  severity: EventSeverity;

  /** Source URL for verification */
  sourceUrl?: string;

  /** Whether the event has been verified against primary sources */
  verified: boolean;

  /** URL slug for detail page */
  slug: string;

  /** Country/region code (for regulation/policy) */
  region?: string;

  /** Structured metadata (amount for funding, benchmark for models, etc.) */
  metadata?: Record<string, string | number | boolean>;
}

/**
 * Convert any data type to an IntelligenceEvent.
 * Used by individual trackers to normalize their data.
 */
export function createEvent(
  partial: Omit<IntelligenceEvent, 'verified' | 'slug'> & { slug?: string; verified?: boolean }
): IntelligenceEvent {
  return {
    verified: false,
    slug: partial.slug || partial.id,
    ...partial,
  };
}
