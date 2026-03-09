import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export const runtime = 'nodejs';

const STATEMENTS = [
  // ── Core articles table (legacy, kept for compatibility) ──────────────────
  `CREATE TABLE IF NOT EXISTS articles (
    id           TEXT PRIMARY KEY,
    title        TEXT NOT NULL,
    source       TEXT NOT NULL,
    url          TEXT NOT NULL UNIQUE,
    published_at TIMESTAMPTZ NOT NULL,
    category     TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles (published_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_articles_category ON articles (category)`,
  `CREATE INDEX IF NOT EXISTS idx_articles_source ON articles (source)`,

  // ── Intelligence events (primary ingestion table used by gnewsFetcher) ────
  `CREATE TABLE IF NOT EXISTS intelligence_events (
    id           SERIAL PRIMARY KEY,
    title        TEXT NOT NULL,
    summary      TEXT NOT NULL DEFAULT '',
    source_url   TEXT NOT NULL UNIQUE,
    source_name  TEXT NOT NULL DEFAULT '',
    category     TEXT NOT NULL DEFAULT 'GENERAL',
    published_at TIMESTAMPTZ NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_intel_events_published_at ON intelligence_events (published_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_intel_events_category ON intelligence_events (category)`,
  `CREATE INDEX IF NOT EXISTS idx_intel_events_source_name ON intelligence_events (source_name)`,

  // ── Snapshot persistence (replaces /public/data/ file writes) ─────────────
  `CREATE TABLE IF NOT EXISTS snapshots (
    id           SERIAL PRIMARY KEY,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    total        INTEGER NOT NULL DEFAULT 0,
    payload      JSONB NOT NULL DEFAULT '{}'
  )`,
  `CREATE INDEX IF NOT EXISTS idx_snapshots_generated_at ON snapshots (generated_at DESC)`,

  // ── Signals (intelligence engine output) ─────────────────────────────────
  `CREATE TABLE IF NOT EXISTS signals (
    id               TEXT PRIMARY KEY,
    signal_type      TEXT CHECK (signal_type IN (
                       'CAPITAL_ACCELERATION','MODEL_RELEASE_WAVE',
                       'REGULATION_ACTIVITY','RESEARCH_MOMENTUM','COMPANY_EXPANSION'
                     )),
    title            TEXT NOT NULL,
    description      TEXT NOT NULL,
    supporting_events TEXT[] NOT NULL DEFAULT '{}',
    confidence_score NUMERIC(4,3) NOT NULL DEFAULT 0.0
                     CHECK (confidence_score BETWEEN 0.0 AND 1.0),
    direction        TEXT CHECK (direction IN ('bullish','bearish','neutral','uncertain')),
    affected_entities TEXT[],
    recommendation   TEXT,
    human_verified   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ
  )`,
  `CREATE INDEX IF NOT EXISTS idx_signals_signal_type ON signals (signal_type)`,
  `CREATE INDEX IF NOT EXISTS idx_signals_direction ON signals (direction)`,
  `CREATE INDEX IF NOT EXISTS idx_signals_created_at ON signals (created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_signals_confidence ON signals (confidence_score DESC)`,

  // ── Extend signals with frontend-facing columns ───────────────────────────
  `ALTER TABLE signals ADD COLUMN IF NOT EXISTS category    TEXT`,
  `ALTER TABLE signals ADD COLUMN IF NOT EXISTS entity_id   TEXT`,
  `ALTER TABLE signals ADD COLUMN IF NOT EXISTS entity_name TEXT`,
  `ALTER TABLE signals ADD COLUMN IF NOT EXISTS summary     TEXT`,
  `ALTER TABLE signals ADD COLUMN IF NOT EXISTS confidence  INTEGER`,
  `ALTER TABLE signals ADD COLUMN IF NOT EXISTS date        TEXT`,

  // ── Extend signals with publishing / trust columns ────────────────────────
  `ALTER TABLE signals ADD COLUMN IF NOT EXISTS status      TEXT CHECK (status IN ('auto','published','review','internal','rejected'))`,
  `ALTER TABLE signals ADD COLUMN IF NOT EXISTS trust_score INTEGER`,
  `ALTER TABLE signals ADD COLUMN IF NOT EXISTS source      TEXT`,
  `ALTER TABLE signals ADD COLUMN IF NOT EXISTS ai_model    TEXT`,

  // ── Events (legacy structured events table) ───────────────────────────────
  `CREATE TABLE IF NOT EXISTS events (
    id                TEXT PRIMARY KEY,
    type              TEXT NOT NULL,
    company           TEXT NOT NULL,
    related_model     TEXT,
    title             TEXT NOT NULL,
    description       TEXT NOT NULL,
    timestamp         TIMESTAMPTZ NOT NULL,
    source_article_id TEXT REFERENCES articles (id) ON DELETE SET NULL,
    tags              TEXT[],
    region            TEXT,
    payload           JSONB,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_events_type ON events (type)`,
  `CREATE INDEX IF NOT EXISTS idx_events_company ON events (company)`,
  `CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events (timestamp DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_events_source_article_id ON events (source_article_id)`,

  // ── Extend events with frontend-facing columns ────────────────────────────
  `ALTER TABLE events ADD COLUMN IF NOT EXISTS entity_id   TEXT`,
  `ALTER TABLE events ADD COLUMN IF NOT EXISTS entity_name TEXT`,
  `ALTER TABLE events ADD COLUMN IF NOT EXISTS amount      TEXT`,
  `ALTER TABLE events ADD COLUMN IF NOT EXISTS signal_ids  TEXT[]`,

  // ── Entities (AI ecosystem actors: companies, labs, funds) ───────────────
  `CREATE TABLE IF NOT EXISTS entities (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL DEFAULT 'company',
    description     TEXT NOT NULL DEFAULT '',
    sector          TEXT,
    country         TEXT,
    founded         INTEGER,
    website         TEXT,
    risk_level      TEXT CHECK (risk_level IN ('low','medium','high')) DEFAULT 'low',
    tags            TEXT[],
    financial_scale TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_entities_type       ON entities (type)`,
  `CREATE INDEX IF NOT EXISTS idx_entities_created_at ON entities (created_at DESC)`,

  // ── Ensure entities.name is unique (required for upsert deduplication) ──
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_entities_name ON entities (name)`,

  // ── Signal–entity relationships (graph edges) ─────────────────────────────
  `CREATE TABLE IF NOT EXISTS signal_entities (
    signal_id  TEXT          NOT NULL REFERENCES signals (id) ON DELETE CASCADE,
    entity_id  TEXT          NOT NULL REFERENCES entities (id) ON DELETE CASCADE,
    confidence NUMERIC(4,3)  NOT NULL DEFAULT 0.8
                             CHECK (confidence BETWEEN 0.0 AND 1.0),
    PRIMARY KEY (signal_id, entity_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_signal_entities_signal_id ON signal_entities (signal_id)`,
  `CREATE INDEX IF NOT EXISTS idx_signal_entities_entity_id ON signal_entities (entity_id)`,

  // ── Access requests ───────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS access_requests (
    id         SERIAL PRIMARY KEY,
    email      TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_access_requests_created_at ON access_requests (created_at DESC)`,
];

/** Table names that are created (or verified) by the migration. */
const TABLES_CREATED = [
  'articles',
  'intelligence_events',
  'snapshots',
  'signals',
  'events',
  'entities',
  'signal_entities',
  'access_requests',
];

export async function POST(req: NextRequest) {
  const url = new URL(req.url);

  // Accept either ADMIN_SECRET (via ?key=) or CRON_SECRET (via ?secret= / x-cron-secret header)
  const keyParam    = url.searchParams.get('key')    || '';
  const secretParam = url.searchParams.get('secret') || '';
  const cronHeader  = req.headers.get('x-cron-secret') || '';

  const adminSecret = process.env.ADMIN_SECRET || '';
  const cronSecret  = process.env.CRON_SECRET  || '';

  const authorizedByAdmin = adminSecret !== '' && keyParam === adminSecret;
  const authorizedByCron  = cronSecret  !== '' && (secretParam === cronSecret || cronHeader === cronSecret);

  // If either secret is configured, at least one must match
  if ((adminSecret !== '' || cronSecret !== '') && !authorizedByAdmin && !authorizedByCron) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return NextResponse.json({ error: 'DATABASE_URL not configured' }, { status: 500 });
  }

  try {
    const sql = neon(dbUrl);

    for (const stmt of STATEMENTS) {
      await sql(stmt);
    }

    return NextResponse.json({
      ok:             true,
      message:        'Migration complete',
      statements:     STATEMENTS.length,
      tables_created: TABLES_CREATED,
    });
  } catch (err) {
    console.error('[migrate] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
