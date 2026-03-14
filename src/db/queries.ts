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

  // ── Significance columns (migration 008) ──
  /** Composite significance score (0–100), null for pre-migration rows */
  significance_score: number | null;
  /** Number of distinct sources corroborating this signal */
  source_support_count: number | null;

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
    significanceScore:  row.significance_score ?? undefined,
    sourceSupportCount: row.source_support_count ?? undefined,
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
          s.significance_score,
          s.source_support_count,
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
        created_at,
        significance_score,
        source_support_count
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
  const minSig = config.minSignificance;

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
        s.significance_score,
        s.source_support_count,
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
        AND (${minSig} = 0 OR s.significance_score IS NULL OR s.significance_score >= ${minSig})
      ORDER BY
        s.significance_score DESC NULLS LAST,
        s.confidence_score DESC NULLS LAST,
        s.created_at DESC
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
      created_at,
      significance_score,
      source_support_count
    FROM signals
    WHERE (status IS NULL OR status IN ('auto', 'published'))
      AND (confidence_score IS NULL OR confidence_score >= ${minCs})
      AND (${minSig} = 0 OR significance_score IS NULL OR significance_score >= ${minSig})
    ORDER BY
      significance_score DESC NULLS LAST,
      confidence_score DESC NULLS LAST,
      created_at DESC
    LIMIT ${safeLimit}
  `;

  return rows.map(rowToSignal);
}

/**
 * Fetch a single signal by ID, including its context if available.
 *
 * Returns null when the signal doesn't exist or the DB is unavailable.
 */
export async function getSignalById(id: string): Promise<Signal | null> {
  const hasContextTable = await tableExists('signal_contexts');

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
        s.significance_score,
        s.source_support_count,
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
      WHERE s.id = ${id}
      LIMIT 1
    `;
    return rows.length > 0 ? rowToSignal(rows[0]) : null;
  }

  const rows = await dbQuery<SignalRow>`
    SELECT
      id, title, summary, description, category, signal_type,
      entity_id, entity_name, confidence, confidence_score,
      date, created_at, significance_score, source_support_count
    FROM signals
    WHERE id = ${id}
    LIMIT 1
  `;
  return rows.length > 0 ? rowToSignal(rows[0]) : null;
}

/**
 * Fetch signals related to a given signal by shared entity.
 *
 * Returns up to `limit` signals for the same entity, excluding the
 * signal itself.
 */
export async function getRelatedSignals(
  signalId: string,
  entityName: string,
  limit = 5,
): Promise<Signal[]> {
  const safeLimit = Math.min(Math.max(1, limit), 20);

  const rows = await dbQuery<SignalRow>`
    SELECT
      id, title, summary, description, category, signal_type,
      entity_id, entity_name, confidence, confidence_score,
      date, created_at, significance_score, source_support_count
    FROM signals
    WHERE entity_name = ${entityName}
      AND id != ${signalId}
      AND (status IS NULL OR status NOT IN ('rejected'))
    ORDER BY significance_score DESC NULLS LAST, created_at DESC
    LIMIT ${safeLimit}
  `;
  return rows.map(rowToSignal);
}

/**
 * Fetch supporting events for a given signal.
 *
 * Resolution order (results are merged and deduplicated):
 *   1. Direct linkage — events whose IDs are in signals.supporting_events[]
 *   2. Back-reference — events whose signal_ids[] contain this signal ID
 *   3. Entity fallback — events sharing the same entity_name, within 90 days
 *
 * Returns an empty array when no evidence can be found.
 *
 * @param signalId    The signal to find evidence for.
 * @param entityName  The signal's entity name (used for fallback matching).
 * @param limit       Maximum events to return (default 10).
 */
