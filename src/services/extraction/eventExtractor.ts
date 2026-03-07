/**
 * Omterminal — Event Extractor
 *
 * Converts normalised Articles into structured intelligence Events.
 * Events are the primary output of the extraction layer and power
 * the intelligence signals engine downstream.
 *
 * Architecture:
 *   RSS ingestion → normalization → extractEventsFromArticle() → signals engine
 *
 * Detection strategy:
 *   Rule-based keyword matching against title + content, combined with
 *   the article's normalizedCategory and detected entity lists.
 *   Multiple event types can be extracted from a single article.
 */

import type { Article, Event, EventType } from '../../types/intelligence';

// ─────────────────────────────────────────────────────────────────────────────
// Keyword rule definitions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps each supported EventType to a set of trigger keywords.
 * Matching is case-insensitive and whole-substring (not whole-word only,
 * so "launches" matches "launch").
 */
const EVENT_KEYWORDS: Record<string, { type: EventType; triggers: string[] }> = {
  model_release: {
    type: 'model_release',
    triggers: [
      'launch',
      'launches',
      'release',
      'releases',
      'released',
      'introduces',
      'introduce',
      'announces model',
      'new model',
      'model update',
      'rolls out',
    ],
  },
  funding: {
    type: 'funding',
    triggers: [
      'raises',
      'raised',
      'funding',
      'investment',
      'invested',
      'series a',
      'series b',
      'series c',
      'series d',
      'seed round',
      'venture capital',
      'valuation',
      'led by',
    ],
  },
  regulation: {
    type: 'regulation',
    triggers: [
      'regulation',
      'regulate',
      'regulatory',
      'policy',
      'legislation',
      'law',
      'ai act',
      'executive order',
      'compliance',
      'ban',
      'mandate',
      'guidelines',
    ],
  },
  research_breakthrough: {
    type: 'research_breakthrough',
    triggers: [
      'paper',
      'research',
      'breakthrough',
      'architecture',
      'arxiv',
      'published',
      'outperforms',
      'state-of-the-art',
      'sota',
      'benchmark',
      'novel approach',
      'new technique',
    ],
  },
  company_strategy: {
    type: 'company_strategy',
    triggers: [
      'partnership',
      'partners with',
      'expansion',
      'expands',
      'strategy',
      'strategic',
      'acquisition',
      'acquires',
      'acquired',
      'merger',
      'joint venture',
      'collaboration',
      'deal with',
    ],
  },
};

/**
 * Maps NormalizedCategory values to their most likely EventType.
 * Used as a fallback / strong signal when keyword matching is ambiguous.
 */
const CATEGORY_EVENT_MAP: Partial<Record<string, EventType>> = {
  model_release: 'model_release',
  funding:       'funding',
  regulation:    'regulation',
  research:      'research_breakthrough',
  company_news:  'company_strategy',
  analysis:      'other',
};

// ─────────────────────────────────────────────────────────────────────────────
// ID generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a deterministic event ID derived from the source article ID
 * and the event type. Ensures the same article+type pair always yields
 * the same ID (idempotent ingestion).
 */
