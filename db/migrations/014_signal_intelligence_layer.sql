-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 014 — Signal Intelligence Layer ("Why This Matters")
--
-- Adds optional intelligence fields to the signals table:
--   why_this_matters   — plain-language explanation of signal significance
--   strategic_impact   — how this signal affects strategy and decision-making
--   who_should_care    — target audience / roles most affected
--   prediction         — optional forward-looking assessment
--
-- All fields are nullable to preserve backward compatibility with existing
-- signals that were created before this migration.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE signals ADD COLUMN IF NOT EXISTS why_this_matters TEXT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS strategic_impact TEXT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS who_should_care TEXT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS prediction TEXT;
