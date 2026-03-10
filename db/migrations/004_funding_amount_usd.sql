-- ─────────────────────────────────────────────────────────────────────────────
-- Omterminal — Funding Amount Normalisation
-- 004_funding_amount_usd.sql
--
-- Adds a numeric `amount_usd_m` column to funding_rounds so aggregate
-- queries (SUM, AVG, ORDER BY) can operate on a stable numeric value
-- alongside the original human-readable `amount` display text.
--
-- Unit: approximate USD millions (non-USD currencies stored at nominal value).
-- NULL indicates the amount is undisclosed or could not be parsed.
--
-- Safe to run multiple times (ADD COLUMN IF NOT EXISTS).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE funding_rounds
  ADD COLUMN IF NOT EXISTS amount_usd_m NUMERIC(12, 2);

CREATE INDEX IF NOT EXISTS idx_funding_rounds_amount_usd
  ON funding_rounds (amount_usd_m DESC NULLS LAST);
