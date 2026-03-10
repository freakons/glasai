/**
 * Omterminal — Core Intelligence Data Types
 *
 * This file defines the canonical TypeScript types for all intelligence
 * entities tracked by Omterminal: articles, events, companies, funding
 * rounds, model releases, regulations, signals, and snapshots.
 *
 * These types are the single source of truth for the data layer.
 * No ingestion or API logic lives here.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Shared primitives
// ─────────────────────────────────────────────────────────────────────────────

/** ISO 8601 date string, e.g. "2024-03-07T12:00:00Z" */
export type ISODateString = string;

/** Two-letter ISO 3166-1 alpha-2 country code or named region, e.g. "US", "EU" */
export type RegionCode = string;

/** 0.0 – 1.0 confidence score */
export type ConfidenceScore = number;

// ─────────────────────────────────────────────────────────────────────────────
// Article
// ─────────────────────────────────────────────────────────────────────────────

/**
 * High-level categories an article can belong to.
 * Mirrors the intelligence categories used across the system.
 */
export type ArticleCategory =
  | 'model_release'
  | 'funding'
  | 'regulation'
  | 'policy'
  | 'research'
  | 'company_strategy'
  | 'product'
  | 'other';

/**
 * Normalised category set produced by the normalization layer.
 * Smaller, canonical vocabulary used downstream by the intelligence engine.
 */
export type NormalizedCategory =
  | 'model_release'
  | 'funding'
  | 'regulation'
  | 'research'
  | 'company_news'
  | 'analysis';

/**
 * A raw article ingested from an external source.
 * Articles are the primary input to the intelligence pipeline.
 */
export interface Article {
  /** Unique article identifier (e.g. UUID or hash of URL) */
  id: string;
  /** Headline or title of the article */
  title: string;
  /** Publisher / news source name, e.g. "TechCrunch" */
  source: string;
  /** Canonical URL of the article */
  url: string;
  /** Publication timestamp */
  publishedAt: ISODateString;
  /** Full or truncated article body text */
  content: string;
  /** Primary intelligence category of the article */
  category: ArticleCategory;
  /** Optional excerpt / summary provided by the source */
  excerpt?: string;
  /** Author name(s) if available */
  authors?: string[];
  /** Raw tags or topics attached by the source */
  tags?: string[];

  // ── Normalization layer outputs (populated by articleNormalizer) ──────────

