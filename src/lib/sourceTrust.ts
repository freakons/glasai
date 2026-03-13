/**
 * Omterminal — Source Trust Scoring
 *
 * Centralized, deterministic trust model for intelligence sources.  Assigns a
 * normalized trust score (0–100) to any source based on its classification,
 * registry reliability rating, and domain-level heuristics.
 *
 * Design principles:
 *   • Deterministic — no ML, no external I/O.  Same inputs → same output.
 *   • Explainable — every score comes with a human-readable reason.
 *   • Bounded — scores are always 0–100 integers.
 *   • Extensible — add new source types or domain rules without restructuring.
 *   • Safe for unknown sources — unregistered sources get a sensible mid-range
 *     baseline, not zero.
 *
 * Terminology:
 *   sourceType     — categorical classification of the source's role/authority
 *   trustScore     — normalized 0–100 integer reflecting overall credibility
 *   trustTier      — human-readable label (authoritative / high / standard / low / unknown)
 */

import {
  INTELLIGENCE_SOURCES,
  getSourceById,
  type Source,
  type SourceCategory,
} from '@/config/intelligenceSources';

// ─────────────────────────────────────────────────────────────────────────────
// Source type classification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Source type describes the editorial authority / proximity to truth of a
 * source.  Ordered from most authoritative to least.
 *
 *   primary_official   — first-party blog / announcement from the entity itself
 *   government         — government body, regulator, standards org
 *   academic           — university lab, peer-reviewed journal, preprint server
 *   major_media        — established technology / business media outlet
 *   specialist         — independent analyst, newsletter, niche expert
 *   aggregator         — news aggregator, content syndicator, data tracker
 *   unknown            — source not in the registry and not matched by heuristics
 */
export type SourceType =
  | 'primary_official'
  | 'government'
  | 'academic'
  | 'major_media'
  | 'specialist'
  | 'aggregator'
  | 'unknown';

/**
 * Human-readable trust tier derived from the numeric score.
 */
export type TrustTier =
  | 'authoritative'  // 85–100
  | 'high'           // 70–84
  | 'standard'       // 50–69
  | 'low'            // 25–49
  | 'unknown';       // 0–24

// ─────────────────────────────────────────────────────────────────────────────
// Baseline trust scores per source type
//
// These are the "floor" scores before registry reliability adjustment.
// A source in the registry may score higher if its reliabilityScore warrants
// it; a source NOT in the registry will land at the baseline for its
// inferred type (or the 'unknown' baseline).
// ─────────────────────────────────────────────────────────────────────────────

const SOURCE_TYPE_BASELINES: Record<SourceType, number> = {
  primary_official: 85,
  government:       90,
  academic:         82,
  major_media:      70,
  specialist:       65,
  aggregator:       55,
  unknown:          40,
};

// ─────────────────────────────────────────────────────────────────────────────
// Source category → source type mapping
//
// Maps the existing SourceCategory from intelligenceSources.ts to the new
// SourceType taxonomy.  This avoids requiring a schema migration for the
// source registry while still enabling the new trust model.
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_TO_SOURCE_TYPE: Record<SourceCategory, SourceType> = {
  model_lab:          'primary_official',
  big_tech:           'primary_official',
  research:           'academic',
  policy:             'government',
  venture_capital:    'specialist',
  industry_analysis:  'major_media',
};

// ─────────────────────────────────────────────────────────────────────────────
// Domain heuristics for unregistered sources
//
// When a source is not in the registry, we attempt to infer its type from
// the source name or domain.  This is a small deterministic ruleset — not
// an exhaustive classifier.  Unknown sources that don't match any rule
// remain 'unknown' (which is fine; unknown ≠ junk).
// ─────────────────────────────────────────────────────────────────────────────

interface DomainRule {
  /** Substring or regex pattern matched against lowercased source name / URL */
  pattern: string | RegExp;
  /** Source type to assign when matched */
  type: SourceType;
  /** Baseline trust override (optional; uses SOURCE_TYPE_BASELINES if omitted) */
  baseline?: number;
}

