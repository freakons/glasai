/**
 * Omterminal — Database Query Layer
 *
 * Frontend-facing query functions that read from Neon Postgres and return
 * data in the same shapes as the mock data files.  Each function falls back
 * to an empty array if DATABASE_URL is not configured or the query fails;
 * callers are responsible for supplying mock-data fallbacks when needed.
 *
 * Tables:
 *   signals       — populated by the intelligence engine (/api/signals)
 *   events        — populated by the ingestion pipeline (/api/ingest)
 *   entities      — populated by seeding or the entity tracker
 *   articles      — populated by the ingestion pipeline (/api/ingest)
 *   regulations   — populated by seeding or admin input (migration 003)
 *   ai_models     — populated by seeding or admin input (migration 003)
 *   funding_rounds — populated by seeding or admin input (migration 003)
 */

import { dbQuery, tableExists } from '@/db/client';
import type { SignalContext, SignalContextEntity, SignalContextStatus } from '@/types/intelligence';
import type { Signal, SignalCategory } from '@/data/mockSignals';
import { type SignalMode, getModeConfig, DEFAULT_SIGNAL_MODE } from '@/lib/signals/signalModes';
import type { AiEvent, EventType } from '@/data/mockEvents';
import type { EntityProfile, RiskLevel } from '@/data/mockEntities';
import type { Article } from '@/lib/data/news';
import type { Regulation } from '@/lib/data/regulations';
import type { AIModel } from '@/lib/data/models';
import type { FundingRound } from '@/lib/data/funding';

// ─────────────────────────────────────────────────────────────────────────────
// Row types (what the DB actually returns)
// ─────────────────────────────────────────────────────────────────────────────

interface SignalRow {
  id: string;
  title: string;
  /** Stored in `summary` column (falls back to `description`) */
  summary: string | null;
  description: string;
  /** Frontend category stored in `category` column */
  category: string | null;
  /** signal_type from the engine (fallback for category) */
  signal_type: string | null;
  /** entity_id column added by migration */
  entity_id: string | null;
  /** entity_name column added by migration */
  entity_name: string | null;
  /** Direct integer confidence (0-100), added by migration */
  confidence: number | null;
  /** confidence_score from engine (0-1 NUMERIC) */
  confidence_score: string | null;
  /** ISO date string, added by migration */
  date: string | null;
  created_at: string;

  // ── Context columns — present only when queried with LEFT JOIN on signal_contexts ──
  /** Primary key of the joined context row; null when no ready context exists. */
  ctx_id?: string | null;
  ctx_summary?: string | null;
  ctx_why_it_matters?: string | null;
  /** JSONB array parsed to JS value by the DB driver */
  ctx_affected_entities?: SignalContextEntity[] | null;
  /** TEXT[] column */
  ctx_implications?: string[] | null;
  ctx_confidence_explanation?: string | null;
  ctx_source_basis?: string | null;
  ctx_model_provider?: string | null;
  ctx_model_name?: string | null;
  ctx_prompt_version?: string | null;
  ctx_status?: string | null;
  ctx_generation_error?: string | null;
  ctx_created_at?: string | null;
  ctx_updated_at?: string | null;
}

interface EventRow {
  id: string;
  type: string;
  title: string;
  description: string;
  /** entity_id column added by migration */
  entity_id: string | null;
  /** entity_name column added by migration */
  entity_name: string | null;
  /** company column (legacy; used as source fallback) */
  company: string;
  /** amount column added by migration */
  amount: string | null;
  /** signal_ids column added by migration */
  signal_ids: string[] | null;
  /** ISO date from timestamp column */
  timestamp: string;
  created_at: string;
}