function generateEventId(articleId: string, type: EventType): string {
  // Simple but stable: combine article ID + type + a short hash of both
  const raw = `${articleId}::${type}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32-bit integer
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return `evt_${hex}_${type.replace(/_/g, '')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Text matching helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the set of EventTypes whose keywords appear in the given text.
 */
function matchEventTypes(text: string): Set<EventType> {
  const lower = text.toLowerCase();
  const matched = new Set<EventType>();

  for (const { type, triggers } of Object.values(EVENT_KEYWORDS)) {
    if (triggers.some((kw) => lower.includes(kw))) {
      matched.add(type);
    }
  }

  return matched;
}

/**
 * Returns the first matching trigger keyword for a given EventType,
 * useful for building human-readable descriptions.
 */
function firstMatchedTrigger(text: string, type: EventType): string | undefined {
  const lower = text.toLowerCase();
  const rule = Object.values(EVENT_KEYWORDS).find((r) => r.type === type);
  if (!rule) return undefined;
  return rule.triggers.find((kw) => lower.includes(kw));
}

// ─────────────────────────────────────────────────────────────────────────────
// Event builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds a single structured Event from an Article and a resolved EventType.
 *
 * Populates all required Event fields and attaches the source article reference.
 * The `company` field is taken from the first detected company (or 'Unknown').
 * The `relatedModel` field is populated when at least one model is detected.
 *
 * @param article  Normalised Article (from the normalization layer).
 * @param type     The EventType assigned to this event.
 * @returns        A fully constructed Event ready for the signals engine.
 */
export function buildEvent(article: Article, type: EventType): Event {
  const company      = article.detectedCompanies?.[0] ?? 'Unknown';
  const relatedModel = article.detectedModels?.[0];
  const tags         = [
    ...(article.detectedCompanies ?? []),
    ...(article.detectedModels ?? []),
    ...(article.detectedInvestors ?? []),
    type,
  ];

  // Build a short description using matched trigger words for transparency
  const searchText  = `${article.title} ${article.content}`;
  const triggerWord = firstMatchedTrigger(searchText, type);
  const description = buildDescription(article, type, triggerWord);

  return {
    id:        generateEventId(article.id, type),
    type,
    company,
    relatedModel,
    title:     article.title,
    description,
    timestamp: article.publishedAt,
    tags:      Array.from(new Set(tags)),
    sourceArticle: {
      id:     article.id,
      title:  article.title,
      url:    article.url,
      source: article.source,
    },
  };
}

/**
 * Constructs a human-readable description for an event.
 * Provides context on why this event was detected.
 */
function buildDescription(
  article: Article,
  type: EventType,
  triggerWord: string | undefined
): string {
  const company    = article.detectedCompanies?.[0];
  const model      = article.detectedModels?.[0];
  const investors  = article.detectedInvestors?.join(', ');
  const trigger    = triggerWord ? `"${triggerWord}"` : 'related content';

  switch (type) {
    case 'model_release':
      return company && model
        ? `${company} ${triggerWord ?? 'releases'} ${model}. Source: ${article.source}.`
        : company
        ? `${company} has a new model release (detected: ${trigger}). Source: ${article.source}.`
        : `Model release detected via ${trigger}. Source: ${article.source}.`;

    case 'funding':
      return company && investors
        ? `${company} funding event involving ${investors} (detected: ${trigger}). Source: ${article.source}.`
        : company
        ? `${company} funding event detected via ${trigger}. Source: ${article.source}.`
        : `Funding event detected via ${trigger}. Source: ${article.source}.`;

    case 'regulation':
      return company
        ? `Regulatory development affecting ${company} detected via ${trigger}. Source: ${article.source}.`
        : `Regulatory or policy development detected via ${trigger}. Source: ${article.source}.`;

    case 'research_breakthrough':
      return company && model
        ? `Research breakthrough from ${company} related to ${model} (detected: ${trigger}). Source: ${article.source}.`
        : company
        ? `Research breakthrough from ${company} detected via ${trigger}. Source: ${article.source}.`
        : `Research breakthrough detected via ${trigger}. Source: ${article.source}.`;

    case 'company_strategy':
      return company
        ? `Company strategy event involving ${company} detected via ${trigger}. Source: ${article.source}.`
        : `Company strategy or partnership event detected via ${trigger}. Source: ${article.source}.`;

    default:
      return `Intelligence event detected via ${trigger}. Source: ${article.source}.`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Primary extraction function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts all structured Events from a single normalised Article.
 *
 * Detection pipeline (in order of priority):
 *   1. Keyword matching against title + content → may produce 1–N event types
 *   2. normalizedCategory fallback → ensures at least one event per article
 *      (only applied when no keyword match is found)
 *
 * A single article can produce multiple events (e.g. a funding announcement
 * for a company releasing a new model will produce both FUNDING and MODEL_RELEASE
 * events).
 *
 * @param article  A normalised Article from the normalization layer.
 * @returns        Array of structured Events (may be empty if detection fails).
 *
 * @example
 * ```ts
 * const events = extractEventsFromArticle(normalizedArticle);
 * // e.g. [{ type: 'funding', company: 'Anthropic', ... }]
 * ```
 */
export function extractEventsFromArticle(article: Article): Event[] {
  const searchText = `${article.title} ${article.content}`;

  // ── Step 1: keyword matching ──────────────────────────────────────────────
  const matchedTypes = matchEventTypes(searchText);

  // ── Step 2: category fallback (only when no keywords matched) ─────────────
  if (matchedTypes.size === 0 && article.normalizedCategory) {
    const fallbackType = CATEGORY_EVENT_MAP[article.normalizedCategory];
    if (fallbackType) {
      matchedTypes.add(fallbackType);
    }
  }

  // ── Step 3: build one Event per matched type ──────────────────────────────
  return Array.from(matchedTypes).map((type) => buildEvent(article, type));
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk extraction utility
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts Events from an array of normalised Articles.
 *
 * Processing guarantees:
 * - Errors in individual articles are caught and logged; the article is skipped.
 * - The returned array is flat (all events from all articles in one array).
 * - Order is preserved: events from earlier articles appear first.
 *
 * This function is the primary entry point for the ingestion scheduler.
 *
 * @param articles  Array of normalised Articles from the normalization layer.
 * @returns         Flat array of structured Events across all articles.
 *
 * @example
 * ```ts
 * const normalized = normalizeArticles(rawArticles);
 * const events     = extractEventsFromArticles(normalized);
 * // Feed events into the signals engine
 * ```
 */
export function extractEventsFromArticles(articles: Article[]): Event[] {
  const results: Event[] = [];

  for (const article of articles) {
    try {
      const events = extractEventsFromArticle(article);
      results.push(...events);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[eventExtractor] Failed to extract events from article "${article.id}": ${message}`
      );
    }
  }

  return results;
}
