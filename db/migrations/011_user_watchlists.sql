-- Migration 011: Server-side persistent watchlists
--
-- Stores watched entities per user so watchlists survive across devices
-- and can power personalized alerts, email digests, and saved views.
--
-- User identity is a UUID stored in a persistent cookie (omterminal_uid).
-- When a full auth system is added, user_id can be migrated to reference
-- an authenticated user record.

CREATE TABLE IF NOT EXISTS user_watchlists (
  id           SERIAL       PRIMARY KEY,
  user_id      TEXT         NOT NULL,
  entity_slug  TEXT         NOT NULL,
  entity_name  TEXT         NOT NULL,
  sector       TEXT,
  country      TEXT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Each user can watch a given entity only once
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_watchlists_user_entity
  ON user_watchlists (user_id, entity_slug);

-- Fast lookup for a single user's full watchlist
CREATE INDEX IF NOT EXISTS idx_user_watchlists_user_id
  ON user_watchlists (user_id, created_at DESC);
