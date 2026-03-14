-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 013 — Email Digest Subscriptions & Send Tracking
--
-- Creates tables for:
--   1. user_email_subscriptions — per-user email + enabled flag for digest opt-in
--   2. digest_sends — records each sent digest to prevent duplicate sends per day
--
-- Both tables use ON CONFLICT-safe unique constraints to guarantee idempotency.
-- ─────────────────────────────────────────────────────────────────────────────

-- Email digest subscriptions (one per user)
CREATE TABLE IF NOT EXISTS user_email_subscriptions (
  id         SERIAL       PRIMARY KEY,
  user_id    TEXT         NOT NULL UNIQUE,
  email      TEXT         NOT NULL,
  is_enabled BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_subs_user_id
  ON user_email_subscriptions (user_id);

CREATE INDEX IF NOT EXISTS idx_email_subs_enabled
  ON user_email_subscriptions (is_enabled) WHERE is_enabled = TRUE;

-- Digest send tracking (prevents duplicate sends per user per day)
CREATE TABLE IF NOT EXISTS digest_sends (
  id            SERIAL       PRIMARY KEY,
  user_id       TEXT         NOT NULL,
  sent_for_date DATE         NOT NULL,
  sent_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_digest_sends_user_date
  ON digest_sends (user_id, sent_for_date);
