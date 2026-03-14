# Omterminal — Environment Variable Reference

> Source of truth for all environment variables used in production.
> Last updated: 2026-03-14 — launch readiness pass.

---

## Critical (Required in Production)

Build will fail if any of these are missing (`scripts/deployment-check.js`).

| Variable | Powers | Breaks If Missing | Safe Default |
|---|---|---|---|
| `DATABASE_URL` | All database access (Neon PostgreSQL) | App cannot read/write any data | None — must be set |
| `CRON_SECRET` | Auth for all cron endpoints (`/api/pipeline/run`, `/api/intelligence/run`, `/api/alerts/send-digest`) | Pipeline, intelligence, and digest cron jobs reject all requests (401) | None — must be set |
| `ADMIN_SECRET` | Auth for admin endpoints (`/api/migrate`, `/api/health` full diagnostics, `/api/admin/*`, `/api/seed`) | Cannot run migrations, no admin health checks | None — must be set |
| `GNEWS_API_KEY` | News ingestion via GNews API | Pipeline cannot fetch news articles; signals go stale | None — must be set |

## Important (Required for Key Features)

Not checked at build time, but features degrade or break without them.

| Variable | Powers | Breaks If Missing | Safe Default |
|---|---|---|---|
| `RESEND_KEY` | Daily digest email delivery, waitlist subscription | Digest emails silently skip; subscribe endpoint returns 200 but does nothing | Digest gracefully skips; subscribe silently no-ops |
| `RESEND_AUDIENCE` | Waitlist audience contact list | Subscribe endpoint returns 200 but does nothing | Silent no-op |
| `DIGEST_FROM` | Sender address on digest emails | Falls back to default | `OM Terminal <digest@omterminal.com>` |
| `GROQ_API_KEY` | Primary LLM provider (Groq) for signal/trend analysis | Falls back to Grok → OpenAI → Ollama; pipeline intelligence features degrade | Auto-detect next provider |

## Optional (Enhance Performance / Features)

| Variable | Powers | Breaks If Missing | Safe Default |
|---|---|---|---|
| `UPSTASH_REDIS_REST_URL` | Edge-compatible Redis caching, pipeline distributed locks | Falls back to in-memory + CDN caching; pipeline uses DB-based locks | In-memory cache |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis auth (pair with URL above) | Same as above | In-memory cache |
| `GROK_API_KEY` | xAI Grok LLM provider (secondary) | Auto-detect skips Grok | None |
| `OPENAI_API_KEY` | OpenAI LLM provider (tertiary fallback) | Auto-detect skips OpenAI | None |
| `AI_PROVIDER` | Force a specific LLM provider (`groq` / `grok` / `openai` / `ollama`) | Auto-detect priority: Ollama → Groq → Grok → OpenAI | `auto` |
| `NEXT_PUBLIC_APP_URL` | Canonical public URL for production | Internal fetch calls and digest email links may use Vercel preview URL | Uses `x-forwarded-host` or `https://omterminal.com` |
| `NEXT_PUBLIC_BASE_URL` | Client-side API base URL (dashboard pages) | Falls back to localhost:3000 | `http://localhost:3000` |
| `GITHUB_TOKEN` | GitHub source harvesting | GitHub source returns no data | None |
| `DB_PROVIDER` | Database backend selector (`neon` / `supabase` / `mock`) | Falls back to mock data | `mock` |

## Timeout Configuration (All Optional)

All values in milliseconds. Defaults are conservative and production-safe.

| Variable | Default | Purpose |
|---|---|---|
| `RSS_FEED_TIMEOUT_MS` | 10000 | Per-feed RSS fetch timeout |
| `GNEWS_FETCH_TIMEOUT_MS` | 15000 | Per-query GNews API timeout |
| `GNEWS_MAX_QUERIES` | 3 | Max GNews queries per pipeline run |
| `INGEST_ROUTE_TIMEOUT_MS` | 8000 | Full `/api/ingest` route timeout |
| `PIPELINE_INGEST_TIMEOUT_MS` | 30000 | Pipeline stage 1 (RSS + GNews) |
| `PIPELINE_SIGNALS_TIMEOUT_MS` | 10000 | Pipeline stage 2 (signal generation) |
| `PIPELINE_SNAPSHOT_TIMEOUT_MS` | 15000 | Pipeline stage 3 (snapshot generation) |
| `PIPELINE_CACHE_TIMEOUT_MS` | 5000 | Pipeline stage 4 (cache invalidation) |
| `PIPELINE_TIMEOUT_MS` | 55000 | Overall pipeline hard limit |
| `PIPELINE_LOCK_TTL_SECONDS` | 300 | Distributed lock expiry (seconds) |
| `SNAPSHOT_TTL_SECONDS` | 300 | Snapshot cache TTL (seconds) |
| `PIPELINE_STALE_HOURS` | 24 | Hours before data is flagged stale in health checks |
| `DB_QUERY_TIMEOUT_MS` | 5000 | Database query timeout |

---

## Where to Set Them

| Environment | Where | Notes |
|---|---|---|
| Production | Vercel → Settings → Environment Variables (Production scope) | All critical + important vars |
| Preview | Vercel → Settings → Environment Variables (Preview scope) | At minimum: `DATABASE_URL` (pointing to `vercel-dev` Neon branch) |
| Development | Vercel → Settings → Environment Variables (Development scope) or local `.env.local` | Same as Preview |

## Quick Validation

- **Build time:** `scripts/deployment-check.js` checks `DATABASE_URL`, `CRON_SECRET`, `ADMIN_SECRET`, `GNEWS_API_KEY`
- **Runtime:** `src/lib/env.ts` → `validateEnvironment()` throws in production if critical vars missing
- **Health check:** `GET /api/health` (with `x-admin-secret` header) shows full env status including missing optional vars
