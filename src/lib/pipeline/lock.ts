/**
 * Omterminal — Pipeline Distributed Lock
 *
 * Prevents overlapping pipeline runs across serverless function instances.
 *
 * Strategy:
 *   1. Upstash Redis SET NX (atomic, preferred) — used when Redis env vars present
 *   2. DB pipeline_locks table (INSERT ON CONFLICT DO NOTHING) — fallback
 *   3. Noop (allow run) — if both fail, never block the pipeline
 *
 * Lock TTL: PIPELINE_LOCK_TTL_SECONDS env (default 300 s / 5 min).
 * Dead locks expire automatically; no manual cleanup needed.
 */

import { isRedisConfigured } from '@/lib/cache/redis';
import { dbQuery } from '@/db/client';

const REDIS_LOCK_KEY = 'pipeline:run:lock';
const LOCK_TTL_SECONDS = parseInt(process.env.PIPELINE_LOCK_TTL_SECONDS ?? '300', 10);

// ── Types ─────────────────────────────────────────────────────────────────────

export type LockAcquireResult =
  | { acquired: true;  lockId: string; strategy: 'redis' | 'db' | 'noop' }
  | { acquired: false; reason: string; lockedBy?: string };

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Try to acquire the pipeline run lock.
 * Returns { acquired: true, lockId } on success.
 * Returns { acquired: false, reason } if another run is active.
 */
export async function acquirePipelineLock(triggeredBy: string): Promise<LockAcquireResult> {
  const lockId = `${triggeredBy}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (isRedisConfigured()) {
    const result = await tryRedisLock(lockId);
    if (result !== null) return result;
    // Redis failed → fall through to DB
  }

  return tryDbLock(lockId, triggeredBy);
}

/**
 * Release the lock. Only releases our own lock (identified by lockId).
 * Safe to call even if lock was never acquired (noop).
 */
export async function releasePipelineLock(lockId: string): Promise<void> {
  if (isRedisConfigured()) {
    const released = await tryReleaseRedisLock(lockId);
    if (released) return;
    // Fall through to DB release
  }

  try {
    await dbQuery`
      DELETE FROM pipeline_locks
      WHERE lock_key = 'pipeline_run' AND run_id = ${lockId}
    `;
  } catch {
    // Best-effort — expired TTL will clean up
  }
}

/**
 * Return the current lock status for health/diagnostic purposes.
 */
export async function getPipelineLockStatus(): Promise<{
  locked: boolean;
  lockedBy?: string;
  lockedAt?: string;
  strategy?: string;
}> {
  if (isRedisConfigured()) {
    try {
      const { Redis } = await import('@upstash/redis');
      const redis = new Redis({
        url:   process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
      });
      const val = await redis.get<string>(REDIS_LOCK_KEY);
      return { locked: val !== null, lockedBy: val ?? undefined, strategy: 'redis' };
    } catch {
      // Fall through to DB
    }
  }

  try {
    // Clean expired locks before checking
    await dbQuery`DELETE FROM pipeline_locks WHERE expires_at < NOW()`;
    const rows = await dbQuery<{ locked_by: string; locked_at: string }>`
      SELECT locked_by, locked_at
      FROM pipeline_locks
      WHERE lock_key = 'pipeline_run'
    `;
    if (rows.length > 0) {
      return {
        locked:   true,
        lockedBy: rows[0].locked_by,
        lockedAt: rows[0].locked_at,
        strategy: 'db',
      };
    }
  } catch {
    // pipeline_locks may not exist yet — not locked
  }

  return { locked: false };
}

// ── Redis lock ────────────────────────────────────────────────────────────────

async function tryRedisLock(lockId: string): Promise<LockAcquireResult | null> {
  try {
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({
      url:   process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

    // Atomic SET NX EX — only sets if key does not exist
    const result = await redis.set(REDIS_LOCK_KEY, lockId, {
      nx: true,
      ex: LOCK_TTL_SECONDS,
    });

    if (result === 'OK') {
      return { acquired: true, lockId, strategy: 'redis' };
    }

    const existing = await redis.get<string>(REDIS_LOCK_KEY);
    return {
      acquired: false,
      reason:   'pipeline_locked',
      lockedBy: existing ?? 'unknown',
    };
  } catch (err) {
    console.warn('[pipeline/lock] Redis lock failed, trying DB fallback:', err);
    return null; // Signal to try DB
  }
}

async function tryReleaseRedisLock(lockId: string): Promise<boolean> {
  try {
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({
      url:   process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

    // Lua script: atomic check-and-delete (only delete if we own the lock)
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await redis.eval(script, [REDIS_LOCK_KEY], [lockId]);
    return true;
  } catch {
    return false;
  }
}

// ── DB lock ───────────────────────────────────────────────────────────────────

async function tryDbLock(lockId: string, triggeredBy: string): Promise<LockAcquireResult> {
  try {
    // Remove any expired locks before attempting acquisition
    await dbQuery`DELETE FROM pipeline_locks WHERE expires_at < NOW()`;

    const expiresAt = new Date(Date.now() + LOCK_TTL_SECONDS * 1000).toISOString();

    // INSERT ON CONFLICT DO NOTHING — atomic in Postgres
    const inserted = await dbQuery<{ run_id: string }>`
      INSERT INTO pipeline_locks (lock_key, locked_at, expires_at, run_id, locked_by)
      VALUES ('pipeline_run', NOW(), ${expiresAt}::timestamptz, ${lockId}, ${triggeredBy})
      ON CONFLICT (lock_key) DO NOTHING
      RETURNING run_id
    `;

    if (inserted.length > 0) {
      return { acquired: true, lockId, strategy: 'db' };
    }

    const existing = await dbQuery<{ locked_by: string; locked_at: string }>`
      SELECT locked_by, locked_at
      FROM pipeline_locks
      WHERE lock_key = 'pipeline_run'
    `;
    const e = existing[0];
    return {
      acquired: false,
      reason:   'pipeline_locked',
      lockedBy: e ? `${e.locked_by} (since ${e.locked_at})` : 'unknown',
    };
  } catch (err) {
    // pipeline_locks table may not exist yet (migration 005 pending).
    // Allow the run rather than blocking it permanently.
    console.warn('[pipeline/lock] DB lock failed (migration 005 not applied?):', err);
    return { acquired: true, lockId, strategy: 'noop' };
  }
}
