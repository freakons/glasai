-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 015 — Signal Intelligence Hardening
--
-- Adds operational tracking fields for the intelligence generation layer:
--   insight_generated       — whether intelligence was successfully generated
--   insight_generated_at    — when generation last succeeded
--   insight_generation_error — short sanitized error from last failure
--
-- All fields are nullable with safe defaults for backward compatibility.
-- Zero-downtime safe: no locks, no NOT NULL constraints on existing data.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE signals ADD COLUMN IF NOT EXISTS insight_generated BOOLEAN DEFAULT FALSE;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS insight_generated_at TIMESTAMPTZ;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS insight_generation_error TEXT;

-- Backfill: mark existing signals that already have intelligence as generated.
UPDATE signals
SET insight_generated = TRUE,
    insight_generated_at = updated_at
WHERE why_this_matters IS NOT NULL
  AND insight_generated IS NOT TRUE;
