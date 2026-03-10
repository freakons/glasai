# Omterminal — Production End-to-End Verification Report

**Date:** 2026-03-10
**Engineer:** Lead Production Engineer
**Branch:** `claude/fix-api-verification-2r1hH`
**Production URL:** `https://omterminal.com`
**Method:** Deep static analysis of every production route and data path
_(Outbound proxy blocks omterminal.com from CI sandbox — live curl verification must be run from a Vercel CLI session or production shell.)_

---

## STEP 2 — Health Check (`/api/health`)

**Endpoint analysis: `src/app/api/health/route.ts`**

| Field | Verified behaviour |
|---|---|
| `db` | `SELECT NOW()` → `'connected'` or `'disconnected'` |
| `redis` | `pingRedis()` → Upstash Upstash REST ping |
| `llmProvider` | `getActiveProviderName()` after `getProvider()` resolves |
| `llmDiagnostics` | Reports `hasGroqKey`, `hasGrokKey`, `hasOpenAIKey`, `aiProviderEnv` |
| `ok` | `true` only when DB is connected |

The health route correctly returns HTTP 200 when DB is connected and HTTP 503 otherwise. Redis failure is reported but does not flip `ok` to false (Redis is optional). **No mock data paths exist in this route. ✓**

---

## STEP 3 — Signals Table Population (`/api/signals?debug=true`)

**Endpoint analysis: `src/app/api/signals/route.ts`**

**Source indicator logic:**

| Condition | `source` returned |
|---|---|
| `signals` table has rows | `'db'` |
| `signals` table is empty | `'empty'` |
| DB unavailable | `'error'` (HTTP 503) |
| Mock data served | **Never in production** ✓ |

**Debug mode (`?debug=true`):** Runs `SELECT COUNT(*) FROM signals` and `SELECT … FROM signals LIMIT 1` and attaches as `diagnostics.totalRows` / `diagnostics.sampleRow`.

**Cache layer (edge → Redis → memory → DB):** Three-tier cache. All cache layers store the DB-originated payload with `source` field intact so cache hits correctly report `'db'` or `'empty'`.

**Production mock fallback: NONE ✓**

---

## STEP 4 — Opportunities (`/api/opportunities`)

**Endpoint analysis: `src/app/api/opportunities/route.ts`**

| Condition | Behaviour |
|---|---|
| DB has signals | `source: 'db'`, full ranked list |
| DB signals empty | `source: 'db-empty'`, triggers `triggerPipelineOnce()` fire-and-forget |
| DB error | Throws → HTTP 500 |
| Mock served in production | **Never** ✓ |

Response shape: `{ marketBias, signals: [{rank, symbol, score, direction, velocity, volumeSpike}], source, timestamp }`

**Production mock fallback: NONE ✓**

---

## STEP 5 — Trends and Insights

### `/api/intelligence/trends`

**File: `src/app/api/intelligence/trends/route.ts`**

Queries `SELECT … FROM trends ORDER BY confidence DESC LIMIT 20` directly.
Returns `source: 'db'` when rows exist, `source: 'empty'` when none.
**No mock fallback in the route itself. ✓**

### `/api/intelligence/insights`

**File: `src/app/api/intelligence/insights/route.ts`**

Queries `SELECT … FROM insights ORDER BY confidence DESC LIMIT 20` directly.
Returns `source: 'db'` or `source: 'empty'`.
**No mock fallback in the route itself. ✓**

---

## STEP 6 — Production Pipeline Write Path

### Full pipeline: `POST /api/intelligence/run`

Auth: `x-vercel-cron-secret` header or `?secret=<CRON_SECRET>` query param.

```
runHarvester()
  └─ getSources() → RSS/GNews configured sources
  └─ normalizeSignal()
  └─ processSignal() [Groq LLM]
  └─ scoreSignal()
  └─ isDuplicate() check
  └─ sendSignal() → POST /api/intelligence/ingest → INSERT INTO signals

runTrendAnalysis()
  └─ SELECT FROM signals WHERE created_at >= NOW() - INTERVAL '24 hours'
       AND status IN ('auto', 'published')
  └─ aggregateTrends()
  └─ INSERT INTO trends ON CONFLICT (topic) DO UPDATE

runInsightGeneration()
  └─ SELECT FROM trends ORDER BY confidence DESC
  └─ generateInsights() [Groq LLM]
  └─ INSERT INTO insights ON CONFLICT (title) DO UPDATE
```

**This is the correct and complete production write path. ✓**

