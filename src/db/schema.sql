-- ─────────────────────────────────────────────────────────────────────────────
-- Omterminal — Intelligence Database Schema
-- Compatible with PostgreSQL / Neon serverless
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Articles ──────────────────────────────────────────────────────────────────
-- Stores raw and normalised articles ingested from RSS / news sources.

CREATE TABLE IF NOT EXISTS articles (
  id           TEXT        PRIMARY KEY,
  title        TEXT        NOT NULL,
  source       TEXT        NOT NULL,
  url          TEXT        NOT NULL UNIQUE,
  published_at TIMESTAMPTZ NOT NULL,
  category     TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_category     ON articles (category);
CREATE INDEX IF NOT EXISTS idx_articles_source       ON articles (source);

-- ── Events ────────────────────────────────────────────────────────────────────
-- Structured intelligence events extracted from articles.
-- Each event references the article it was derived from.

CREATE TABLE IF NOT EXISTS events (
  id                TEXT        PRIMARY KEY,
  type              TEXT        NOT NULL,
  company           TEXT        NOT NULL,
  related_model     TEXT,
  title             TEXT        NOT NULL,
  description       TEXT        NOT NULL,
  timestamp         TIMESTAMPTZ NOT NULL,
  source_article_id TEXT        REFERENCES articles (id) ON DELETE SET NULL,
  tags              TEXT[],
  region            TEXT,
  payload           JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_type              ON events (type);
CREATE INDEX IF NOT EXISTS idx_events_company           ON events (company);
CREATE INDEX IF NOT EXISTS idx_events_timestamp         ON events (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_source_article_id ON events (source_article_id);

-- ── Signals ───────────────────────────────────────────────────────────────────
-- Higher-order intelligence signals synthesised from multiple events.
-- Reserved for future use by the signals engine.

CREATE TABLE IF NOT EXISTS signals (
  id                 TEXT          PRIMARY KEY,
  title              TEXT          NOT NULL,
  description        TEXT          NOT NULL,
  supporting_events  TEXT[]        NOT NULL DEFAULT '{}',
  confidence_score   NUMERIC(4,3)  NOT NULL DEFAULT 0.0
                       CHECK (confidence_score BETWEEN 0.0 AND 1.0),
  direction          TEXT          CHECK (direction IN ('bullish','bearish','neutral','uncertain')),
  affected_entities  TEXT[],
  recommendation     TEXT,
  human_verified     BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_signals_direction   ON signals (direction);
CREATE INDEX IF NOT EXISTS idx_signals_created_at  ON signals (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_confidence  ON signals (confidence_score DESC);
