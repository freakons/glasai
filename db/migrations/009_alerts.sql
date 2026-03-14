-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 009 — Personal Intelligence Alerts
--
-- Stores alerts generated when meaningful intelligence signals are detected.
-- Alert types: signal_high_impact, signal_momentum, entity_watch, trend_detected
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS alerts (
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
);

CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_read       ON alerts (read);
CREATE INDEX IF NOT EXISTS idx_alerts_type       ON alerts (type);
CREATE INDEX IF NOT EXISTS idx_alerts_user_id    ON alerts (user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_signal_id  ON alerts (signal_id);
