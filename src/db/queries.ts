/**
 * Omterminal — Database Query Layer
 *
 * Frontend-facing query functions that read from Neon Postgres and return
 * data in the same shapes as the mock data files.  Each function falls back
 * to an empty array if DATABASE_URL is not configured or the query fails;
 * callers are responsible for supplying mock-data fallbacks when needed.
 *
 * Tables:
 *   signals  — populated by the intelligence engine (/api/signals)
 *   events   — populated by the ingestion pipeline (/api/ingest)
 *   entities — populated by seeding or the entity tracker
 */

import { dbQuery } from '@/db/client';
import type { Signal, SignalCategory } from '@/data/mockSignals';
import type { AiEvent, EventType } from '@/data/mockEvents';
import type { EntityProfile, RiskLevel } from '@/data/mockEntities';

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

  return {
    id:         row.id,
    title:      row.title,
    category,
    entityId:   row.entity_id ?? row.id,
    entityName: row.entity_name ?? '',
    summary:    row.summary ?? row.description,
    date:       row.date ?? row.created_at,
    confidence,
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
 * Fetch intelligence signals from the database.
 *
 * Reads from the `signals` table which is populated by the intelligence
 * engine pipeline (/api/signals).  Returns an empty array when the DB is
 * unavailable or the table is empty.
 *
 * @param limit  Maximum signals to return (default 50).
 */
export async function getSignals(limit = 50): Promise<Signal[]> {
  const safeLimit = Math.min(Math.max(1, limit), 200);

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
