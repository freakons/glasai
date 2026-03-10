/**
 * Omterminal — Cache Refresh / Invalidation
 *
 * After a successful pipeline run, invalidates stale cache entries and
 * revalidates public Next.js routes so the next request gets fresh data.
 *
 * Strategy:
 *   1. Delete Redis hot-feed keys (if Redis is configured)
 *   2. Call revalidatePath() for key public routes (Next.js ISR/revalidation)
 *
 * This is intentionally lightweight — the heavy work happens in snapshot.ts.
 * Cache refresh failures are non-fatal; stale caches expire on their own TTL.
 */

import { deleteCache, isRedisConfigured } from '@/lib/cache/redis';
import { revalidatePath } from 'next/cache';

// Redis keys that should be invalidated after a pipeline run.
// These are hot-feed keys that hold live query results.
const REDIS_KEYS_TO_INVALIDATE = [
  'signals:feed',
  'signals:top',
  'events:recent',
  'opportunities:feed',
  'radar:feed',
  // Snapshot keys — also cleared so next read pulls fresh snapshot from DB
  'snapshot:homepage:stats',
  'snapshot:signals:top',
  'snapshot:funding:aggregates',
  'snapshot:models:overview',
  'snapshot:regulation:overview',
  'snapshot:entities:overview',
] as const;

// Public routes to revalidate via Next.js cache.
// Ensures server-rendered pages pick up new data on their next request.
const PUBLIC_ROUTES_TO_REVALIDATE = [
  '/',
  '/intelligence',
  '/signals',
  '/funding',
  '/models',
  '/regulation',
] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CacheRefreshResult {
  redisKeysInvalidated: number;
  routesRevalidated: string[];
  errors: string[];
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Invalidate stale caches and revalidate public routes.
 * Non-fatal — all errors are collected and returned rather than thrown.
 */
export async function refreshCaches(): Promise<CacheRefreshResult> {
  const errors: string[] = [];
  let redisKeysInvalidated = 0;
  const routesRevalidated: string[] = [];

  // ── 1. Redis key invalidation ─────────────────────────────────────────────
  if (isRedisConfigured()) {
    for (const key of REDIS_KEYS_TO_INVALIDATE) {
      try {
        await deleteCache(key);
        redisKeysInvalidated++;
      } catch (err) {
        errors.push(`redis:${key}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // ── 2. Next.js route revalidation ─────────────────────────────────────────
  for (const route of PUBLIC_ROUTES_TO_REVALIDATE) {
    try {
      revalidatePath(route);
      routesRevalidated.push(route);
    } catch (err) {
      // revalidatePath throws when called from non-page contexts in some
      // Next.js versions. Non-critical — TTL-based expiry handles it.
      errors.push(`revalidate:${route}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { redisKeysInvalidated, routesRevalidated, errors };
}
