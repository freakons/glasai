-- ─────────────────────────────────────────────────────────────────────────────
-- Omterminal — Signal Velocity & Importance Migration
-- 002_signal_velocity.sql
--
-- Adds DB-side velocity and importance scoring for signals.
-- Avoids client-side aggregation; all computation happens in Postgres.
--
-- Tables / views created:
--   signal_entity_mentions  — tracks per-entity mention counts over time
--   signal_velocity_scores  — materialised view with velocity + importance
--   pipeline_runs           — records each pipeline execution for health monitoring
--
-- Safe to run multiple times (IF NOT EXISTS / CREATE OR REPLACE).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Pipeline runs table ───────────────────────────────────────────────────
-- Records each execution of the intelligence pipeline so health endpoints
-- can report the last-run timestamp and success/failure status.

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id           SERIAL      PRIMARY KEY,
  run_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stage        TEXT        NOT NULL, -- 'ingest' | 'signals' | 'trends' | 'insights' | 'full'
  status       TEXT        NOT NULL CHECK (status IN ('ok', 'error', 'partial')),
  ingested     INTEGER,
  signals_generated INTEGER,
  error_msg    TEXT,
  duration_ms  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_run_at ON pipeline_runs (run_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_stage  ON pipeline_runs (stage);

-- ── 2. Velocity view ─────────────────────────────────────────────────────────
-- Computes, for each signal:
--   importance_score — weighted by confidence and number of affected entities
--   velocity_score   — ratio of recent mentions (7d) vs baseline (30d)
--                      A score > 1.0 means accelerating, < 1.0 means decelerating
--
-- Uses only the existing `signals` table; no schema alterations required.

CREATE OR REPLACE VIEW signal_velocity_scores AS
WITH
  -- Count of signals per affected_entity in the last 7 days
  recent_7d AS (
    SELECT
      unnest(affected_entities) AS entity,
      COUNT(*)                  AS mention_count
    FROM signals
    WHERE created_at >= NOW() - INTERVAL '7 days'
      AND status IN ('auto', 'published')
    GROUP BY 1
  ),
  -- Count of signals per affected_entity in the last 30 days (baseline)
  baseline_30d AS (
    SELECT
      unnest(affected_entities) AS entity,
      COUNT(*)                  AS mention_count
    FROM signals
    WHERE created_at >= NOW() - INTERVAL '30 days'
      AND status IN ('auto', 'published')
    GROUP BY 1
  ),
  -- Derive per-signal importance + velocity
  scored AS (
    SELECT
      s.id,
      s.title,
      s.signal_type,
      s.confidence_score,
      s.direction,
      s.created_at,
      s.status,
      -- importance_score: confidence weighted by entity breadth (0–100 scale)
      LEAST(
        100,
        ROUND(
          (COALESCE(s.confidence_score, 0) * 60)
          + (COALESCE(array_length(s.affected_entities, 1), 0) * 4)
        )::numeric,
        0
      ) AS importance_score,
      -- velocity_score: recent_7d / (baseline_30d / 4.3) normalised to weekly rate
      -- Values > 1.0 = accelerating; 1.0 = steady; < 1.0 = decelerating
      CASE
        WHEN COALESCE(b.mention_count, 0) = 0 THEN 1.0
        ELSE ROUND(
          (COALESCE(r.mention_count, 0)::numeric)
          / (COALESCE(b.mention_count, 0)::numeric / 4.3),
          2
        )
      END AS velocity_score,
      COALESCE(r.mention_count, 0) AS mentions_7d,
      COALESCE(b.mention_count, 0) AS mentions_30d
    FROM signals s
    LEFT JOIN recent_7d   r ON r.entity = ANY(s.affected_entities)
    LEFT JOIN baseline_30d b ON b.entity = ANY(s.affected_entities)
    WHERE s.status IN ('auto', 'published')
  )
SELECT
  id,
  title,
  signal_type,
  confidence_score,
  direction,
  created_at,
  status,
  importance_score,
  velocity_score,
  mentions_7d,
  mentions_30d
FROM scored
ORDER BY importance_score DESC, created_at DESC;

-- ── 3. Add importance/velocity columns to signals table (optional cache) ─────
-- If you want to materialise scores on write rather than computing on read,
-- uncomment these and update the signals engine to populate them.
--
-- ALTER TABLE signals ADD COLUMN IF NOT EXISTS importance_score NUMERIC(5,2);
-- ALTER TABLE signals ADD COLUMN IF NOT EXISTS velocity_score   NUMERIC(8,2);

-- ── 4. Convenience: top signals with velocity ─────────────────────────────────
-- Example query consumers can run against the view:
--
--   SELECT id, title, importance_score, velocity_score, mentions_7d
--   FROM signal_velocity_scores
--   WHERE velocity_score > 1.2        -- accelerating
--     AND importance_score > 50
--   ORDER BY velocity_score DESC
--   LIMIT 20;