### CRITICAL TABLE MISMATCH DISCOVERED

The `/api/ingest` cron (runs daily at 06:00 UTC) calls `ingestGNews()` which writes to the **`intelligence_events`** table.

The `/api/pipeline/run` cron (runs every 5 min) calls `getRecentEvents()` which reads from the **`events`** table.

**These are two different tables. GNews articles written by `/api/ingest` are never read by the signals engine in `/api/pipeline/run`.**

```
/api/ingest       → intelligence_events   ← ORPHANED (nothing reads this)
/api/pipeline/run → reads from events     ← EMPTY (nothing writes GNews here)
```

**The correct ingestion path is via `/api/intelligence/run` which uses the harvester → ingest → signals chain. The `/api/ingest` + `/api/pipeline/run` pair is a disconnected legacy path.**

---

## STEP 7 — Mock/Fallback Audit

### API Routes

| Route | Real DB-driven or fallback | Needs fix? |
|---|---|---|
| `GET /api/health` | Real DB check | No |
| `GET /api/signals` | DB (`source: 'db'`) or empty sentinel in production | No |
| `GET /api/signals?debug=true` | DB with diagnostics | No |
| `GET /api/opportunities` | DB or `db-empty` sentinel in production | No |
| `GET /api/intelligence/trends` | DB or empty sentinel | No |
| `GET /api/intelligence/insights` | DB or empty sentinel | No |
| `GET /api/intelligence/signals` | DB only | No |
| `GET /api/entities` | DB or empty sentinel in production | No |
| `GET /api/events` | ~~Always falls back to `MOCK_EVENTS`~~ → **FIXED** | **Fixed in this PR** |
| `GET /api/radar` | DB or empty sentinel | No |
| `GET /api/news` | GNews proxy (live external API) | No |
| `POST /api/intelligence/ingest` | Writes to real DB | No |
| `POST /api/pipeline/run` | DB but reads from wrong table (see §6) | Blocker |
| `POST /api/intelligence/run` | Full real pipeline | No |
| `GET /api/ingest` | Writes to wrong table `intelligence_events` | Blocker |

### Pipeline Runners

| Runner | Real DB-driven or fallback | Needs fix? |
|---|---|---|
| `src/trends/runner.ts` — `loadRecentSignals()` | ~~Falls back to `MOCK_TREND_SIGNALS` when empty~~ → **FIXED** | **Fixed in this PR** |
| `src/insights/runner.ts` — `loadTrends()` | ~~Falls back to `MOCK_TRENDS` when empty~~ → **FIXED** | **Fixed in this PR** |

### Pages (User-Facing)

| Page | Real DB-driven or fallback | Needs fix? |
|---|---|---|
| `/` (homepage) | Stats hardcoded in `siteConfig.stats` (47 signals, etc.) | Yes — wire to DB counts |
| `/intelligence` | `fetchArticles()` → static `NEWS` seed data in `lib/data/news.ts` | Yes — wire to DB |
| `/signals` | Fetches `/api/signals` → real DB or empty state | No |
| `/regulation` | `fetchRegulations()` → static seed data | Yes — wire to DB |
| `/regulation/[slug]` | `REGULATIONS` array directly | Yes — wire to DB |
| `/models` | `fetchModels()` → static seed data | Yes — wire to DB |
| `/models/[slug]` | `MODELS` array directly | Yes — wire to DB |
| `/funding` | `fetchFundingRounds()` → static seed data | Yes — wire to DB |
| `/funding/[slug]` | `FUNDING_ROUNDS` array directly | Yes — wire to DB |
| `/graph` | Graph data from context (check separately) | Investigate |
| `/dashboard/signals` | Fetches `/api/intelligence/signals` → real DB | No |
| `/dashboard/trends` | Fetches `/api/intelligence/trends` → real DB | No |
| `/dashboard/insights` | Fetches `/api/intelligence/insights` → real DB | No |

---

## STEP 8 — Final Report

### Q1: Are production signals truly being written to the real DB?

**Conditional YES** — when `/api/intelligence/run` is triggered (Vercel cron every 2h or manual POST with CRON_SECRET), the harvester fetches from RSS/GNews sources, processes each signal through the Groq LLM, and writes them to the `signals` table via `POST /api/intelligence/ingest`.

The `/api/ingest` daily cron writes to `intelligence_events` (a separate orphaned table) and does **not** contribute to the `signals` table. This path needs to be fixed.

### Q2: Are trends generated from real DB signals or fallback data?

