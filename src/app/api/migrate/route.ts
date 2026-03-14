import { NextRequest, NextResponse } from 'next/server';
import { validateEnvironment } from '@/lib/env';
import { dbExec } from '@/db/client';

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
  `ALTER TABLE signals ADD COLUMN IF NOT EXISTS entities    JSONB`,

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

  // ── Trend time-series ─────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS trend_timeseries (
    id           SERIAL PRIMARY KEY,
    topic        TEXT NOT NULL,
    signal_count INT NOT NULL,
    recorded_at  TIMESTAMP DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_trend_timeseries_topic_time ON trend_timeseries(topic, recorded_at DESC)`,

  // ── Trends (aggregated trend snapshots) ──────────────────────────────────
  `CREATE TABLE IF NOT EXISTS trends (
    id               SERIAL PRIMARY KEY,
    topic            TEXT NOT NULL,
    direction        TEXT CHECK (direction IN ('rising','falling','stable')),
    score            NUMERIC(5,2)  NOT NULL DEFAULT 0,
    signal_count     INT           NOT NULL DEFAULT 0,
    summary          TEXT,
    category         TEXT,
    entities         JSONB,
    confidence       NUMERIC(5,2)  NOT NULL DEFAULT 0,
    importance_score NUMERIC(5,2)  NOT NULL DEFAULT 0,
    velocity_score   NUMERIC(5,2)  NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_trends_topic      ON trends (topic)`,
  `CREATE INDEX        IF NOT EXISTS idx_trends_created_at ON trends (created_at DESC)`,
  // Backfill any columns missing from a pre-existing trends table
  `ALTER TABLE trends ADD COLUMN IF NOT EXISTS category         TEXT`,
  `ALTER TABLE trends ADD COLUMN IF NOT EXISTS entities         JSONB`,
  `ALTER TABLE trends ADD COLUMN IF NOT EXISTS confidence       NUMERIC(5,2) NOT NULL DEFAULT 0`,
  `ALTER TABLE trends ADD COLUMN IF NOT EXISTS importance_score NUMERIC(5,2) NOT NULL DEFAULT 0`,
  `ALTER TABLE trends ADD COLUMN IF NOT EXISTS velocity_score   NUMERIC(5,2) NOT NULL DEFAULT 0`,

  // ── Insights (AI-generated narrative summaries from trends) ──────────────
  `CREATE TABLE IF NOT EXISTS insights (
    id         SERIAL PRIMARY KEY,
    title      TEXT          NOT NULL,
    summary    TEXT          NOT NULL DEFAULT '',
    category   TEXT,
    topics     JSONB,
    confidence NUMERIC(5,2)  NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_insights_title      ON insights (title)`,
  `CREATE INDEX        IF NOT EXISTS idx_insights_created_at ON insights (created_at DESC)`,

  // ── Pipeline runs (health monitoring) ────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS pipeline_runs (
    id                SERIAL PRIMARY KEY,
    stage             TEXT NOT NULL,
    status            TEXT NOT NULL CHECK (status IN ('ok','error','partial')),
    duration_ms       INT,
    ingested          INT,
    signals_generated INT,
    error_msg         TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_pipeline_runs_created_at ON pipeline_runs (created_at DESC)`,

  // ── Migration 003: Regulations ────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS regulations (
    id          TEXT        PRIMARY KEY,
    title       TEXT        NOT NULL,
    type        TEXT        NOT NULL CHECK (type IN ('law', 'bill', 'exec', 'policy', 'report')),
    country     TEXT        NOT NULL,
    flag        TEXT        NOT NULL DEFAULT '',
    status      TEXT        NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'pending', 'passed')),
    summary     TEXT        NOT NULL DEFAULT '',
    date        TEXT        NOT NULL DEFAULT '',
    impact      TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ
  )`,
  `CREATE INDEX IF NOT EXISTS idx_regulations_status  ON regulations (status)`,
  `CREATE INDEX IF NOT EXISTS idx_regulations_type    ON regulations (type)`,
  `CREATE INDEX IF NOT EXISTS idx_regulations_country ON regulations (country)`,
  `CREATE INDEX IF NOT EXISTS idx_regulations_created ON regulations (created_at DESC)`,

  // ── Migration 003: AI Models ──────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS ai_models (
    id              TEXT        PRIMARY KEY,
    name            TEXT        NOT NULL,
    company         TEXT        NOT NULL,
    icon            TEXT        NOT NULL DEFAULT '',
    release_date    TEXT        NOT NULL DEFAULT '',
    type            TEXT        NOT NULL DEFAULT 'proprietary'
                      CHECK (type IN ('proprietary', 'open-weight', 'open-source')),
    context_window  TEXT        NOT NULL DEFAULT '',
    key_capability  TEXT        NOT NULL DEFAULT '',
    summary         TEXT        NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ai_models_company  ON ai_models (company)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_models_type     ON ai_models (type)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_models_created  ON ai_models (created_at DESC)`,

  // ── Migration 003: Funding Rounds ─────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS funding_rounds (
    id          TEXT        PRIMARY KEY,
    company     TEXT        NOT NULL,
    icon        TEXT        NOT NULL DEFAULT '',
    amount      TEXT        NOT NULL,
    valuation   TEXT        NOT NULL DEFAULT '',
    round       TEXT        NOT NULL,
    date        TEXT        NOT NULL DEFAULT '',
    investors   TEXT[]      NOT NULL DEFAULT '{}',
    summary     TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ
  )`,
  `CREATE INDEX IF NOT EXISTS idx_funding_rounds_company ON funding_rounds (company)`,
  `CREATE INDEX IF NOT EXISTS idx_funding_rounds_round   ON funding_rounds (round)`,
  `CREATE INDEX IF NOT EXISTS idx_funding_rounds_created ON funding_rounds (created_at DESC)`,

  // ── Migration 004: funding amount normalisation ───────────────────────────
  // Stores pre-parsed USD-million equivalent alongside the display text.
  // Populated by the seed route/script after initial migration.
  `ALTER TABLE funding_rounds
     ADD COLUMN IF NOT EXISTS amount_usd_m NUMERIC(12, 2)`,
  `CREATE INDEX IF NOT EXISTS idx_funding_rounds_amount_usd
     ON funding_rounds (amount_usd_m DESC NULLS LAST)`,

  // ── Migration 005: pipeline hardening ────────────────────────────────────
  // Extends pipeline_runs into a full operational ledger.
  // Adds pipeline_locks for distributed concurrency control.
  // Adds page_snapshots for precomputed read models.

  // pipeline_runs: extend with operational columns
  `ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS run_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
  `ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS trigger_type      TEXT        DEFAULT 'internal'`,
  `ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS started_at        TIMESTAMPTZ`,
  `ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS completed_at      TIMESTAMPTZ`,
  `ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS articles_fetched  INTEGER`,
  `ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS articles_inserted INTEGER`,
  `ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS articles_deduped  INTEGER`,
  `ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS events_created    INTEGER`,
  `ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS warnings_count    INTEGER DEFAULT 0`,
  `ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS errors_count      INTEGER DEFAULT 0`,
  `ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS error_summary     TEXT`,
  `ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS correlation_id    TEXT`,
  // Expand status constraint to include 'skipped' and 'started'
  `ALTER TABLE pipeline_runs DROP CONSTRAINT IF EXISTS pipeline_runs_status_check`,
  `ALTER TABLE pipeline_runs ADD CONSTRAINT pipeline_runs_status_check
     CHECK (status IN ('ok', 'error', 'partial', 'skipped', 'started'))`,
  `CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status      ON pipeline_runs (status)`,
  `CREATE INDEX IF NOT EXISTS idx_pipeline_runs_trigger     ON pipeline_runs (trigger_type)`,
  `CREATE INDEX IF NOT EXISTS idx_pipeline_runs_correlation ON pipeline_runs (correlation_id)`,

  // pipeline_locks: distributed lock table
  `CREATE TABLE IF NOT EXISTS pipeline_locks (
    lock_key   TEXT        PRIMARY KEY,
    locked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    run_id     TEXT,
    locked_by  TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_pipeline_locks_expires ON pipeline_locks (expires_at)`,

  // page_snapshots: precomputed read models for public pages
  `CREATE TABLE IF NOT EXISTS page_snapshots (
    key          TEXT        PRIMARY KEY,
    payload      JSONB       NOT NULL DEFAULT '{}',
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ttl_seconds  INTEGER     NOT NULL DEFAULT 300
  )`,
  `CREATE INDEX IF NOT EXISTS idx_page_snapshots_generated_at ON page_snapshots (generated_at DESC)`,

  // ── Migration 006: Signal Intelligence Context Layer ──────────────────────
  // One-to-one structured context table per signal.  Generated by the
  // write-side pipeline; never computed at request time.
  `CREATE TABLE IF NOT EXISTS signal_contexts (
    id                     TEXT        PRIMARY KEY,
    signal_id              TEXT        NOT NULL UNIQUE
                             REFERENCES signals (id) ON DELETE CASCADE,
    summary                TEXT,
    why_it_matters         TEXT,
    affected_entities      JSONB       NOT NULL DEFAULT '[]',
    implications           TEXT[]      NOT NULL DEFAULT '{}',
    confidence_explanation TEXT,
    source_basis           TEXT,
    model_provider         TEXT        NOT NULL DEFAULT '',
    model_name             TEXT        NOT NULL DEFAULT '',
    prompt_version         TEXT        NOT NULL DEFAULT '',
    status                 TEXT        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'ready', 'failed')),
    generation_error       TEXT,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_signal_contexts_signal_id
     ON signal_contexts (signal_id)`,
  `CREATE INDEX IF NOT EXISTS idx_signal_contexts_status
     ON signal_contexts (status)`,
  `CREATE INDEX IF NOT EXISTS idx_signal_contexts_created_at
     ON signal_contexts (created_at DESC)`,

  // ── Migration 007: Signal Context Hardening ───────────────────────────────
  // Composite indexes that improve the two main query patterns added in
  // migration 006:
  //   1. getSignalContextsByStatus() — filters by status, orders by created_at
  //   2. getSignals() LEFT JOIN — joins on (signal_id, status='ready')
  `CREATE INDEX IF NOT EXISTS idx_signal_contexts_status_created_at
     ON signal_contexts (status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_signal_contexts_signal_id_status
     ON signal_contexts (signal_id, status)`,

  // ── Migration 008: Signal Significance Foundation ─────────────────────────
  // Adds significance_score (0–100) and source_support_count to signals.
  // Both columns are nullable for backward compatibility with existing rows.
  // significance_score is a composite metric computed at write time:
  //   confidence × weight + source diversity + velocity + type weight + entity spread
  // source_support_count tracks how many distinct sources corroborate the signal.
  `ALTER TABLE signals
     ADD COLUMN IF NOT EXISTS significance_score INTEGER
       CHECK (significance_score >= 0 AND significance_score <= 100)`,
  `ALTER TABLE signals
     ADD COLUMN IF NOT EXISTS source_support_count INTEGER`,
  // Index for significance-ordered reads (NULLS LAST keeps legacy rows below scored ones).
  `CREATE INDEX IF NOT EXISTS idx_signals_significance
     ON signals (significance_score DESC NULLS LAST)`,
  // Composite index for significance + recency tie-breaking.
  `CREATE INDEX IF NOT EXISTS idx_signals_significance_created_at
     ON signals (significance_score DESC NULLS LAST, created_at DESC)`,

  // ── Migration 009: Personal Intelligence Alerts ────────────────────────
  `CREATE TABLE IF NOT EXISTS alerts (
    id          TEXT        PRIMARY KEY,
    user_id     TEXT,
    type        TEXT        NOT NULL CHECK (type IN (
                              'signal_high_impact',
                              'signal_momentum',
                              'entity_watch',
                              'trend_detected'
                            )),
    entity_name TEXT,
    signal_id   TEXT,
    trend_id    TEXT,
    title       TEXT        NOT NULL,
    message     TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read        BOOLEAN     NOT NULL DEFAULT FALSE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts (created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_alerts_read       ON alerts (read)`,
  `CREATE INDEX IF NOT EXISTS idx_alerts_type       ON alerts (type)`,
  `CREATE INDEX IF NOT EXISTS idx_alerts_user_id    ON alerts (user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_alerts_signal_id  ON alerts (signal_id)`,

  // ── Migration 010: Alert System Refinement ────────────────────────────
  `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_type_check`,
  `ALTER TABLE alerts ADD CONSTRAINT alerts_type_check CHECK (type IN (
    'signal_high_impact',
    'signal_rising_momentum',
    'trend_detected',
    'trend_rising',
    'entity_watch',
    'trend_watch',
    'category_watch',
    'watched_entity_high_impact',
    'watched_entity_rising',
    'watched_entity_trend'
  ))`,
  `CREATE INDEX IF NOT EXISTS idx_alerts_priority ON alerts (priority DESC, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_alerts_dedup_signal ON alerts (type, signal_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_alerts_dedup_trend  ON alerts (type, trend_id, created_at DESC)`,
  `UPDATE alerts SET type = 'signal_rising_momentum' WHERE type = 'signal_momentum'`,

  // ── Migration 011: Server-side persistent watchlists ────────────────────
  `CREATE TABLE IF NOT EXISTS user_watchlists (
    id           SERIAL       PRIMARY KEY,
    user_id      TEXT         NOT NULL,
    entity_slug  TEXT         NOT NULL,
    entity_name  TEXT         NOT NULL,
    sector       TEXT,
    country      TEXT,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_user_watchlists_user_entity
     ON user_watchlists (user_id, entity_slug)`,
  `CREATE INDEX IF NOT EXISTS idx_user_watchlists_user_id
     ON user_watchlists (user_id, created_at DESC)`,

  // ── Migration 012: Email Digest Subscriptions ──────────────────────────
  `CREATE TABLE IF NOT EXISTS user_email_subscriptions (
    id         SERIAL       PRIMARY KEY,
    user_id    TEXT         NOT NULL UNIQUE,
    email      TEXT         NOT NULL,
    is_enabled BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_email_subs_user_id
     ON user_email_subscriptions (user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_email_subs_enabled
     ON user_email_subscriptions (is_enabled) WHERE is_enabled = TRUE`,

  // ── Migration 013: Digest Send Tracking ────────────────────────────────
  `CREATE TABLE IF NOT EXISTS digest_sends (
    id            SERIAL       PRIMARY KEY,
    user_id       TEXT         NOT NULL,
    sent_for_date DATE         NOT NULL,
    sent_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_digest_sends_user_date
     ON digest_sends (user_id, sent_for_date)`,
];