export async function getSupportingEventsForSignal(
  signalId: string,
  entityName: string,
  limit = 10,
): Promise<AiEvent[]> {
  const safeLimit = Math.min(Math.max(1, limit), 50);

  try {
    // Strategy: single query that UNIONs direct linkage, back-reference, and
    // entity-based fallback, then deduplicates and limits.
    const rows = await dbQuery<EventRow>`
      WITH direct AS (
        -- Events whose IDs are listed in signals.supporting_events[]
        SELECT e.*
        FROM events e
        INNER JOIN signals s ON s.id = ${signalId}
        WHERE e.id = ANY(s.supporting_events)
      ),
      backref AS (
        -- Events that reference this signal in their signal_ids[]
        SELECT e.*
        FROM events e
        WHERE e.signal_ids @> ARRAY[${signalId}]::text[]
      ),
      entity_match AS (
        -- Fallback: events for the same entity within 90 days
        SELECT e.*
        FROM events e
        WHERE e.entity_name = ${entityName}
          AND e.entity_name != ''
          AND e.timestamp >= NOW() - INTERVAL '90 days'
      ),
      combined AS (
        SELECT * FROM direct
        UNION
        SELECT * FROM backref
        UNION
        SELECT * FROM entity_match
      )
      SELECT
        id, type, title, description,
        entity_id, entity_name, company,
        amount, signal_ids, timestamp, created_at
      FROM combined
      ORDER BY timestamp DESC
      LIMIT ${safeLimit}
    `;

    return rows.map(rowToEvent);
  } catch {
    return [];
  }
}

/**
 * Fetch a single event by ID for the event detail page.
 *
 * Returns null when the event doesn't exist or the DB is unavailable.
 */
export async function getEventById(id: string): Promise<AiEvent | null> {
  try {
    const rows = await dbQuery<EventRow>`
      SELECT
        id, type, title, description,
        entity_id, entity_name, company,
        amount, signal_ids, timestamp, created_at
      FROM events
      WHERE id = ${id}
      LIMIT 1
    `;
    return rows.length > 0 ? rowToEvent(rows[0]) : null;
  } catch {
    return null;
  }
}

/**
 * Fetch signals linked to a given event.
 *
 * Resolution: uses the event's signal_ids[] array for direct linkage,
 * then falls back to signals sharing the same entity_name.
 *
 * @param eventId     The event ID.
 * @param signalIds   Direct signal ID references from the event.
 * @param entityName  The event's entity name (used for fallback matching).
 * @param limit       Maximum signals to return (default 10).
 */