interface EntityRow {
  id: string;
  name: string;
  type: string;
  description: string;
  sector: string | null;
  country: string | null;
  founded: number | null;
  website: string | null;
  risk_level: string | null;
  tags: string[] | null;
  financial_scale: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Row → interface mappers
// ─────────────────────────────────────────────────────────────────────────────

/** Map a signals row to the frontend Signal shape. */
function rowToSignal(row: SignalRow): Signal {
  // Resolve category: prefer the `category` column, else derive from signal_type
  const rawCategory = row.category ?? engineTypeToCategory(row.signal_type);
  const category: SignalCategory = isSignalCategory(rawCategory)
    ? rawCategory
    : 'research';

  // Resolve confidence: prefer integer column, else scale engine score
  const confidence =
    row.confidence != null
      ? row.confidence
      : row.confidence_score != null
        ? Math.round(parseFloat(row.confidence_score) * 100)
        : 80;

  // Build context from LEFT JOIN columns when a ready context row was joined.
  // ctx_id is non-null only when the JOIN matched a signal_contexts row with
  // status='ready', so this branch is safe to treat as a complete context.
  let context: SignalContext | undefined;
  if (row.ctx_id != null) {
    context = {
      id:                    row.ctx_id,
      signalId:              row.id,
      summary:               row.ctx_summary ?? null,
      whyItMatters:          row.ctx_why_it_matters ?? null,
      affectedEntities:      row.ctx_affected_entities ?? [],
      implications:          row.ctx_implications ?? [],
      confidenceExplanation: row.ctx_confidence_explanation ?? null,
      sourceBasis:           row.ctx_source_basis ?? null,
      modelProvider:         row.ctx_model_provider ?? '',
      modelName:             row.ctx_model_name ?? '',
      promptVersion:         row.ctx_prompt_version ?? '',
      // The LEFT JOIN condition enforces status='ready', so this is always 'ready'.
      status:                'ready' as const,
      generationError:       row.ctx_generation_error ?? null,
      createdAt:             row.ctx_created_at ?? row.created_at,
      updatedAt:             row.ctx_updated_at ?? undefined,
    };
  }

  return {
    id:         row.id,
    title:      row.title,
    category,
    entityId:   row.entity_id ?? row.id,
    entityName: row.entity_name ?? '',
    summary:    row.summary ?? row.description,
    date:       row.date ?? row.created_at,
    confidence,
    ...(context !== undefined ? { context } : {}),
  };
}

/** Map an events row to the frontend AiEvent shape. */
function rowToEvent(row: EventRow): AiEvent {
  const type: EventType = isEventType(row.type) ? row.type : 'announcement';
  return {
    id:          row.id,
    type,
    entityId:    row.entity_id ?? '',
    entityName:  row.entity_name ?? row.company,
    title:       row.title,
    description: row.description,
    date:        typeof row.timestamp === 'string'
                   ? row.timestamp.slice(0, 10)
                   : new Date(row.timestamp).toISOString().slice(0, 10),
    amount:      row.amount ?? undefined,
    signalIds:   row.signal_ids ?? undefined,
  };
}

/** Map an entities row to the frontend EntityProfile shape. */
function rowToEntity(row: EntityRow): EntityProfile {
  return {
    id:             row.id,
    name:           row.name,
    sector:         row.sector ?? '',
    country:        row.country ?? '',
    founded:        row.founded ?? 0,
    website:        row.website ?? '',
    signalCount:    0,
    eventCount30d:  0,
    latestSignal:   '—',
    lastEventDate:  '—',
    riskLevel:      isRiskLevel(row.risk_level) ? row.risk_level : 'low',
    summary:        row.description,
    tags:           row.tags ?? [],
    financialScale: row.financial_scale ?? undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Type guards
// ─────────────────────────────────────────────────────────────────────────────

const SIGNAL_CATEGORIES: SignalCategory[] = [
  'models', 'funding', 'regulation', 'agents', 'research', 'product',
];

const EVENT_TYPES: EventType[] = [
  'funding', 'launch', 'announcement', 'regulation',
  'acquisition', 'partnership', 'research',
];

function isSignalCategory(v: string | null | undefined): v is SignalCategory {
  return SIGNAL_CATEGORIES.includes(v as SignalCategory);
}

function isEventType(v: string | null | undefined): v is EventType {
  return EVENT_TYPES.includes(v as EventType);
}

function isRiskLevel(v: string | null | undefined): v is RiskLevel {
  return v === 'low' || v === 'medium' || v === 'high';
}

/** Coerce engine signal_type to a frontend SignalCategory. */
function engineTypeToCategory(type: string | null): string {
  switch (type) {
    case 'CAPITAL_ACCELERATION':  return 'funding';
    case 'MODEL_RELEASE_WAVE':    return 'models';
    case 'REGULATION_ACTIVITY':   return 'regulation';
    case 'RESEARCH_MOMENTUM':     return 'research';
    case 'COMPANY_EXPANSION':     return 'product';
    default:                      return 'research';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public query functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch intelligence signals from the database, optionally including
 * precomputed context via a single LEFT JOIN on signal_contexts.
 *
 * When the signal_contexts table exists (migration 006), context with
 * status='ready' is joined in the same query — one round-trip, no N+1.
 * When the table is absent the function falls back to a plain signals query
 * so callers remain unaffected during incremental migration.
 *
 * The `mode` parameter controls which signals are eligible for display:
 *   raw      — all non-rejected signals, no confidence filter (internal/debug)
 *   standard — auto/published signals with confidence ≥ 65 (public default)
 *   premium  — auto/published signals with confidence ≥ 85 (future paid surfaces)
 *
 * @param limit  Maximum signals to return (default governed by mode config).
 * @param mode   Signal quality mode (default: 'standard').
 */
export async function getSignals(
  limit = 50,
  mode: SignalMode = DEFAULT_SIGNAL_MODE,
): Promise<Signal[]> {
  const config = getModeConfig(mode);
  const safeLimit = Math.min(Math.max(1, limit), config.defaultLimit);

  const hasContextTable = await tableExists('signal_contexts');

  // ── Raw mode: permissive — show all non-rejected signals ──────────────────
  // Mirrors the pre-mode query behaviour for full backward compatibility.
  if (mode === 'raw') {
    if (hasContextTable) {
      const rows = await dbQuery<SignalRow>`
        SELECT
          s.id,
          s.title,
          s.summary,
          s.description,
          s.category,
          s.signal_type,
          s.entity_id,
          s.entity_name,
          s.confidence,
          s.confidence_score,
          s.date,
          s.created_at,
          sc.id                     AS ctx_id,
          sc.summary                AS ctx_summary,
          sc.why_it_matters         AS ctx_why_it_matters,
          sc.affected_entities      AS ctx_affected_entities,
          sc.implications           AS ctx_implications,
          sc.confidence_explanation AS ctx_confidence_explanation,
          sc.source_basis           AS ctx_source_basis,
          sc.model_provider         AS ctx_model_provider,
          sc.model_name             AS ctx_model_name,
          sc.prompt_version         AS ctx_prompt_version,
          sc.status                 AS ctx_status,
          sc.generation_error       AS ctx_generation_error,
          sc.created_at             AS ctx_created_at,
          sc.updated_at             AS ctx_updated_at
        FROM signals s
        LEFT JOIN signal_contexts sc
          ON sc.signal_id = s.id AND sc.status = 'ready'
        WHERE s.status IS NULL OR s.status NOT IN ('rejected')
        ORDER BY s.created_at DESC
        LIMIT ${safeLimit}
      `;
      return rows.map(rowToSignal);
    }

    const rows = await dbQuery<SignalRow>`
      SELECT
        id,
        title,
        summary,
        description,
        category,
        signal_type,
        entity_id,
        entity_name,
        confidence,
        confidence_score,
        date,
        created_at
      FROM signals
      WHERE status IS NULL OR status NOT IN ('rejected')
      ORDER BY created_at DESC
      LIMIT ${safeLimit}
    `;
    return rows.map(rowToSignal);
  }

  // ── Standard / Premium mode: filtered by status and confidence ────────────
  // Convert the 0-100 integer threshold to the 0-1 NUMERIC scale used by
  // confidence_score.  Rows without a confidence_score are included (legacy).
  const minCs = config.minConfidence / 100;

  if (hasContextTable) {
    // Single query: signals LEFT JOIN signal_contexts (status='ready').
    // Avoids N+1 — one round-trip regardless of result set size.
    // Context columns are aliased with ctx_ prefix to avoid name collisions.
    const rows = await dbQuery<SignalRow>`
      SELECT
        s.id,
        s.title,
        s.summary,
        s.description,
        s.category,
        s.signal_type,
        s.entity_id,
        s.entity_name,
        s.confidence,
        s.confidence_score,
        s.date,
        s.created_at,
        sc.id                     AS ctx_id,
        sc.summary                AS ctx_summary,
        sc.why_it_matters         AS ctx_why_it_matters,
        sc.affected_entities      AS ctx_affected_entities,
        sc.implications           AS ctx_implications,
        sc.confidence_explanation AS ctx_confidence_explanation,
        sc.source_basis           AS ctx_source_basis,
        sc.model_provider         AS ctx_model_provider,
        sc.model_name             AS ctx_model_name,
        sc.prompt_version         AS ctx_prompt_version,
        sc.status                 AS ctx_status,
        sc.generation_error       AS ctx_generation_error,
        sc.created_at             AS ctx_created_at,
        sc.updated_at             AS ctx_updated_at
      FROM signals s
      LEFT JOIN signal_contexts sc
        ON sc.signal_id = s.id AND sc.status = 'ready'
      WHERE (s.status IS NULL OR s.status IN ('auto', 'published'))
        AND (s.confidence_score IS NULL OR s.confidence_score >= ${minCs})
      ORDER BY s.created_at DESC
      LIMIT ${safeLimit}
    `;
    return rows.map(rowToSignal);
  }

  // Fallback: signal_contexts table not yet applied (pre-migration 006).
  const rows = await dbQuery<SignalRow>`
    SELECT
      id,
      title,
      summary,
      description,
      category,
      signal_type,
      entity_id,
      entity_name,
      confidence,
      confidence_score,
      date,
      created_at
    FROM signals
    WHERE (status IS NULL OR status IN ('auto', 'published'))
      AND (confidence_score IS NULL OR confidence_score >= ${minCs})
    ORDER BY created_at DESC
    LIMIT ${safeLimit}
  `;

  return rows.map(rowToSignal);
}

/**
 * Fetch AI ecosystem events from the database.
 *
 * Reads from the `events` table populated by the ingestion pipeline.
 * Returns an empty array when the DB is unavailable or the table is empty.
 *
 * @param limit  Maximum events to return (default 50).
 */
export async function getEvents(limit = 50): Promise<AiEvent[]> {
  const safeLimit = Math.min(Math.max(1, limit), 500);

  const rows = await dbQuery<EventRow>`
    SELECT
      id,
      type,
      title,
      description,
      entity_id,
      entity_name,
      company,
      amount,
      signal_ids,
      timestamp,
      created_at
    FROM events
    ORDER BY timestamp DESC
    LIMIT ${safeLimit}
  `;

  return rows.map(rowToEvent);
}

/**
 * Fetch entity profiles from the database.
 *
 * Reads from the `entities` table which is populated by seeding or the
 * entity tracker.  Returns an empty array when the DB is unavailable or
 * the table is empty.
 *
 * @param limit  Maximum entities to return (default 50).
 */
export async function getEntities(limit = 50): Promise<EntityProfile[]> {
  const safeLimit = Math.min(Math.max(1, limit), 200);

  const rows = await dbQuery<EntityRow>`
    SELECT
      id,
      name,
      type,
      description,
      sector,
      country,
      founded,
      website,
      risk_level,
      tags,
      financial_scale,
      created_at
    FROM entities
    ORDER BY created_at ASC
    LIMIT ${safeLimit}
  `;

  return rows.map(rowToEntity);
}

// ─────────────────────────────────────────────────────────────────────────────
// Articles
// ─────────────────────────────────────────────────────────────────────────────

interface ArticleRow {
  id: string;
  title: string;
  source: string;
  url: string;
  published_at: string;
  category: string;
  created_at: string;
}

function rowToArticle(row: ArticleRow, index: number): Article {
  return {
    id: index + 1,
    cat: isArticleCat(row.category) ? row.category : 'research',
    title: row.title,
    body: '',
    full: '',
    sowhat: '',
    source: row.source,
    sourceUrl: row.url,
    date: new Date(row.published_at).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    }),
    verified: true,
    _live: true,
  };
}

type ArticleCat = Article['cat'];
const ARTICLE_CATS: ArticleCat[] = ['funding', 'models', 'agents', 'regulation', 'research', 'product'];
function isArticleCat(v: string): v is ArticleCat {
  return ARTICLE_CATS.includes(v as ArticleCat);
}

/**
 * Fetch articles from the database.
 *
 * Reads from the `articles` table populated by the ingestion pipeline.
 * Returns an empty array when the DB is unavailable or the table is empty.
 *
 * @param category  Optional category filter (matches `cat` on Article interface).
 * @param limit     Maximum articles to return (default 50).
 */
export async function getArticles(category?: string, limit = 50): Promise<Article[]> {
  const safeLimit = Math.min(Math.max(1, limit), 500);

  const rows = category && category !== 'all'
    ? await dbQuery<ArticleRow>`
        SELECT id, title, source, url, published_at, category, created_at
        FROM articles
        WHERE category = ${category}
        ORDER BY published_at DESC
        LIMIT ${safeLimit}
      `
    : await dbQuery<ArticleRow>`
        SELECT id, title, source, url, published_at, category, created_at
        FROM articles
        ORDER BY published_at DESC
        LIMIT ${safeLimit}
      `;

  return rows.map(rowToArticle);
}

/**
 * Fetch the single featured article from the database.
 *
 * Returns undefined when the DB is unavailable or has no articles.
 */
export async function getFeaturedArticle(): Promise<Article | undefined> {
  const rows = await dbQuery<ArticleRow>`
    SELECT id, title, source, url, published_at, category, created_at
    FROM articles
    ORDER BY published_at DESC
    LIMIT 1
  `;
  if (rows.length === 0) return undefined;
  const article = rowToArticle(rows[0], 0);
  return { ...article, featured: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Regulations
// ─────────────────────────────────────────────────────────────────────────────

interface RegulationRow {
  id: string;
  title: string;
  type: string;
  country: string;
  flag: string;
  status: string;
  summary: string;
  date: string;
  impact: string;
}

function rowToRegulation(row: RegulationRow): Regulation {
  return {
    id: row.id,
    title: row.title,
    type: isRegType(row.type) ? row.type : 'policy',
    country: row.country,
    flag: row.flag,
    status: isRegStatus(row.status) ? row.status : 'active',
    summary: row.summary,
    date: row.date,
    impact: row.impact,
  };
}

type RegType = Regulation['type'];
type RegStatus = Regulation['status'];
const REG_TYPES: RegType[] = ['law', 'bill', 'exec', 'policy', 'report'];
const REG_STATUSES: RegStatus[] = ['active', 'pending', 'passed'];
function isRegType(v: string): v is RegType { return REG_TYPES.includes(v as RegType); }
function isRegStatus(v: string): v is RegStatus { return REG_STATUSES.includes(v as RegStatus); }

/**
 * Fetch regulations from the database.
 *
 * Reads from the `regulations` table (migration 003).
 * Returns an empty array when the DB is unavailable or the table is empty.
 *
 * @param type   Optional type filter ('law' | 'bill' | 'exec' | 'policy' | 'report').
 * @param limit  Maximum regulations to return (default 50).
 */
export async function getRegulations(type?: string, limit = 50): Promise<Regulation[]> {
  if (!(await tableExists('regulations'))) return [];

  const safeLimit = Math.min(Math.max(1, limit), 200);

  const rows = type && type !== 'all'
    ? await dbQuery<RegulationRow>`
        SELECT id, title, type, country, flag, status, summary, date, impact
        FROM regulations
        WHERE type = ${type}
        ORDER BY created_at DESC
        LIMIT ${safeLimit}
      `
    : await dbQuery<RegulationRow>`
        SELECT id, title, type, country, flag, status, summary, date, impact
        FROM regulations
        ORDER BY created_at DESC
        LIMIT ${safeLimit}
      `;

  return rows.map(rowToRegulation);
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Models
// ─────────────────────────────────────────────────────────────────────────────

interface AiModelRow {
  id: string;
  name: string;
  company: string;
  icon: string;
  release_date: string;
  type: string;
  context_window: string;
  key_capability: string;
  summary: string;
}

function rowToAiModel(row: AiModelRow): AIModel {
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    icon: row.icon,
    releaseDate: row.release_date,
    type: isModelType(row.type) ? row.type : 'proprietary',
    contextWindow: row.context_window,
    keyCapability: row.key_capability,
    summary: row.summary,
  };
}

type ModelType = AIModel['type'];
const MODEL_TYPES: ModelType[] = ['proprietary', 'open-weight', 'open-source'];
function isModelType(v: string): v is ModelType { return MODEL_TYPES.includes(v as ModelType); }

/**
 * Fetch AI model records from the database.
 *
 * Reads from the `ai_models` table (migration 003).
 * Returns an empty array when the DB is unavailable or the table is empty.
 *
 * @param limit  Maximum models to return (default 50).
 */
export async function getModels(limit = 50): Promise<AIModel[]> {
  if (!(await tableExists('ai_models'))) return [];

  const safeLimit = Math.min(Math.max(1, limit), 200);

  const rows = await dbQuery<AiModelRow>`
    SELECT id, name, company, icon, release_date, type, context_window, key_capability, summary
    FROM ai_models
    ORDER BY created_at DESC
    LIMIT ${safeLimit}
  `;

  return rows.map(rowToAiModel);
}

// ─────────────────────────────────────────────────────────────────────────────
// Funding Rounds
// ─────────────────────────────────────────────────────────────────────────────

interface FundingRoundRow {
  id: string;
  company: string;
  icon: string;
  amount: string;
  valuation: string;
  round: string;
  date: string;
  investors: string[];
  summary: string;
}

function rowToFundingRound(row: FundingRoundRow): FundingRound {
  return {
    id: row.id,
    company: row.company,
    icon: row.icon,
    amount: row.amount,
    valuation: row.valuation,
    round: row.round,
    date: row.date,
    investors: row.investors ?? [],
    summary: row.summary,
  };
}

/**
 * Fetch funding rounds from the database.
 *
 * Reads from the `funding_rounds` table (migration 003).
 * Returns an empty array when the DB is unavailable or the table is empty.
 *
 * @param limit  Maximum rounds to return (default 50).
 */
export async function getFundingRounds(limit = 50): Promise<FundingRound[]> {
  if (!(await tableExists('funding_rounds'))) return [];

  const safeLimit = Math.min(Math.max(1, limit), 200);

  const rows = await dbQuery<FundingRoundRow>`
    SELECT id, company, icon, amount, valuation, round, date, investors, summary
    FROM funding_rounds
    ORDER BY created_at DESC
    LIMIT ${safeLimit}
  `;

  return rows.map(rowToFundingRound);
}

// ─────────────────────────────────────────────────────────────────────────────
// Site stats aggregates
// ─────────────────────────────────────────────────────────────────────────────

export interface SiteStats {
  /** Published / non-rejected signals in the signals table. */
  signals: number;
  /** Total tracked entities (companies, labs, funds). */
  companies: number;
  /** Total regulatory acts / bills tracked. */
  regulations: number;
  /** Distinct article sources ingested. */
  sources: number;
  /** Total funding rounds tracked. */
  fundingRounds: number;
  /** Total AI models tracked (ai_models table). */
  models: number;
  /**
   * Sum of amount_usd_m across funding_rounds.
   * 0 when migration 004 is not yet applied or amounts not seeded.
   */
  totalFundingUsdM: number;
}

const STATS_ZERO: SiteStats = {
  signals: 0, companies: 0, regulations: 0, sources: 0,
  fundingRounds: 0, models: 0, totalFundingUsdM: 0,
};

/**
 * Compute live site-wide statistics from the database.
 *
 * Core counts (signals, entities, article sources) are fetched together.
 * Optional tables (regulations, ai_models, funding_rounds) are guarded by
 * existence checks first so a missing table never corrupts core counts or
 * produces 42P01 errors during build-time static rendering.
 *
 * Returns graceful zero fallbacks on any failure.
 */
export async function getSiteStats(): Promise<SiteStats> {
  try {
    // ── Core tables (always expected) ────────────────────────────────────────
    type CoreRow = { signals: string; companies: string; sources: string };

    const coreRows = await dbQuery<CoreRow>`
      SELECT
        (SELECT COUNT(*) FROM signals
          WHERE status IS NULL OR status NOT IN ('rejected'))::text AS signals,
        (SELECT COUNT(*) FROM entities)::text                       AS companies,
        (SELECT COUNT(DISTINCT source) FROM articles)::text         AS sources
    `;

    if (coreRows.length === 0) return STATS_ZERO;
    const c = coreRows[0];
    const base = {
      signals:   parseInt(c.signals,   10) || 0,
      companies: parseInt(c.companies, 10) || 0,
      sources:   parseInt(c.sources,   10) || 0,
    };

    // ── Optional tables (migration 003+) — check existence first ─────────────
    const [regsExist, modelsExist, fundingExist] = await Promise.all([
      tableExists('regulations'),
      tableExists('ai_models'),
      tableExists('funding_rounds'),
    ]);

    let regulations = 0;
    if (regsExist) {
      const rows = await dbQuery<{ count: string }>`
        SELECT COUNT(*)::text AS count FROM regulations
      `;
      regulations = parseInt(rows[0]?.count ?? '0', 10) || 0;
    }

    let models = 0;
    if (modelsExist) {
      const rows = await dbQuery<{ count: string }>`
        SELECT COUNT(*)::text AS count FROM ai_models
      `;
      models = parseInt(rows[0]?.count ?? '0', 10) || 0;
    }

    let fundingRounds = 0;
    let totalFundingUsdM = 0;
    if (fundingExist) {
      const rows = await dbQuery<{ count: string }>`
        SELECT COUNT(*)::text AS count FROM funding_rounds
      `;
      fundingRounds = parseInt(rows[0]?.count ?? '0', 10) || 0;

      // Optional: total funding from normalised column (requires migration 004).
      try {
        const fundRows = await dbQuery<{ total: string }>`
          SELECT COALESCE(SUM(amount_usd_m), 0)::text AS total
          FROM funding_rounds
          WHERE amount_usd_m IS NOT NULL
        `;
        totalFundingUsdM = parseFloat(fundRows[0]?.total ?? '0') || 0;
      } catch {
        // amount_usd_m column may not exist yet (migration 004 pending).
      }
    }

    return { ...base, regulations, fundingRounds, models, totalFundingUsdM };
  } catch {
    return STATS_ZERO;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal Contexts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Raw DB row returned by signal_contexts queries.
 *
 * affected_entities is stored as JSONB; Neon / pg parses it to a JS value
 * automatically.  implications is a TEXT[] column and arrives as string[].
 */
interface SignalContextRow {
  id: string;
  signal_id: string;
  summary: string | null;
  why_it_matters: string | null;
  affected_entities: SignalContextEntity[] | null;
  implications: string[] | null;
  confidence_explanation: string | null;
  source_basis: string | null;
  model_provider: string;
  model_name: string;
  prompt_version: string;
  status: string;
  generation_error: string | null;
  created_at: string;
  updated_at: string | null;
}

function isSignalContextStatus(v: string): v is SignalContextStatus {
  return v === 'pending' || v === 'ready' || v === 'failed';
}

function rowToSignalContext(row: SignalContextRow): SignalContext {
  return {
    id:                    row.id,
    signalId:              row.signal_id,
    summary:               row.summary,
    whyItMatters:          row.why_it_matters,
    affectedEntities:      row.affected_entities ?? [],
    implications:          row.implications ?? [],
    confidenceExplanation: row.confidence_explanation,
    sourceBasis:           row.source_basis,
    modelProvider:         row.model_provider,
    modelName:             row.model_name,
    promptVersion:         row.prompt_version,
    status:                isSignalContextStatus(row.status) ? row.status : 'pending',
    generationError:       row.generation_error,
    createdAt:             row.created_at,
    updatedAt:             row.updated_at ?? undefined,
  };
}

/**
 * Fetch the intelligence context for a single signal.
 *
 * Returns undefined when no context row exists yet (status still 'pending')
 * or when the table has not been migrated.
 *
 * @param signalId  The ID of the parent signal.
 */
export async function getSignalContext(signalId: string): Promise<SignalContext | undefined> {
  if (!(await tableExists('signal_contexts'))) return undefined;

  const rows = await dbQuery<SignalContextRow>`
    SELECT
      id,
      signal_id,
      summary,
      why_it_matters,
      affected_entities,
      implications,
      confidence_explanation,
      source_basis,
      model_provider,
      model_name,
      prompt_version,
      status,
      generation_error,
      created_at,
      updated_at
    FROM signal_contexts
    WHERE signal_id = ${signalId}
    LIMIT 1
  `;

  return rows.length > 0 ? rowToSignalContext(rows[0]) : undefined;
}

/**
 * Fetch signal contexts filtered by operational status.
 *
 * Primarily used by the generation pipeline to discover 'pending' rows
 * that need processing, or to surface 'failed' rows for operator review.
 *
 * @param status  The status to filter on ('pending' | 'ready' | 'failed').
 * @param limit   Maximum rows to return (default 50).
 */
export async function getSignalContextsByStatus(
  status: SignalContextStatus,
  limit = 50,
): Promise<SignalContext[]> {
  if (!(await tableExists('signal_contexts'))) return [];

  const safeLimit = Math.min(Math.max(1, limit), 200);

  const rows = await dbQuery<SignalContextRow>`
    SELECT
      id,
      signal_id,
      summary,
      why_it_matters,
      affected_entities,
      implications,
      confidence_explanation,
      source_basis,
      model_provider,
      model_name,
      prompt_version,
      status,
      generation_error,
      created_at,
      updated_at
    FROM signal_contexts
    WHERE status = ${status}
    ORDER BY created_at DESC
    LIMIT ${safeLimit}
  `;

  return rows.map(rowToSignalContext);
}
