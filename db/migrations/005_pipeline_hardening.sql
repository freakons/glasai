-- ─────────────────────────────────────────────────────────────────────────────
-- Omterminal — Pipeline Hardening Migration
-- 005_pipeline_hardening.sql
--
-- Extends pipeline_runs into a true operational ledger.
-- Adds pipeline_locks for distributed concurrency control.
-- Adds page_snapshots for cache-first read models.
--
-- Safe to run multiple times (IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Extend pipeline_runs into an operational ledger ───────────────────────
-- Add new columns with safe defaults so existing rows remain valid.

ALTER TABLE pipeline_runs
  ADD COLUMN IF NOT EXISTS trigger_type      TEXT    DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS started_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS articles_fetched  INTEGER,
  ADD COLUMN IF NOT EXISTS articles_inserted INTEGER,
  ADD COLUMN IF NOT EXISTS articles_deduped  INTEGER,
  ADD COLUMN IF NOT EXISTS events_created    INTEGER,
  ADD COLUMN IF NOT EXISTS warnings_count    INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS errors_count      INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_summary     TEXT,
  ADD COLUMN IF NOT EXISTS correlation_id    TEXT;

-- Expand the status CHECK constraint to include 'skipped' and 'started'.
-- Postgres stores the constraint name as <table>_<column>_check when inline.
ALTER TABLE pipeline_runs DROP CONSTRAINT IF EXISTS pipeline_runs_status_check;
ALTER TABLE pipeline_runs
  ADD CONSTRAINT pipeline_runs_status_check
  CHECK (status IN ('ok', 'error', 'partial', 'skipped', 'started'));

-- Additional indexes for operational queries
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status      ON pipeline_runs (status);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_trigger     ON pipeline_runs (trigger_type);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_correlation ON pipeline_runs (correlation_id);

-- ── 2. Pipeline lock table ────────────────────────────────────────────────────
-- Used as DB-backed distributed lock when Redis is not configured.
-- One row per active lock. Expires_at enforces TTL so dead-locked runs
-- do not block indefinitely.

CREATE TABLE IF NOT EXISTS pipeline_locks (
  lock_key   TEXT        PRIMARY KEY,
  locked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  run_id     TEXT,
  locked_by  TEXT
);

CREATE INDEX IF NOT EXISTS idx_pipeline_locks_expires ON pipeline_locks (expires_at);

-- ── 3. Page snapshots (precomputed read models) ───────────────────────────────
-- Stores precomputed JSON snapshots for public-facing pages.
-- Public routes read from here instead of computing data on each request.
-- After each pipeline run, snapshot generation writes fresh rows here.

CREATE TABLE IF NOT EXISTS page_snapshots (
  key          TEXT        PRIMARY KEY,
  payload      JSONB       NOT NULL DEFAULT '{}',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ttl_seconds  INTEGER     NOT NULL DEFAULT 300
);

CREATE INDEX IF NOT EXISTS idx_page_snapshots_generated_at ON page_snapshots (generated_at DESC);
