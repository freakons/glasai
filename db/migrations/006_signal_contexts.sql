-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 006: Signal Intelligence Context Layer
--
-- Creates the signal_contexts table to store structured AI-generated context
-- that explains each signal.  Context is generated in the write-side pipeline
-- only; public pages read precomputed rows.
--
-- Design goals:
--   • Clean one-to-one relationship with signals (UNIQUE FK on signal_id)
--   • Structured fields — not a single blob — enabling per-field UI rendering
--   • Operational states for pipeline management and regeneration workflows
--   • Model + prompt metadata for auditability and version tracking
--   • Schema-stable for future tiers, personalisation, and API exposure
--
-- Safe to re-run: all statements use IF NOT EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── signal_contexts (one-to-one with signals) ─────────────────────────────
CREATE TABLE IF NOT EXISTS signal_contexts (
  -- ── Primary ────────────────────────────────────────────────────────────
  id                     TEXT        PRIMARY KEY,

  -- ── Relationship ───────────────────────────────────────────────────────
  -- UNIQUE enforces one-to-one; CASCADE cleans up orphaned contexts.
  signal_id              TEXT        NOT NULL UNIQUE
                           REFERENCES signals (id) ON DELETE CASCADE,

  -- ── Core context fields (structured for multi-surface rendering) ───────
  -- summary: one-sentence signal headline for cards, digests, alerts
  summary                TEXT,

  -- why_it_matters: editorial significance paragraph for detail views
  why_it_matters         TEXT,

  -- affected_entities: JSONB array of {name, type, role?} objects.
  -- JSONB chosen over TEXT[] so structured per-entity metadata can be
  -- added later (e.g. entity_id, sector, confidence) without a migration.
  affected_entities      JSONB       NOT NULL DEFAULT '[]',

  -- implications: ordered list of bullet-point strings.
  -- TEXT[] chosen because each implication is a plain text fragment;
  -- individual elements do not require internal structure.
  implications           TEXT[]      NOT NULL DEFAULT '{}',

  -- confidence_explanation: human-readable rationale for the score
  confidence_explanation TEXT,

  -- source_basis: citation of events / articles the context was derived from
  source_basis           TEXT,

  -- ── Model metadata (auditability + future A/B testing) ─────────────────
  model_provider         TEXT        NOT NULL DEFAULT '',
  model_name             TEXT        NOT NULL DEFAULT '',

  -- prompt_version: semver or hash of the prompt template used.
  -- Enables regeneration workflows when prompts are updated.
  prompt_version         TEXT        NOT NULL DEFAULT '',

  -- ── Operational metadata ────────────────────────────────────────────────
  -- status drives pipeline orchestration and UI skeleton states.
  --   pending  — row created, generation not yet attempted
  --   ready    — generation succeeded; context is publishable
  --   failed   — generation attempted but errored; see generation_error
  status                 TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'ready', 'failed')),

  -- generation_error: last error message from the generation step.
  -- NULL unless status = 'failed'.
  generation_error       TEXT,

  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ
);

-- ── Indexes ────────────────────────────────────────────────────────────────
-- signal_id lookup — primary retrieval pattern (by signal FK)
CREATE UNIQUE INDEX IF NOT EXISTS idx_signal_contexts_signal_id
  ON signal_contexts (signal_id);

-- status lookup — pipeline jobs poll for 'pending' rows to process
CREATE INDEX IF NOT EXISTS idx_signal_contexts_status
  ON signal_contexts (status);

-- created_at — chronological listing and cache invalidation
CREATE INDEX IF NOT EXISTS idx_signal_contexts_created_at
  ON signal_contexts (created_at DESC);