const DOMAIN_HEURISTICS: DomainRule[] = [
  // Government / regulatory bodies
  { pattern: /\b(gov|government|whitehouse|parliament|congress|senate)\b/i, type: 'government' },
  { pattern: /\b(nist|oecd|eu\.europa|ec\.europa|fcc|ftc|sec\.gov)\b/i, type: 'government' },

  // Academic / research
  { pattern: /\b(arxiv|ssrn|acm\.org|ieee|nature\.com|science\.org)\b/i, type: 'academic' },
  { pattern: /\b(university|\.edu|\.ac\.uk|csail|stanford|berkeley|mit)\b/i, type: 'academic' },
  { pattern: /\b(distill\.pub|openreview)\b/i, type: 'academic' },

  // Primary official (company blogs)
  { pattern: /\b(openai\.com|anthropic\.com|deepmind|meta\.com\/ai|mistral\.ai)\b/i, type: 'primary_official' },
  { pattern: /\b(nvidia\.com|microsoft\.com|apple\.com|google\.com|aws\.amazon)\b/i, type: 'primary_official' },

  // Major media
  { pattern: /\b(techcrunch|venturebeat|theverge|wired|arstechnica)\b/i, type: 'major_media' },
  { pattern: /\b(reuters|bloomberg|nytimes|wsj|ft\.com|bbc)\b/i, type: 'major_media' },
  { pattern: /\b(technologyreview|semafor|theinformation)\b/i, type: 'major_media' },

  // Specialist / newsletter / analyst
  { pattern: /\b(substack\.com|newsletter|analyst)\b/i, type: 'specialist' },
  { pattern: /\b(stratechery|importai|interconnects|aisnakeoil)\b/i, type: 'specialist' },

  // Aggregators / data trackers
  { pattern: /\b(crunchbase|pitchbook|cbinsights|hackernews|reddit)\b/i, type: 'aggregator' },
  { pattern: /\b(techmeme|feedly|flipboard|googlenews)\b/i, type: 'aggregator' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Trust result
// ─────────────────────────────────────────────────────────────────────────────

export interface SourceTrustResult {
  /** Normalized trust score (0–100) */
  trustScore: number;
  /** Categorical source type */
  sourceType: SourceType;
  /** Human-readable trust tier */
  trustTier: TrustTier;
  /** Whether this source was found in the curated registry */
  isRegistered: boolean;
  /** Human-readable explanation of why this score was assigned */
  reason: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core scoring logic
// ─────────────────────────────────────────────────────────────────────────────

/** Clamp a number to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Derive TrustTier from a numeric score. */
export function scoreToTier(score: number): TrustTier {
  if (score >= 85) return 'authoritative';
  if (score >= 70) return 'high';
  if (score >= 50) return 'standard';
  if (score >= 25) return 'low';
  return 'unknown';
}

/**
 * Infer source type from a source name or URL using domain heuristics.
 * Returns 'unknown' if no rule matches.
 */
export function inferSourceType(sourceNameOrUrl: string): SourceType {
  if (!sourceNameOrUrl) return 'unknown';
  const lower = sourceNameOrUrl.toLowerCase();
  for (const rule of DOMAIN_HEURISTICS) {
    if (typeof rule.pattern === 'string') {
      if (lower.includes(rule.pattern.toLowerCase())) return rule.type;
    } else {
      if (rule.pattern.test(lower)) return rule.type;
    }
  }
  return 'unknown';
}

/**
 * Compute the source trust score for a given source identifier.
 *
 * Scoring algorithm:
 *   1. Check the curated registry by source ID and by source name.
 *   2. If found: derive sourceType from the registry category, compute trust
 *      as a blend of the type baseline and the registry's reliabilityScore.
 *   3. If not found: infer sourceType via domain heuristics, use the type
 *      baseline as the trust score.
 *   4. Clamp the result to [0, 100].
 *
 * The blending formula for registered sources:
 *   trustScore = baseline * 0.4 + (reliabilityScore / 10 * 100) * 0.6
 *
 * This ensures the source type sets a floor (a government source can't drop
 * below ~36 even with reliability=1) while the editorial reliability rating
 * has majority influence on the final score.
 *
 * @param sourceIdOrName  Source ID (from registry), source name, or domain/URL.
 * @returns               Full trust result with score, type, tier, and reason.
 */
export function computeSourceTrust(sourceIdOrName: string): SourceTrustResult {
  if (!sourceIdOrName || !sourceIdOrName.trim()) {
    return {
      trustScore: SOURCE_TYPE_BASELINES.unknown,
      sourceType: 'unknown',
      trustTier: scoreToTier(SOURCE_TYPE_BASELINES.unknown),
      isRegistered: false,
      reason: 'Empty or missing source identifier',
    };
  }

  const trimmed = sourceIdOrName.trim();

  // ── 1. Try registry lookup by ID ──────────────────────────────────────────
  const registryById = getSourceById(trimmed);
  if (registryById) {
    return scoreRegisteredSource(registryById);
  }

  // ── 2. Try registry lookup by name (case-insensitive) ─────────────────────
  const lowerName = trimmed.toLowerCase();
  const registryByName = INTELLIGENCE_SOURCES.find(
    (s) => s.name.toLowerCase() === lowerName
  );
  if (registryByName) {
    return scoreRegisteredSource(registryByName);
  }

  // ── 3. Heuristic inference for unregistered sources ────────────────────────
  const inferredType = inferSourceType(trimmed);
  const baseline = SOURCE_TYPE_BASELINES[inferredType];

  return {
    trustScore: baseline,
    sourceType: inferredType,
    trustTier: scoreToTier(baseline),
    isRegistered: false,
    reason: inferredType === 'unknown'
      ? `Unregistered source "${trimmed}" — no heuristic match; assigned default baseline`
      : `Unregistered source "${trimmed}" — inferred as ${inferredType} via domain heuristics`,
  };
}

/** Score a source that was found in the curated registry. */
function scoreRegisteredSource(source: Source): SourceTrustResult {
  const sourceType = CATEGORY_TO_SOURCE_TYPE[source.category] ?? 'unknown';
  const baseline = SOURCE_TYPE_BASELINES[sourceType];
  const reliability = source.reliabilityScore ?? 5; // default mid-range

  // Blend: 40% type baseline + 60% reliability rating (scaled to 0–100)
  const reliabilityScaled = (reliability / 10) * 100;
  const raw = baseline * 0.4 + reliabilityScaled * 0.6;
  const trustScore = clamp(Math.round(raw), 0, 100);

  return {
    trustScore,
    sourceType,
    trustTier: scoreToTier(trustScore),
    isRegistered: true,
    reason: `Registered source "${source.name}" (${source.category}): `
      + `type baseline=${baseline}, reliability=${reliability}/10 → score=${trustScore}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the average trust score for a set of source identifiers.
 * Returns the unknown baseline when the list is empty.
 */
export function computeAverageSourceTrust(sourceIds: string[]): number {
  if (sourceIds.length === 0) return SOURCE_TYPE_BASELINES.unknown;
  const total = sourceIds.reduce(
    (sum, id) => sum + computeSourceTrust(id).trustScore,
    0,
  );
  return Math.round(total / sourceIds.length);
}

/**
 * Compute a weighted source trust score that applies diminishing returns
 * similar to source diversity scoring.  Useful when multiple sources support
 * a signal — the first high-trust source has the most impact, additional
 * sources add confidence but with decreasing marginal contribution.
 *
 * Formula: max_trust * 0.6 + mean_trust * 0.4
 */
export function computeWeightedSourceTrust(sourceIds: string[]): number {
  if (sourceIds.length === 0) return SOURCE_TYPE_BASELINES.unknown;
  const scores = sourceIds.map((id) => computeSourceTrust(id).trustScore);
  const maxTrust = Math.max(...scores);
  const meanTrust = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.round(maxTrust * 0.6 + meanTrust * 0.4);
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports for downstream integration
// ─────────────────────────────────────────────────────────────────────────────

export { SOURCE_TYPE_BASELINES };
