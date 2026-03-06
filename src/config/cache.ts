/**
 * Caching strategy configuration for scale.
 *
 * Goal: minimize server compute and database calls.
 * At 1M+ weekly users, most requests must be served from edge cache.
 *
 * Strategy:
 * 1. Static pages (home, about) — ISR with long revalidation
 * 2. Intelligence pages — ISR with short revalidation (5 min)
 * 3. API routes — CDN cached with s-maxage + stale-while-revalidate
 * 4. Real-time data — edge-cached with 30s TTL
 */

export const cacheConfig = {
  /** Static pages: revalidate every hour */
  staticPage: {
    revalidate: 3600,
  },

  /** Intelligence feed: revalidate every 5 minutes */
  intelligenceFeed: {
    revalidate: 300,
  },

  /** API responses: edge cache 30 min, serve stale for 1 hour */
  apiResponse: {
    ttl: 60 * 30,
    staleWhileRevalidate: 60 * 60,
    headers: (ttl?: number) => ({
      'Cache-Control': `public, s-maxage=${ttl ?? 1800}, stale-while-revalidate=${(ttl ?? 1800) * 2}`,
    }),
  },

  /** Real-time ticker: cache 30 seconds */
  realtime: {
    revalidate: 30,
  },

  /** Static assets: immutable cache */
  staticAssets: {
    maxAge: 31536000,
    immutable: true,
  },
} as const;
