/**
 * Omterminal — Upstash Redis Cache Layer
 *
 * Provides a singleton Redis client and helper functions for caching.
 * All operations are wrapped with try/catch so Redis failures never
 * break API routes — they silently fall back to the DB path.
 *
 * Environment variables:
 *   UPSTASH_REDIS_REST_URL   — Upstash REST endpoint
 *   UPSTASH_REDIS_REST_TOKEN — Upstash REST token
 *
 * Default TTLs:
 *   signals    → 10 seconds
 *   snapshots  → 30 seconds
 *   LLM results → 300 seconds
 */

import { Redis } from '@upstash/redis';

// ─────────────────────────────────────────────────────────────────────────────
// Default TTLs (seconds)
// ─────────────────────────────────────────────────────────────────────────────

export const TTL = {
  SIGNALS:   10,
  SNAPSHOTS: 30,
  LLM:       300,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Singleton client
// ─────────────────────────────────────────────────────────────────────────────

let _redis: Redis | null = null;

function getClient(): Redis | null {
  if (_redis) return _redis;

  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  _redis = new Redis({ url, token });
  return _redis;
}

/**
 * Returns true when Upstash credentials are configured and the client
 * can be instantiated. Does NOT perform a network call.
 */
export function isRedisConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache helpers (all safe — never throw)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retrieve a cached value by key.
 * Returns `null` on miss or if Redis is unavailable.
 */
export async function getCache<T = unknown>(key: string): Promise<T | null> {
  try {
    const client = getClient();
    if (!client) return null;
    const value = await client.get<T>(key);
    return value ?? null;
  } catch (err) {
    console.warn('[redis] getCache error:', err);
    return null;
  }
}

/**
 * Store a value in Redis with an optional TTL (in seconds).
 * Defaults to 30 s when no TTL is provided.
 */
export async function setCache(key: string, value: unknown, ttl: number = TTL.SNAPSHOTS): Promise<void> {
  try {
    const client = getClient();
    if (!client) return;
    await client.set(key, value, { ex: ttl });
  } catch (err) {
    console.warn('[redis] setCache error:', err);
  }
}

/**
 * Delete a cached key.
 */
export async function deleteCache(key: string): Promise<void> {
  try {
    const client = getClient();
    if (!client) return;
    await client.del(key);
  } catch (err) {
    console.warn('[redis] deleteCache error:', err);
  }
}

/**
 * Ping Redis to verify connectivity.
 * Returns 'connected' or 'disconnected'.
 */
export async function pingRedis(): Promise<'connected' | 'disconnected' | 'not_configured'> {
  try {
    const client = getClient();
    if (!client) return 'not_configured';
    const result = await client.ping();
    return result === 'PONG' ? 'connected' : 'disconnected';
  } catch {
    return 'disconnected';
  }
}
