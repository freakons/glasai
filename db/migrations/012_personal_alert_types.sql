-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 012 — Personal Alert Types for Watched Entities
--
-- Expands the alerts type constraint to include watched-entity alert types.
-- Adds index for efficient user-scoped alert queries.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop old type constraint and add expanded one
ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_type_check;
ALTER TABLE alerts ADD CONSTRAINT alerts_type_check CHECK (type IN (
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
));

-- Index for fetching user-scoped alerts efficiently
CREATE INDEX IF NOT EXISTS idx_alerts_user_id ON alerts (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- Composite index for personal alert deduplication
CREATE INDEX IF NOT EXISTS idx_alerts_dedup_personal
  ON alerts (type, user_id, signal_id, created_at DESC)
  WHERE user_id IS NOT NULL;
