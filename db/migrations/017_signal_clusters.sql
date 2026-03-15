-- Migration 017: Signal Clusters
-- Stores corroborated signal clusters detected by the clustering engine.
-- Idempotent: uses IF NOT EXISTS for both table and index.

CREATE TABLE IF NOT EXISTS signal_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity TEXT,
  topic TEXT,
  confidence_score INTEGER,
  signal_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signal_clusters_entity
ON signal_clusters(entity);