/**
 * Table names that are created (or verified) by this migration.
 *
 * ── Operator runbook ──────────────────────────────────────────────────────────
 *
 *  Step 1 — Apply schema (idempotent, safe to re-run):
 *    POST /api/migrate?key=<ADMIN_SECRET>
 *
 *  Step 2 — Seed static data into regulations / ai_models / funding_rounds:
 *    POST /api/seed?key=<ADMIN_SECRET>
 *    (uses ON CONFLICT DO NOTHING — safe to re-run; only inserts missing rows)
 *
 *  Step 3 — Verify:
 *    GET /api/health/db
 *
 *  Notes:
 *  - Migration 004 adds the amount_usd_m column; the seed route populates it.
 *  - Re-running /api/seed after new static data is added will insert new rows
 *    but will NOT overwrite existing ones.  To force an update, delete the
 *    target rows first and then re-seed.
 *  - The ADMIN_SECRET query param must match process.env.ADMIN_SECRET.
 * ──────────────────────────────────────────────────────────────────────────────
 */
const TABLES_CREATED = [
  'articles',
  'intelligence_events',
  'snapshots',
  'signals',
  'events',
  'entities',
  'signal_entities',
  'access_requests',
  'trend_timeseries',
  'trends',
  'insights',
  'pipeline_runs',
  // migration 003
  'regulations',
  'ai_models',
  'funding_rounds',
  // migration 004 column additions
  'funding_rounds.amount_usd_m (column)',
  // migration 005
  'pipeline_locks',
  'page_snapshots',
  'pipeline_runs (extended: trigger_type, articles_*, errors_count, correlation_id, ...)',
  // migration 006
  'signal_contexts',
  // migration 007
  'signal_contexts — composite indexes (status+created_at, signal_id+status)',
  // migration 008
  'signals.significance_score (column)',
  'signals.source_support_count (column)',
  'signals — significance indexes (significance_score, significance_score+created_at)',
  // migration 009
  'alerts',
  // migration 011
  'user_watchlists',
  // migration 012
  'user_email_subscriptions',
  'digest_sends',
];

export async function POST(req: NextRequest) {
  validateEnvironment(['DATABASE_URL', 'ADMIN_SECRET', 'CRON_SECRET']);

  const url = new URL(req.url);

  // ADMIN_SECRET is required — accept it via ?key= query param only.
  const keyParam    = url.searchParams.get('key') || '';
  const adminSecret = process.env.ADMIN_SECRET    || '';

  if (!adminSecret || keyParam !== adminSecret) {
    return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 });
  }

  try {
    for (const stmt of STATEMENTS) {
      await dbExec(stmt);
    }

    console.log('[migration] database schema verified');

    return NextResponse.json({
      status:       'success',
      tablesCreated: TABLES_CREATED,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[migrate] error:', message);
    return NextResponse.json({ status: 'error', message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
