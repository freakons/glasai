/**
 * Omterminal — Lightweight In-Process Memory Cache
 *
 * Instance-local TTL cache backed by a Map. Designed as a minimal drop-in
 * that can later be swapped for Redis/Upstash by replacing this module.
 *
 * ⚠  Serverless limitation: each serverless instance has its own Map.
 * There is no cross-instance cache sharing or invalidation. Use only for
 * read-heavy, safely-stale data where brief cross-instance inconsistency
 * is acceptable.
 *
 * Key naming convention:
 *   <resource>:<qualifier>   e.g. "signals:standard", "opportunities:pulse"
 *
 * Future migration path:
 *   Swap getCache / setCache / deleteCache implementations to call
 *   Upstash/Redis equivalents — route logic using these functions does not
 *   need to change.
 */

// ── TTL presets ───────────────────────────────────────────────────────────────

/** Per-route TTL constants (milliseconds). */
export const MEM_TTL = {
  /** Public health liveness: 5 s — short enough to detect real outages quickly */
  HEALTH_PUBLIC: 5_000,
  /** Signals list: 5 s — matches the Redis TTL; pipeline runs ~hourly */
  SIGNALS: 5_000,
  /** Intelligence signals: 10 s — same data set, slightly less hot endpoint */
  INTELLIGENCE_SIGNALS: 10_000,
  /** Opportunities / market-pulse: 10 s — heavier compute, stable per pipeline cycle */
  OPPORTUNITIES: 10_000,
} as const;

// ── Internal store ────────────────────────────────────────────────────────────

type CacheEntry<T> = {
  value: T;
  /** Unix ms when the entry was written. */
  timestamp: number;
  /** TTL in ms provided at set time (Infinity when not given). */
  ttlMs: number;
};

const store = new Map<string, CacheEntry<unknown>>();

// ── Core API ──────────────────────────────────────────────────────────────────

/**
 * Retrieve a cached value.
 *
 * The TTL is evaluated at read time against `entry.timestamp`.
 * Expired entries are evicted on access (lazy eviction).
 *
 * Backwards-compatible with the original signature:
 *   getCache<T>(key: string, ttlMs: number): T | null
 */
export function getCache<T>(key: string, ttlMs: number): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ttlMs) {
    store.delete(key);
    return null;
  }
  return entry.value as T;
}

/**
 * Store a value in the cache.
 *
 * @param ttlMs  Optional TTL stored alongside the entry.  When provided it is
 *               used by `inspectCache` and `getOrSet` for diagnostics.  If
 *               omitted the entry uses `Infinity` as the stored TTL; the TTL
 *               passed to `getCache` still governs expiry at read time.
 *
 * Backwards-compatible with the original signature:
 *   setCache<T>(key: string, value: T): void
 */
export function setCache<T>(key: string, value: T, ttlMs?: number): void {
  store.set(key, { value, timestamp: Date.now(), ttlMs: ttlMs ?? Infinity });
}

/**
 * Explicitly remove a key from the cache.
 */
export function deleteCache(key: string): void {
  store.delete(key);
}

// ── Convenience helpers ───────────────────────────────────────────────────────

/**
 * Retrieve a cached value, or execute `fetcher`, cache the result, and
 * return it.  The returned object carries a `hit` flag for diagnostics.
 *
 * Usage:
 *   const { value, hit } = await getOrSet('my:key', 10_000, () => db.query(...));
 *   logWithRequestId(reqId, 'scope', `cache_${hit ? 'hit' : 'miss'} source=${hit ? 'memory' : 'db'}`);
 */
export async function getOrSet<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<{ value: T; hit: boolean }> {
  const cached = getCache<T>(key, ttlMs);
  if (cached !== null) return { value: cached, hit: true };
  const value = await fetcher();
  setCache(key, value, ttlMs);
  return { value, hit: false };
}

/**
 * Return diagnostic metadata for a cache key without modifying state.
 * Useful for debug logging or `/api/health` visibility.
 */
export function inspectCache(key: string): {
  exists: boolean;
  ageMs?: number;
  ttlMs?: number;
  expiresInMs?: number;
} {
  const entry = store.get(key);
  if (!entry) return { exists: false };
  const ageMs = Date.now() - entry.timestamp;
  const expiresInMs = entry.ttlMs === Infinity ? Infinity : Math.max(0, entry.ttlMs - ageMs);
  return { exists: true, ageMs, ttlMs: entry.ttlMs, expiresInMs };
}

/**
 * Return the number of entries currently in the store (live + expired-but-
 * not-yet-evicted).  Intended for diagnostics only.
 */
export function cacheSize(): number {
  return store.size;
}