  /** Canonical category assigned by the normalization layer */
  normalizedCategory?: NormalizedCategory;
  /** Canonical company names detected in the article text */
  detectedCompanies?: string[];
  /** Canonical model names detected in the article text */
  detectedModels?: string[];
  /** Canonical investor names detected in the article text */
  detectedInvestors?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Company
// ─────────────────────────────────────────────────────────────────────────────

/** Industry sector of an AI company */
export type CompanySector =
  | 'foundation_models'
  | 'applied_ai'
  | 'ai_infrastructure'
  | 'robotics'
  | 'autonomous_vehicles'
  | 'ai_safety'
  | 'semiconductors'
  | 'enterprise_software'
  | 'consumer'
  | 'other';

/**
 * An AI company or research organisation tracked by Omterminal.
 */
export interface Company {
  /** Canonical company name, e.g. "OpenAI" */
  name: string;
  /** Primary industry sector */
  sector: CompanySector;
  /** Headquarters country (ISO 3166-1 alpha-2 or full name) */
  country: string;
  /** Year the company was founded */
  founded?: number;
  /** Short description of the company's mission or focus */
  description?: string;
  /** Company website URL */
  website?: string;
  /** Known investors or parent organisations */
  investors?: string[];
  /** Ticker symbol if publicly traded */
  ticker?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Funding Round
// ─────────────────────────────────────────────────────────────────────────────

/** Standardised funding round type labels */
export type FundingRoundType =
  | 'pre_seed'
  | 'seed'
  | 'series_a'
  | 'series_b'
  | 'series_c'
  | 'series_d'
  | 'series_e'
  | 'growth'
  | 'late_stage'
  | 'strategic'
  | 'ipo'
  | 'spac'
  | 'grant'
  | 'debt'
  | 'undisclosed';

/**
 * A single funding event for an AI company.
 */
export interface FundingRound {
  /** Company that raised the round */
  company: string;
  /** Total amount raised in USD (null if undisclosed) */
  amount: number | null;
  /** Currency of the raise, defaults to "USD" */
  currency?: string;
  /** Names of lead and participating investors */
  investors: string[];
  /** Round type / stage */
  roundType: FundingRoundType;
  /** Date the round was announced or closed */
  date: ISODateString;
  /** Post-money valuation in USD, if disclosed */
  valuation?: number | null;
  /** Brief context on the intended use of funds */
  useOfFunds?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Model Release
// ─────────────────────────────────────────────────────────────────────────────

/** Access type for a released model */
export type ModelAccessType = 'api' | 'open_weights' | 'research_preview' | 'closed' | 'hybrid';

/** Key capability flags for a model */
export type ModelCapability =
  | 'text'
  | 'code'
  | 'vision'
  | 'audio'
  | 'video'
  | 'multimodal'
  | 'reasoning'
  | 'tool_use'
  | 'agents'
  | 'long_context'
  | 'real_time';

/**
 * A single benchmark result associated with a model release.
 */
export interface BenchmarkResult {
  /** Name of the benchmark, e.g. "MMLU", "HumanEval" */
  name: string;
  /** Score achieved (numeric) */
  score: number;
  /** Unit or scale of the score, e.g. "%" or "pass@1" */
  unit?: string;
  /** Previous SOTA or competitor score for comparison */
  previousBest?: number;
}

/**
 * The release of a new AI model or a significant model update.
 */
export interface ModelRelease {
  /** Model name / version, e.g. "GPT-4o", "Gemini 1.5 Pro" */
  modelName: string;
  /** Releasing company or research lab */
  company: string;
  /** Date the model was publicly released or announced */
  releaseDate: ISODateString;
  /** List of key capabilities */
  capabilities: ModelCapability[];
  /** Notable benchmark results cited at launch */
  benchmarkHighlights: BenchmarkResult[];
  /** How the model is accessible */
  accessType?: ModelAccessType;
  /** Context window size in tokens, if applicable */
  contextWindowTokens?: number;
  /** Technical report or paper URL */
  technicalReportUrl?: string;
  /** Short description of what makes this release notable */
  description?: string;
  /** Whether this is a fine-tuned variant of a base model */
  isFineTune?: boolean;
  /** Base model name if this is a fine-tune or derivative */
  baseModel?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Regulation
// ─────────────────────────────────────────────────────────────────────────────

/** Current legislative or policy status */
export type RegulationStatus =
  | 'proposed'
  | 'consultation'
  | 'passed'
  | 'enacted'
  | 'amended'
  | 'repealed'
  | 'blocked';

/**
 * An AI regulation, policy, or executive action.
 */
export interface Regulation {
  /** Geographic region or jurisdiction, e.g. "EU", "US", "China" */
  region: RegionCode;
  /** Issuing body, e.g. "European Parliament", "FTC", "NIST" */
  regulator: string;
  /** Official name of the policy or act */
  policyName: string;
  /** Plain-language summary of what the regulation does */
  summary: string;
  /** Date the regulation takes legal effect */
  effectiveDate: ISODateString;
  /** Current legislative status */
  status: RegulationStatus;
  /** Date the regulation was announced or proposed */
  announcedDate?: ISODateString;
  /** Primary AI domains targeted, e.g. ["foundation_models", "biometrics"] */
  targetedDomains?: string[];
  /** Official document or press release URL */
  sourceUrl?: string;
  /** Key obligations or prohibitions imposed (brief list) */
  keyProvisions?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Event
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Typed event categories — maps to ArticleCategory but scoped to events
 * that have been parsed, enriched, and committed to the intelligence layer.
 */
export type EventType =
  | 'model_release'
  | 'funding'
  | 'regulation'
  | 'policy'
  | 'research_breakthrough'
  | 'company_strategy'
  | 'leadership_change'
  | 'partnership'
  | 'product_launch'
  | 'controversy'
  | 'acquisition'
  | 'other';

/**
 * A structured intelligence event derived from one or more articles.
 * Events are the normalised, enriched representation of what happened.
 */
export interface Event {
  /** Unique event identifier */
  id: string;
  /** Category / type of the event */
  type: EventType;
  /** Primary company or entity involved */
  company: string;
  /** Related AI model name, if applicable */
  relatedModel?: string;
  /** Human-readable headline for the event */
  title: string;
  /** Full description / editorial analysis */
  description: string;
  /** Timestamp of when the event occurred (not when it was ingested) */
  timestamp: ISODateString;
  /** Reference to the article that sourced this event */
  sourceArticle?: Pick<Article, 'id' | 'title' | 'url' | 'source'>;
  /** Additional articles that corroborate this event */
  corroboratingArticles?: Pick<Article, 'id' | 'title' | 'url'>[];
  /** Searchable tags for filtering and discovery */
  tags?: string[];
  /** Geographic region relevant to the event */
  region?: RegionCode;
  /** Structured payload specific to the event type */
  payload?: FundingRound | ModelRelease | Regulation | Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal
// ─────────────────────────────────────────────────────────────────────────────

/** Directional signal indicating the implication for decision-makers */
export type SignalDirection = 'bullish' | 'bearish' | 'neutral' | 'uncertain';

/**
 * High-level pattern type detected by the signals engine.
 * Each type maps to a specific set of detection rules.
 */
export type SignalType =
  | 'CAPITAL_ACCELERATION'
  | 'MODEL_RELEASE_WAVE'
  | 'REGULATION_ACTIVITY'
  | 'RESEARCH_MOMENTUM'
  | 'COMPANY_EXPANSION';

/**
 * A higher-order intelligence signal synthesised from multiple events.
 * Signals represent trends, risks, or opportunities—not single events.
 */
export interface Signal {
  /** Unique signal identifier */
  id: string;
  /** Pattern type detected by the signals engine */
  type?: SignalType;
  /** Short title summarising the signal, e.g. "Open-source models closing capability gap" */
  title: string;
  /** Detailed explanation of the signal and its implications */
  description: string;
  /** IDs of the events that support this signal */
  supportingEvents: string[];
  /** 0.0 – 1.0 confidence in the signal's validity */
  confidenceScore: ConfidenceScore;
  /** Timestamp when the signal was first generated */
  createdAt: ISODateString;
  /** Timestamp of the most recent update to this signal */
  updatedAt?: ISODateString;
  /** Directional implication for decision-makers */
  direction?: SignalDirection;
  /** Companies or sectors most affected by this signal */
  affectedEntities?: string[];
  /** Suggested action or consideration for the reader */
  recommendation?: string;
  /** Whether this signal has been reviewed by a human analyst */
  humanVerified?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal Context
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Operational status of a signal context record.
 *
 *   pending — row created, LLM generation not yet attempted
 *   ready   — generation succeeded; context is safe to display
 *   failed  — generation was attempted but errored; see generationError
 */
export type SignalContextStatus = 'pending' | 'ready' | 'failed';

/**
 * A single entity referenced inside a signal context.
 *
 * Stored as JSONB so additional fields (entity_id, sector, confidence)
 * can be added by the generation layer without schema changes.
 */
export interface SignalContextEntity {
  /** Canonical entity name, e.g. "OpenAI" */
  name: string;
  /** Entity type classification, e.g. "company", "regulator", "fund" */
  type?: string;
  /** Role the entity plays in this signal, e.g. "funding recipient" */
  role?: string;
}

/**
 * Structured intelligence context attached to a signal.
 *
 * Context is generated in the write-side pipeline only and persisted to the
 * signal_contexts table.  Public pages read precomputed rows — no
 * request-time generation.
 *
 * Each field maps to a distinct UI surface (card, detail view, digest, etc.)
 * to allow independent rendering without re-parsing a monolithic blob.
 */
export interface SignalContext {
  /** Unique context record identifier */
  id: string;
  /** FK reference to the parent signal */
  signalId: string;

