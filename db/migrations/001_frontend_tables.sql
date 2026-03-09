-- ─────────────────────────────────────────────────────────────────────────────
-- Omterminal — Frontend Tables Migration
-- 001_frontend_tables.sql
--
-- Adds the `entities` table and ensures `signals` and `events` have the
-- columns expected by the frontend query layer (db/queries.ts).
--
-- Safe to run multiple times (all statements use IF NOT EXISTS / DO NOTHING).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Existing signals table (created by migrate route) ─────────────────────
-- id TEXT PRIMARY KEY
-- signal_type TEXT  (engine type: CAPITAL_ACCELERATION etc.)
-- title TEXT NOT NULL
-- description TEXT NOT NULL          ← mapped to `summary` in frontend
-- supporting_events TEXT[]
-- confidence_score NUMERIC(4,3)      ← 0–1; frontend multiplies by 100
-- direction TEXT
-- affected_entities TEXT[]
-- recommendation TEXT
-- human_verified BOOLEAN
-- created_at TIMESTAMPTZ
-- updated_at TIMESTAMPTZ

-- Add a `category` column to signals so frontend values (models, funding, …)
-- can be stored directly when seeded from mock data.
ALTER TABLE signals
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS entity_id TEXT,
  ADD COLUMN IF NOT EXISTS entity_name TEXT,
  ADD COLUMN IF NOT EXISTS summary TEXT,
  ADD COLUMN IF NOT EXISTS confidence INTEGER,
  ADD COLUMN IF NOT EXISTS date TEXT;

-- ── Existing events table (created by migrate route) ──────────────────────
-- id TEXT PRIMARY KEY
-- type TEXT NOT NULL
-- company TEXT NOT NULL              ← used as `source` in frontend
-- related_model TEXT
-- title TEXT NOT NULL
-- description TEXT NOT NULL
-- timestamp TIMESTAMPTZ NOT NULL     ← used as `created_at` in frontend
-- source_article_id TEXT
-- tags TEXT[]
-- region TEXT
-- payload JSONB
-- created_at TIMESTAMPTZ

-- Add columns that make event rows self-contained for the frontend.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS entity_id TEXT,
  ADD COLUMN IF NOT EXISTS entity_name TEXT,
  ADD COLUMN IF NOT EXISTS amount TEXT,
  ADD COLUMN IF NOT EXISTS signal_ids TEXT[];

-- ── New: entities table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS entities (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'company',
  description  TEXT NOT NULL DEFAULT '',
  sector       TEXT,
  country      TEXT,
  founded      INTEGER,
  website      TEXT,
  risk_level   TEXT CHECK (risk_level IN ('low', 'medium', 'high')) DEFAULT 'low',
  tags         TEXT[],
  financial_scale TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entities_type        ON entities (type);
CREATE INDEX IF NOT EXISTS idx_entities_created_at  ON entities (created_at DESC);
