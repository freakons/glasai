type CacheEntry<T> = {
  value: T
  timestamp: number
}

const cache = new Map<string, CacheEntry<any>>()

export function getCache<T>(key: string, ttlMs: number): T | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > ttlMs) {
    cache.delete(key)
    return null
  }
  return entry.value
}

export function setCache<T>(key: string, value: T) {
  cache.set(key, {
    value,
    timestamp: Date.now()
  })
}
