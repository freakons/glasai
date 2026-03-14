-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 010 — Alert System Refinement
--
-- 1. Add priority column (0=low, 1=medium, 2=high)
-- 2. Expand type constraint for new platform + personal alert types
-- 3. Add composite indexes for deduplication queries
-- ─────────────────────────────────────────────────────────────────────────────

-- Add priority column
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 1;

-- Drop old type constraint and add expanded one
ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_type_check;
ALTER TABLE alerts ADD CONSTRAINT alerts_type_check CHECK (type IN (
  'signal_high_impact',
  'signal_rising_momentum',
  'trend_detected',
  'trend_rising',
  'entity_watch',
  'trend_watch',
  'category_watch'
));

-- Index for priority-based ordering
CREATE INDEX IF NOT EXISTS idx_alerts_priority ON alerts (priority DESC, created_at DESC);

-- Composite indexes for deduplication lookups
CREATE INDEX IF NOT EXISTS idx_alerts_dedup_signal ON alerts (type, signal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_dedup_trend  ON alerts (type, trend_id, created_at DESC);

-- Migrate existing signal_momentum → signal_rising_momentum
UPDATE alerts SET type = 'signal_rising_momentum' WHERE type = 'signal_momentum';