  // ── Core context fields ───────────────────────────────────────────────────

  /** One-sentence headline for signal cards, alert emails, and digests */
  summary: string | null;
  /** Editorial significance paragraph for detail views and dashboards */
  whyItMatters: string | null;
  /**
   * Structured list of entities most affected by the signal.
   * JSONB on disk; each element carries at minimum a `name` field.
   */
  affectedEntities: SignalContextEntity[];
  /**
   * Ordered bullet-point strings describing forward-looking implications.
   * TEXT[] on disk; each element is a standalone plain-text fragment.
   */
  implications: string[];
  /** Human-readable rationale that explains the confidence score */
  confidenceExplanation: string | null;
  /** Citation of the events / articles the context was derived from */
  sourceBasis: string | null;

  // ── Model metadata ────────────────────────────────────────────────────────

  /** LLM provider used for generation, e.g. "openai", "groq", "anthropic" */
  modelProvider: string;
  /** Specific model identifier, e.g. "gpt-4o", "llama-3.1-70b-versatile" */
  modelName: string;
  /**
   * Semver or hash of the prompt template used.
   * Enables targeted regeneration when prompts are updated.
   */
  promptVersion: string;

  // ── Operational metadata ──────────────────────────────────────────────────

  /** Current pipeline / display state */
  status: SignalContextStatus;
  /** Error message from the last failed generation attempt; null otherwise */
  generationError: string | null;
  /** Timestamp when the context record was first created */
  createdAt: ISODateString;
  /** Timestamp of the most recent update to this record */
  updatedAt?: ISODateString;
}

// ─────────────────────────────────────────────────────────────────────────────
// Trend
// ─────────────────────────────────────────────────────────────────────────────

export interface Trend {
  topic: string;
  category: string;
  signal_count: number;
  entities: string[];
  summary: string;
  confidence: number;
  score: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Entity
// ─────────────────────────────────────────────────────────────────────────────

export interface Entity {
  name: string;
  type: string;
  description?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Intelligence Snapshot
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A periodic (e.g. daily or weekly) roll-up of the most important
 * intelligence across all categories. Used to power dashboards and digests.
 */
export interface IntelligenceSnapshot {
  /** Unique snapshot identifier */
  id: string;
  /** ISO date this snapshot covers (start of period) */
  periodStart: ISODateString;
  /** ISO date this snapshot covers (end of period) */
  periodEnd: ISODateString;
  /** Timestamp the snapshot was generated */
  generatedAt: ISODateString;

  /** Most significant model releases in the period */
  topModelReleases: ModelRelease[];
  /** Most significant funding rounds in the period */
  majorFunding: FundingRound[];
  /** New or updated regulations in the period */
  newRegulations: Regulation[];
  /** High-confidence signals surfaced in the period */
  keySignals: Signal[];

  /** Total number of articles ingested during the period */
  articlesProcessed?: number;
  /** Total number of events extracted during the period */
  eventsExtracted?: number;
  /** Optional editorial headline for the snapshot */
  headline?: string;
  /** Optional editorial summary of the period */
  summary?: string;
}