export async function getSignalsForEvent(
  eventId: string,
  signalIds: string[] | undefined,
  entityName: string,
  limit = 10,
): Promise<Signal[]> {
  const safeLimit = Math.min(Math.max(1, limit), 50);

  try {
    const rows = await dbQuery<SignalRow>`
      WITH direct AS (
        -- Signals directly referenced by event.signal_ids[]
        SELECT s.*
        FROM signals s
        WHERE ${signalIds && signalIds.length > 0}
          AND s.id = ANY(${signalIds ?? []}::text[])
      ),
      backref AS (
        -- Signals whose supporting_events[] contain this event
        SELECT s.*
        FROM signals s
        WHERE s.supporting_events @> ARRAY[${eventId}]::text[]
      ),
      entity_match AS (
        -- Fallback: signals for the same entity
        SELECT s.*
        FROM signals s
        WHERE s.entity_name = ${entityName}
          AND s.entity_name != ''
          AND (s.status IS NULL OR s.status NOT IN ('rejected'))
      ),
      combined AS (
        SELECT * FROM direct
        UNION
        SELECT * FROM backref
        UNION
        SELECT * FROM entity_match
      )
      SELECT
        id, title, summary, description, category, signal_type,
        entity_id, entity_name, confidence, confidence_score,
        date, created_at, significance_score, source_support_count
      FROM combined
      ORDER BY significance_score DESC NULLS LAST, created_at DESC
      LIMIT ${safeLimit}
    `;
    return rows.map(rowToSignal);
  } catch {
    return [];
  }
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
// Entity Dossier Queries
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch a single entity by name for the entity dossier page.
 *
 * Returns null when the entity doesn't exist or the DB is unavailable.
 */
export async function getEntityByName(name: string): Promise<EntityProfile | null> {
  try {
    const rows = await dbQuery<EntityRow>`
      SELECT
        id, name, type, description, sector, country,
        founded, website, risk_level, tags, financial_scale, created_at
      FROM entities
      WHERE name = ${name}
      LIMIT 1
    `;
    return rows.length > 0 ? rowToEntity(rows[0]) : null;
  } catch {
    return null;
  }
}

/**
 * Fetch a single entity by URL slug for the entity dossier page.
 *
 * Matches the slug against a slugified version of the entity name.
 * Falls back to fetching all entities and matching client-side because
 * PostgreSQL doesn't have a built-in slugify that mirrors our TS util.
 */
export async function getEntityBySlug(slug: string): Promise<EntityProfile | null> {
  // Import lazily to avoid circular deps
  const { slugify } = await import('@/utils/sanitize');
  try {
    const rows = await dbQuery<EntityRow>`
      SELECT
        id, name, type, description, sector, country,
        founded, website, risk_level, tags, financial_scale, created_at
      FROM entities
      ORDER BY created_at ASC
    `;
    const match = rows.find((r) => slugify(r.name) === slug);
    return match ? rowToEntity(match) : null;
  } catch {
    return null;
  }
}

/**
 * Fetch signals linked to an entity via the signal_entities junction table.
 *
 * Used by the entity dossier page to show recent intelligence activity.
 *
 * @param entityName  The entity name to match.
 * @param limit       Maximum signals to return (default 20).
 */
export async function getSignalsForEntity(
  entityName: string,
  limit = 20,
): Promise<Signal[]> {
  const safeLimit = Math.min(Math.max(1, limit), 50);

  try {
    const hasJunction = await tableExists('signal_entities');

    if (hasJunction) {
      const rows = await dbQuery<SignalRow>`
        SELECT
          s.id, s.title, s.summary, s.description,
          s.category, s.signal_type, s.entity_id, s.entity_name,
          s.confidence, s.confidence_score, s.date, s.created_at,
          s.significance_score, s.source_support_count
        FROM signals s
        JOIN signal_entities se ON se.signal_id = s.id
        JOIN entities e ON e.id = se.entity_id
        WHERE e.name = ${entityName}
          AND (s.status IS NULL OR s.status NOT IN ('rejected'))
        ORDER BY s.created_at DESC
        LIMIT ${safeLimit}
      `;
      return rows.map(rowToSignal);
    }

    // Fallback: match on denormalized entity_name column
    const rows = await dbQuery<SignalRow>`
      SELECT
        id, title, summary, description,
        category, signal_type, entity_id, entity_name,
        confidence, confidence_score, date, created_at,
        significance_score, source_support_count
      FROM signals
      WHERE entity_name = ${entityName}
        AND (status IS NULL OR status NOT IN ('rejected'))
      ORDER BY created_at DESC
      LIMIT ${safeLimit}
    `;
    return rows.map(rowToSignal);
  } catch {
    return [];
  }
}

/**
 * Fetch recent signals for multiple entities (watchlist feed).
 *
 * Accepts an array of entity names (from the client-side watchlist),
 * returns deduplicated signals ordered by recency, limited to `limit`.
 */
export async function getSignalsForEntities(
  entityNames: string[],
  limit = 30,
): Promise<Signal[]> {
  if (entityNames.length === 0) return [];
  const safeLimit = Math.min(Math.max(1, limit), 100);

  try {
    const hasJunction = await tableExists('signal_entities');

    if (hasJunction) {
      const rows = await dbQuery<SignalRow>`
        SELECT DISTINCT ON (s.id)
          s.id, s.title, s.summary, s.description,
          s.category, s.signal_type, s.entity_id, s.entity_name,
          s.confidence, s.confidence_score, s.date, s.created_at,
          s.significance_score, s.source_support_count
        FROM signals s
        JOIN signal_entities se ON se.signal_id = s.id
        JOIN entities e ON e.id = se.entity_id
        WHERE e.name = ANY(${entityNames})
          AND (s.status IS NULL OR s.status NOT IN ('rejected'))
        ORDER BY s.id, s.created_at DESC
      `;
      // Re-sort by recency after DISTINCT ON id
      rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return rows.slice(0, safeLimit).map(rowToSignal);
    }

    // Fallback: match on denormalized entity_name column
    const rows = await dbQuery<SignalRow>`
      SELECT
        id, title, summary, description,
        category, signal_type, entity_id, entity_name,
        confidence, confidence_score, date, created_at,
        significance_score, source_support_count
      FROM signals
      WHERE entity_name = ANY(${entityNames})
        AND (status IS NULL OR status NOT IN ('rejected'))
      ORDER BY created_at DESC
      LIMIT ${safeLimit}
    `;
    return rows.map(rowToSignal);
  } catch {
    return [];
  }
}

/**
 * Fetch events linked to an entity.
 *
 * Matches on the denormalized entity_name column in the events table.
 *
 * @param entityName  The entity name to match.
 * @param limit       Maximum events to return (default 20).
 */
export async function getEventsForEntity(
  entityName: string,
  limit = 20,
): Promise<AiEvent[]> {
  const safeLimit = Math.min(Math.max(1, limit), 50);

  try {
    const rows = await dbQuery<EventRow>`
      SELECT
        id, type, title, description,
        entity_id, entity_name, company,
        amount, signal_ids, timestamp, created_at
      FROM events
      WHERE entity_name = ${entityName}
      ORDER BY timestamp DESC
      LIMIT ${safeLimit}
    `;
    return rows.map(rowToEvent);
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Entity Timeline
// ─────────────────────────────────────────────────────────────────────────────

export interface TimelineItem {
  type: 'signal' | 'event';
  id: string;
  title: string;
  category: string;
  timestamp: string;
  confidence?: number;
  amount?: string;
  href: string;
}

/**
 * Fetch a merged, chronologically-sorted timeline of signals and events
 * for a single entity.
 *
 * @param entityName  The entity name to match.
 * @param limit       Maximum items to return (default 25, max 50).
 */
export async function getEntityTimeline(
  entityName: string,
  limit = 25,
): Promise<TimelineItem[]> {
  const safeLimit = Math.min(Math.max(1, limit), 50);

  const [signals, events] = await Promise.all([
    getSignalsForEntity(entityName, safeLimit).catch(() => []),
    getEventsForEntity(entityName, safeLimit).catch(() => []),
  ]);

  const items: TimelineItem[] = [];

  for (const sig of signals) {
    items.push({
      type: 'signal',
      id: sig.id,
      title: sig.title,
      category: sig.category,
      timestamp: sig.date,
      confidence: sig.confidence,
      href: `/signals/${sig.id}`,
    });
  }

  for (const evt of events) {
    items.push({
      type: 'event',
      id: evt.id,
      title: evt.title,
      category: evt.type,
      timestamp: evt.date,
      amount: evt.amount,
      href: `/events/${evt.id}`,
    });
  }

  items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return items.slice(0, safeLimit);
}

/**
 * Aggregated metrics for an entity dossier.
 */
export interface EntityDossierMetrics {
  signalsTotal: number;
  signals24h: number;
  signals7d: number;
  signals30d: number;
  eventsTotal: number;
  avgConfidence: number;
  firstSeen: string | null;
  lastActivity: string | null;
}

/**
 * Compute aggregated metrics for an entity.
 *
 * Uses the signal_entities junction table when available, with a fallback
 * to the denormalized entity_name column.
 *
 * @param entityName  The entity name to compute metrics for.
 */
export async function getEntityMetrics(entityName: string): Promise<EntityDossierMetrics> {
  const zero: EntityDossierMetrics = {
    signalsTotal: 0, signals24h: 0, signals7d: 0, signals30d: 0,
    eventsTotal: 0, avgConfidence: 0, firstSeen: null, lastActivity: null,
  };

  try {
    const hasJunction = await tableExists('signal_entities');

    if (hasJunction) {
      type MetricRow = {
        total: string;
        h24: string;
        d7: string;
        d30: string;
        avg_conf: string | null;
        first_seen: string | null;
        last_activity: string | null;
      };

      const [row] = await dbQuery<MetricRow>`
        SELECT
          COUNT(*)::text AS total,
          COUNT(*) FILTER (WHERE s.created_at > NOW() - INTERVAL '24 hours')::text AS h24,
          COUNT(*) FILTER (WHERE s.created_at > NOW() - INTERVAL '7 days')::text AS d7,
          COUNT(*) FILTER (WHERE s.created_at > NOW() - INTERVAL '30 days')::text AS d30,
          AVG(COALESCE(s.confidence, 50))::numeric(5,1)::text AS avg_conf,
          MIN(s.created_at)::text AS first_seen,
          MAX(s.created_at)::text AS last_activity
        FROM signals s
        JOIN signal_entities se ON se.signal_id = s.id
        JOIN entities e ON e.id = se.entity_id
        WHERE e.name = ${entityName}
      `;

      const [evtRow] = await dbQuery<{ count: string }>`
        SELECT COUNT(*)::text AS count
        FROM events
        WHERE entity_name = ${entityName}
      `;

      if (!row) return zero;

      return {
        signalsTotal: parseInt(row.total, 10) || 0,
        signals24h: parseInt(row.h24, 10) || 0,
        signals7d: parseInt(row.d7, 10) || 0,
        signals30d: parseInt(row.d30, 10) || 0,
        eventsTotal: parseInt(evtRow?.count ?? '0', 10) || 0,
        avgConfidence: row.avg_conf != null ? parseFloat(row.avg_conf) : 0,
        firstSeen: row.first_seen,
        lastActivity: row.last_activity,
      };
    }

    // Fallback: denormalized entity_name
    type MetricRow = {
      total: string;
      h24: string;
      d7: string;
      d30: string;
      avg_conf: string | null;
      first_seen: string | null;
      last_activity: string | null;
    };

    const [row] = await dbQuery<MetricRow>`
      SELECT
        COUNT(*)::text AS total,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::text AS h24,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::text AS d7,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::text AS d30,
        AVG(COALESCE(confidence, 50))::numeric(5,1)::text AS avg_conf,
        MIN(created_at)::text AS first_seen,
        MAX(created_at)::text AS last_activity
      FROM signals
      WHERE entity_name = ${entityName}
    `;

    const [evtRow] = await dbQuery<{ count: string }>`
      SELECT COUNT(*)::text AS count
      FROM events
      WHERE entity_name = ${entityName}
    `;

    if (!row) return zero;

    return {
      signalsTotal: parseInt(row.total, 10) || 0,
      signals24h: parseInt(row.h24, 10) || 0,
      signals7d: parseInt(row.d7, 10) || 0,
      signals30d: parseInt(row.d30, 10) || 0,
      eventsTotal: parseInt(evtRow?.count ?? '0', 10) || 0,
      avgConfidence: row.avg_conf != null ? parseFloat(row.avg_conf) : 0,
      firstSeen: row.first_seen,
      lastActivity: row.last_activity,
    };
  } catch {
    return zero;
  }
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

// ─────────────────────────────────────────────────────────────────────────────
// Ecosystem Activity Snapshot
// ─────────────────────────────────────────────────────────────────────────────

/** Entity with aggregated signal count for the "most active" ranking. */
export interface ActiveEntity {
  name: string;
  signalCount: number;
}

/**
 * High-level ecosystem activity snapshot used by the intelligence feed
 * overview section.  Structured for future expansion (weekly summaries,
 * momentum indicators, heatmaps, trend detection).
 */
export interface EcosystemSnapshot {
  /** Top signals by significance + recency (max 5). */
  topSignals: Signal[];
  /** Entities ranked by recent signal volume (max 8). */
  mostActiveEntities: ActiveEntity[];
  /** Most recent funding rounds (max 5). */
  recentFunding: FundingRound[];
  /** Most recent model releases (max 5). */
  modelReleases: AIModel[];
}

const EMPTY_SNAPSHOT: EcosystemSnapshot = {
  topSignals: [],
  mostActiveEntities: [],
  recentFunding: [],
  modelReleases: [],
};

/**
 * Compute an ecosystem activity snapshot from the database.
 *
 * Each sub-query is independent and fails gracefully so a single missing
 * table never breaks the entire snapshot.  The function is designed for
 * extension — future callers can add timeRange, groupBy, or momentum
 * parameters without changing the return shape.
 */
export async function getEcosystemActivitySnapshot(): Promise<EcosystemSnapshot> {
  try {
    const [topSignals, mostActiveEntities, recentFunding, modelReleases] =
      await Promise.all([
        // ── Top signals (significance + recency) ──────────────────────
        getSignals(5, 'standard').catch(() => [] as Signal[]),

        // ── Most active entities by signal count ──────────────────────
        (async (): Promise<ActiveEntity[]> => {
          try {
            type Row = { entity_name: string; signal_count: string };
            const rows = await dbQuery<Row>`
              SELECT entity_name, COUNT(*)::text AS signal_count
              FROM signals
              WHERE entity_name IS NOT NULL
                AND entity_name != ''
                AND (status IS NULL OR status NOT IN ('rejected'))
              GROUP BY entity_name
              ORDER BY COUNT(*) DESC
              LIMIT 8
            `;
            return rows.map((r) => ({
              name: r.entity_name,
              signalCount: parseInt(r.signal_count, 10) || 0,
            }));
          } catch {
            return [];
          }
        })(),

        // ── Recent funding rounds ─────────────────────────────────────
        getFundingRounds(5).catch(() => [] as FundingRound[]),

        // ── Model releases ────────────────────────────────────────────
        getModels(5).catch(() => [] as AIModel[]),
      ]);

    return { topSignals, mostActiveEntities, recentFunding, modelReleases };
  } catch {
    return EMPTY_SNAPSHOT;
  }
}