**Previously: Fallback (mock) when signals table is empty or stale.**
**After this PR: Real DB only in production.** If signals table has no qualifying rows (last 24h, status in `auto`/`published`), the trends runner now returns empty instead of using `MOCK_TREND_SIGNALS`. The trends table will only be populated when real signals exist.

### Q3: Are insights generated from real DB trends or fallback data?

**Previously: Fallback (mock) when trends table is empty.**
**After this PR: Real DB only in production.** If trends table is empty, the insights runner now returns empty instead of using `MOCK_TRENDS`.

### Q4: Remaining production blockers

| # | Severity | Blocker | Fix |
|---|---|---|---|
| 1 | **CRITICAL** | Table mismatch: `/api/ingest` writes to `intelligence_events` but `/api/pipeline/run` reads from `events`. GNews ingestion via the daily cron is effectively siloed. | Rewrite `/api/ingest` to write to the `events` table (via `saveEvent()` / `saveEvents()`), or delete the broken `/api/pipeline/run` path and rely on `/api/intelligence/run` exclusively. |
| 2 | **HIGH** | `dataService.ts` serves only static seed files (NEWS, REGULATIONS, MODELS, FUNDING_ROUNDS). All pages consuming it — `/intelligence`, `/regulation`, `/models`, `/funding` — show hardcoded editorial data, not live DB. | Wire each `dataService.ts` function to a real DB query (add tables: `articles`, `regulations`, `models`, `funding_rounds`) or build a CMS integration. |
| 3 | **HIGH** | Homepage stats (`siteConfig.stats`) are hardcoded constants (`signals: 47`, `companies: 18`, etc.). | Replace with SSR counts from `SELECT COUNT(*) FROM signals`, `entities`, `trends`. |
| 4 | **MEDIUM** | `dbQuery()` in `db/client.ts` catches all errors and returns `[]`, masking DB failures. API routes then report `source: 'empty'` instead of `source: 'error'`. | Use `dbQueryStrict()` (which throws on errors) for critical read paths, so routes can return proper HTTP 503s. |
| 5 | **MEDIUM** | Harvester `sender.ts` resolves ingest URL from `VERCEL_URL` env var (which is the preview deployment URL on Vercel). On production custom domains this can mismatch if `NEXT_PUBLIC_APP_URL` is not set. | Ensure `NEXT_PUBLIC_APP_URL=https://omterminal.com` is set in Vercel production env, or hardcode `siteConfig.url` as the canonical fallback. |
| 6 | **LOW** | `/api/events` was serving `MOCK_EVENTS` in production with empty DB. | **Fixed in this PR** — now returns `source: 'empty'` in production. |
| 7 | **LOW** | Trends runner fell back to `MOCK_TREND_SIGNALS` in production. | **Fixed in this PR** — now returns empty in production. |
| 8 | **LOW** | Insights runner fell back to `MOCK_TRENDS` in production. | **Fixed in this PR** — now returns empty in production. |

### Q5: Exact next fix needed to make Omterminal fully live-data driven

**Priority 1 — Fix the ingestion table mismatch** (`/api/ingest` → `events`)

In `src/services/ingestion/gnewsFetcher.ts`, change the INSERT target from `intelligence_events` to `events` (using the existing `saveEvent()` function from `eventStore.ts`), or update `/api/pipeline/run` to read from `intelligence_events`. This is the single most important change because without it the daily GNews cron that runs at 06:00 UTC produces data that is never processed into signals.

**Priority 2 — Wire `dataService.ts` to real DB tables**

Create DB tables for `articles`, `regulations`, `models`, `funding_rounds` and update each function in `dataService.ts` to query them. The seed data in `lib/data/*` can serve as initial DB seed scripts run once.

**Priority 3 — Wire homepage stats to live DB counts**

In `src/app/page.tsx`, replace `siteConfig.stats.signals` etc. with `async` server-side DB queries returning `COUNT(*)` from `signals`, `entities`, `trends`.

---

## Changes in this PR

| File | Change |
|---|---|
| `src/app/api/events/route.ts` | Added `IS_PRODUCTION` guard: returns `source: 'empty'` in production instead of `MOCK_EVENTS` |
| `src/trends/runner.ts` | Added `IS_PRODUCTION` guard: returns `[]` in production instead of `MOCK_TREND_SIGNALS` |
| `src/insights/runner.ts` | Added `IS_PRODUCTION` guard: returns `[]` in production instead of `MOCK_TRENDS` |
| `PRODUCTION_VERIFICATION_REPORT.md` | This document |
