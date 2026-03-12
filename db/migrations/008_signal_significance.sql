-- ─────────────────────────────────────────────────────────────────────────────
-- Omterminal — Migration 008: Signal Significance Foundation
-- 008_signal_significance.sql
--
-- Design goals:
--   • Add significance_score (0–100) to signals for ranking beyond raw
--     confidence — incorporates source diversity, velocity, signal type
--     weight, and entity spread.
--   • Add source_support_count to track how many distinct sources
--     corroborate this signal (feeds source-diversity scoring).
--   • Create indexes that support significance-ordered reads without
--     touching existing confidence-ordered query paths.
--
-- Backward compatibility:
--   • Both columns are nullable — pre-existing rows carry NULL without
--     violating constraints; they are populated at next write time.
--   • NULL LAST ordering on the significance index keeps scored rows
--     surfaced first while legacy nulls sort to the bottom.
--
-- Safe to re-run: all statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

-- Significance score: composite 0–100 integer computed at write time.
-- NULL for rows created before this migration; populated on next engine run.
ALTER TABLE signals
  ADD COLUMN IF NOT EXISTS significance_score INTEGER
    CHECK (significance_score >= 0 AND significance_score <= 100);

-- Source support count: number of distinct sources corroborating this signal.
-- NULL for legacy rows; populated alongside significance_score at write time.
ALTER TABLE signals
  ADD COLUMN IF NOT EXISTS source_support_count INTEGER;

-- Index for significance-ordered reads (premium / ranked surfaces).
-- NULLS LAST ensures unscored legacy rows do not crowd out scored signals.
CREATE INDEX IF NOT EXISTS idx_signals_significance
  ON signals (significance_score DESC NULLS LAST);

-- Composite index for the anticipated premium-mode query pattern:
--   ORDER BY significance_score DESC, created_at DESC
-- Covers both the significance filter and recency tie-breaking in one pass.
CREATE INDEX IF NOT EXISTS idx_signals_significance_created_at
  ON signals (significance_score DESC NULLS LAST, created_at DESC);
