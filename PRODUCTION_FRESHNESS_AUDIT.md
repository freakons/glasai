# Omterminal Production Freshness & Source Audit

**Date:** 2026-03-14
**Auditors:** Data Pipeline Engineer, Backend/Infrastructure Engineer, Database Reliability Engineer, Product Intelligence Analyst
**Trigger:** Platform appears stale — user seeing same data as last night

---

## A. Executive Summary

Omterminal has a **well-architected ingestion pipeline** with 50 RSS feeds, 10 GNews queries, 3 GitHub repos, and 3 arXiv searches configured. The pipeline is designed to run **hourly** via Vercel cron. However, there are several plausible failure points that could cause stale data in production:

**Most likely causes of stale data (ranked):**

1. **Vercel cron not actually executing** — The schedule is configured in `vercel.json`, but Vercel crons require Pro plan + correct deployment. If cron invocations are not happening, no data flows.
2. **CRON_SECRET / GNEWS_API_KEY not set in production** — The pipeline requires `CRON_SECRET` for auth and `GNEWS_API_KEY` for news ingestion. Missing env vars = silent failure.
3. **Vercel function timeout (60s maxDuration)** — Requires Pro plan. On Hobby plan, functions timeout at 10s, which is insufficient for 50-source RSS + GNews ingestion.
4. **All articles deduped** — If the pipeline runs but every article URL already exists in the DB, `articlesNew=0` and no new events/signals are generated. This is normal behavior but looks like staleness.
5. **ISR cache serving stale pages** — Homepage has `revalidate=3600` (1 hour). Even after fresh data ingestion, the homepage may serve hour-old content.

---

## B. Source Inventory by Category

### B.1 RSS Feeds — 50 sources (ALL ACTIVE)

**Canonical registry:** `src/config/sources.ts` (lines 56-481)
**Compatibility layer:** `src/config/intelligenceSources.ts` (maps to legacy format)
**Fetcher:** `src/services/ingestion/rssFetcher.ts`
**Ingester:** `src/services/ingestion/rssIngester.ts`

| Category | Count | Priority Mix | Status |
|----------|-------|-------------|--------|
| Company (AI labs & tech cos) | 12 | 5 HIGH, 7 normal | ACTIVE |
| Research (arXiv RSS + labs) | 10 | 2 HIGH, 8 normal | ACTIVE |
| Media (tech journalism) | 10 | 3 HIGH, 7 normal | ACTIVE |
| Funding (VC & startup news) | 8 | 0 HIGH, 8 normal | ACTIVE |
| Policy (government/regulatory) | 5 | 0 HIGH, 5 normal | ACTIVE |
| Infrastructure (cloud/chips) | 5 | 0 HIGH, 5 normal | ACTIVE |

**HIGH-priority feeds (fetched first each run):**
1. OpenAI Blog — `https://openai.com/blog/rss`
2. Anthropic Blog — `https://www.anthropic.com/rss.xml`
3. Google DeepMind — `https://deepmind.google/blog/rss.xml`
4. Meta AI Blog — `https://ai.meta.com/blog/rss/`
5. NVIDIA Developer — `https://developer.nvidia.com/blog/feed/`
6. arXiv ML — `https://arxiv.org/rss/cs.LG`
7. Hugging Face Blog — `https://huggingface.co/blog/feed.xml`
8. TechCrunch AI — `https://techcrunch.com/tag/artificial-intelligence/feed/`
9. VentureBeat AI — `https://venturebeat.com/category/ai/feed/`
10. MIT Tech Review AI — `https://www.technologyreview.com/topic/artificial-intelligence/feed/`

**Company feeds (12):**
- OpenAI, Anthropic, DeepMind, Meta AI, NVIDIA, Microsoft AI, Google AI, Mistral AI, Cohere, Stability AI, xAI, Perplexity AI

**Research feeds (10):**
- arXiv ML (cs.LG), arXiv AI (cs.AI), arXiv NLP (cs.CL), arXiv CV (cs.CV), MIT CSAIL, Stanford AI Lab, Berkeley BAIR, Distill.pub, Apple ML Research, Hugging Face Blog

**Media feeds (10):**
- TechCrunch AI, VentureBeat AI, MIT Tech Review, Semafor, The Information, Import AI, AI Snake Oil, Interconnects, Stratechery, The Verge AI

**Funding feeds (8):**
- Crunchbase AI, Sequoia Capital, a16z, Lightspeed Ventures, General Catalyst, First Round Review, TechCrunch Venture, AI Fund

**Policy feeds (5):**
- EU AI Office, White House OSTP, UK AI Safety Institute, OECD AI, NIST AI

**Infrastructure feeds (5):**
- AWS ML, IBM Research, Weights & Biases, Lightning AI, Semiconductor Engineering

### B.2 GNews API — 10 query patterns (ACTIVE, quota-limited)

**File:** `src/services/ingestion/gnewsFetcher.ts` (lines 65-76)
**API:** `https://gnews.io/api/v4/search`
**Env:** `GNEWS_API_KEY` (REQUIRED), `GNEWS_MAX_QUERIES` (default 3, max 10)

Queries:
1. "AI funding investment"
2. "AI model release launch"
3. "artificial intelligence regulation"
4. "AI startup acquisition"
5. "machine learning research breakthrough"
6. "large language model GPT Claude"
7. "AI policy government"
8. "generative AI enterprise"
9. "AI safety regulation"
10. "AI chip semiconductor"

**Rate limit:** Free tier ~100 req/day. Default 3 queries/run × 24 runs/day = 72 req/day.

### B.3 GitHub Release Monitoring — 3 repos (ACTIVE)

**File:** `src/harvester/sources/githubSource.ts`
**Env:** `GITHUB_TOKEN` (optional, increases rate limits)

Repos monitored:
1. `huggingface/transformers`
2. `langchain-ai/langchain`
3. `openai/openai-cookbook`

### B.4 arXiv Search — 3 queries (ACTIVE)

**File:** `src/harvester/sources/arxivSource.ts`
**API:** `https://export.arxiv.org/api/query`

Queries:
1. "large language model"
2. "transformer architecture"
3. "generative ai"

### B.5 Dead / Legacy Code

| File | Content | Status |
|------|---------|--------|
| `src/harvester/sources/registry.ts` | 4 hardcoded RSS URLs (HN, Verge, TC, VB) | **DEAD** — not wired to main pipeline |
| `src/harvester/sources/rssSource.ts` | `RssSource` SourceAdapter class | **UNUSED** — main pipeline uses rssFetcher directly |
| `src/app/api/ingest/route.ts` | Legacy GNews-only ingestion route | **INACTIVE** — not scheduled, no pipeline lock |

---

## C. Schedule / Cron Audit

### C.1 Vercel Cron Jobs (Production)

**File:** `vercel.json` (lines 3-16)

| Route | Schedule | Frequency | Purpose |
|-------|----------|-----------|---------|
| `/api/pipeline/run` | `0 * * * *` | Every hour at :00 | **PRIMARY** — 4-stage pipeline (ingest → signals → snapshots → cache) |
| `/api/intelligence/run` | `0 */2 * * *` | Every 2 hours at :00 | **SECONDARY** — harvester → trend analysis → insight generation |
| `/api/alerts/send-digest` | `0 7 * * *` | Daily at 07:00 UTC | Email digest delivery |

### C.2 Node.js Background Scheduler

**File:** `src/scheduler/runner.ts`
- Runs every **15 minutes** via `setInterval`
- Executes: `runHarvester()` → `runTrendAnalysis()` → `runInsightGeneration()`
- **Important:** This is a SEPARATE pipeline from the Vercel cron. It runs within the Node.js process and may NOT work on Vercel serverless (functions are ephemeral).

### C.3 ISR Revalidation Intervals

| Page | Revalidate | Effect |
|------|-----------|--------|
| Homepage (`/`) | 3600s (1 hour) | **STALE RISK** — even after fresh ingestion, homepage serves old data for up to 1 hour |
| Signals page | 300s (5 min) | Moderate freshness |
| Intelligence page | 300s (5 min) | Moderate freshness |
| Dashboard pages | 60s (1 min) | Near-realtime |

### C.4 API Cache Headers

| Endpoint | s-maxage | stale-while-revalidate |
|----------|----------|----------------------|
| `/api/intelligence/signals` | 10s | 60s |
| `/api/signals` | 10s | 60s |
| `/api/opportunities` | 10s | 60s |
| `/api/intelligence/trends` | 30s | 120s |
| `/api/snapshots` | 30s | 120s |
| `/api/search` | 5s | 30s |

### C.5 Schedule Mismatches / Risks

1. **Dual pipeline confusion:** Vercel cron (`/api/pipeline/run` hourly) and Node.js scheduler (every 15 min) run independently. On Vercel serverless, the Node.js scheduler likely does NOT persist between invocations.
2. **Homepage 1-hour ISR:** The `revalidate=3600` on the homepage is the longest cache in the system and could mask freshly ingested data.
3. **Vercel Pro plan required:** `maxDuration=60` in the pipeline route requires Vercel Pro. Hobby plan limits functions to 10s.

---

## D. Freshness Pipeline Audit

### D.1 Full Pipeline Flow

```
[50 RSS feeds + 10 GNews queries]
         ↓
    rssFetcher.ts / gnewsFetcher.ts
         ↓
    rssIngester.ts (classify + normalize)
         ↓
    articleStore.saveArticle() → articles table (ON CONFLICT url DO NOTHING)
         ↓
    eventStore.saveEvent() → events table (ON CONFLICT id DO NOTHING)
         ↓
    signalEngine.generateSignalsFromEvents() (reads last 500 events)
         ↓
    signalStore.saveSignals() → signals table
         ↓
    generateSignalInsightWithMeta() → updates signals with "Why This Matters"
         ↓
    generatePageSnapshots() → page_snapshots table
         ↓
    refreshCaches() → invalidates Redis keys + revalidates Next.js routes
         ↓
    UI pages read from signals/events/snapshots tables
```

**File:** `src/app/api/pipeline/run/route.ts` — orchestrates the entire flow.

### D.2 Stage-by-Stage Analysis

| Stage | Code | Timeout | Writes To | Dedup Strategy |
|-------|------|---------|-----------|----------------|
| 1. Ingest (RSS) | `rssIngester.ts` | 30s total | `articles`, `events` | URL uniqueness (articles), stable event ID (events) |
| 1b. Ingest (GNews) | `gnewsFetcher.ts` | 15s total | `events` | URL-based |
| 2. Signals | `signalEngine.ts` | 10s | `signals` | Event-based signal ID |
| 2b. Intelligence | `generateSignalInsight` | 10s | `signals` (insight columns) | Per-signal, non-blocking |
| 3. Snapshots | `snapshot.ts` | 15s | `page_snapshots` | Key-based upsert |
| 4. Cache | `cacheRefresh.ts` | 5s | Redis + ISR paths | Invalidation |

### D.3 Freshness Stall Points

Each of these could cause the platform to appear stale:

| Stall Point | Symptom | How to Detect |
|-------------|---------|---------------|
| Cron not firing | No new pipeline_runs rows | Check `pipeline_runs` table for recent rows |
| Auth failure (missing CRON_SECRET) | Pipeline returns 401 | Check Vercel function logs |
| RSS feeds all failing | `sourcesFailed=50` in pipeline run | Check pipeline_runs error_summary |
| GNews rate limited | `rateLimited=true` | Check GNews response in logs |
| All articles deduped | `articlesNew=0, articlesDeduped=N` | Normal if pipeline ran recently; check article timestamps |
| Signal generation empty | Events exist but no new signals | Check if `getRecentEvents(500)` returns old events |
| Snapshot generation fails | Signals exist but snapshots stale | Check page_snapshots timestamps |
| Cache not invalidated | Fresh data in DB but stale on CDN | Manually revalidate or check Redis |
| ISR serving stale page | Fresh DB data, old page render | Check `revalidate` intervals, force refresh |

---

## E. Database Freshness Checkpoints

### E.1 Schema (Critical Tables)

**File:** `src/db/schema.sql`

| Table | Key Timestamp | Purpose | Freshness Query |
|-------|--------------|---------|-----------------|
| `articles` | `published_at`, `created_at` | Raw ingested content | `SELECT MAX(created_at) FROM articles` |
| `events` | `timestamp`, `created_at` | Structured intelligence events | `SELECT MAX(created_at) FROM events` |
| `signals` | `created_at`, `updated_at` | Higher-order intelligence signals | `SELECT MAX(created_at) FROM signals` |
| `pipeline_runs` | `run_at` | Pipeline execution log | `SELECT * FROM pipeline_runs ORDER BY run_at DESC LIMIT 5` |
| `page_snapshots` | `updated_at` | Precomputed page data | `SELECT key, updated_at FROM page_snapshots ORDER BY updated_at DESC` |
| `pipeline_locks` | `locked_at` | Distributed lock state | `SELECT * FROM pipeline_locks` |

### E.2 Health / Diagnostic Endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /api/health` | None (public) | Liveness check (DB ping) |
| `GET /api/health` | `x-admin-secret` header | **Full diagnostics** — DB, schema, Redis, pipeline, LLM, cron, data consistency |
| `GET /api/health/pipeline` | `x-admin-secret` header | In-process pipeline health (last run, signals count) |
| `GET /api/health/db` | Unknown | DB-specific health |

### E.3 Key Diagnostic Queries

To determine exactly when data last flowed:

```sql
-- Last article ingested
SELECT id, title, source, published_at, created_at
FROM articles ORDER BY created_at DESC LIMIT 5;

-- Last event created
SELECT id, type, company, title, timestamp, created_at
FROM events ORDER BY created_at DESC LIMIT 5;

-- Last signal generated
SELECT id, signal_type, title, created_at
FROM signals ORDER BY created_at DESC LIMIT 5;

-- Pipeline run history
SELECT id, stage, status, trigger_type, ingested, signals_generated,
       duration_ms, run_at, correlation_id, error_summary
FROM pipeline_runs ORDER BY run_at DESC LIMIT 10;

-- Check for stuck lock
SELECT * FROM pipeline_locks;

-- Snapshot freshness
SELECT key, updated_at FROM page_snapshots ORDER BY updated_at DESC;
```

---

## E. Likely Failure Points (Ranked)

### HIGH Likelihood

**1. Vercel cron not executing (or not deployed)**
- **Evidence:** `vercel.json` configures 3 crons, but Vercel cron requires: (a) Pro plan, (b) correct deployment, (c) the `vercel.json` to be in the deployed version.
- **Why plausible:** If the project is on Hobby plan or crons were not enabled after deployment, no pipeline runs happen at all.
- **Verify:** Check Vercel dashboard → Cron Jobs tab. Or query `SELECT COUNT(*) FROM pipeline_runs WHERE run_at > NOW() - INTERVAL '24 hours'`.

**2. Missing critical environment variables in production**
- **Evidence:** Pipeline requires `CRON_SECRET` (auth), `GNEWS_API_KEY` (news), `DATABASE_URL` (storage). The health endpoint lists these as critical: `['DATABASE_URL', 'CRON_SECRET', 'ADMIN_SECRET', 'GNEWS_API_KEY']` (line 63 of `/api/health/route.ts`).
- **Why plausible:** Environment variables must be set in Vercel project settings. If any are missing, the pipeline either fails auth or can't ingest.
- **Verify:** Call `GET /api/health` with `x-admin-secret` header — the response includes `env.missingCritical`.

**3. Vercel function timeout on Hobby plan**
- **Evidence:** `maxDuration = 60` in pipeline route (line 61). Hobby plan max is 10s. The pipeline needs to fetch 50 RSS feeds + GNews queries + generate signals + snapshots + cache.
- **Why plausible:** If on Hobby plan, the function times out at 10s, likely only completing partial RSS fetch.
- **Verify:** Check Vercel plan tier. Check pipeline_runs for `status='partial'` or timeout errors.

**4. Pipeline lock stuck**
- **Evidence:** Pipeline uses distributed locking with 300s TTL (`PIPELINE_LOCK_TTL_SECONDS`). If a run crashes without releasing the lock, subsequent runs are skipped with HTTP 409.
- **Why plausible:** A timeout or crash during a pipeline run could leave the lock in place.
- **Verify:** Query `SELECT * FROM pipeline_locks` or check `/api/health` for lock status.

### MEDIUM Likelihood

**5. All articles deduped (no new content)**
- **Evidence:** Article storage uses `ON CONFLICT url DO NOTHING`. If all fetched articles have URLs already in the DB, `articlesNew=0`.
- **Why plausible:** If sources haven't published new content since last successful run, this is expected behavior — but it looks like staleness.
- **Verify:** Check `articlesDeduped` vs `articlesNew` in recent pipeline_runs.

**6. ISR cache masking fresh data**
- **Evidence:** Homepage `revalidate=3600` (1 hour). Intelligence/signals pages `revalidate=300` (5 min).
- **Why plausible:** Even if pipeline just ran and DB has fresh data, pages may serve hour-old renders.
- **Verify:** Hard-refresh the page (Ctrl+Shift+R) or check API endpoints directly.

**7. Node.js scheduler not running on Vercel**
- **Evidence:** `src/scheduler/runner.ts` uses `setInterval` — this works in long-running Node.js processes but NOT in serverless functions (ephemeral).
- **Why plausible:** The secondary intelligence pipeline (harvester → trends → insights) may never execute on Vercel serverless.
- **Verify:** This is the `/api/intelligence/run` cron's responsibility — check if that cron is running.

### LOW Likelihood

**8. RSS feeds all returning errors or empty**
- **Evidence:** The ingester handles per-source failures gracefully and logs them.
- **Why low:** 50 feeds all failing simultaneously is unlikely unless there's a network-level issue.
- **Verify:** Check pipeline_runs for `sourcesFailed` count.

**9. Signal engine producing no signals from valid events**
- **Evidence:** `generateSignalsFromEvents()` processes the last 500 events.
- **Why low:** The engine should produce signals from any set of events.
- **Verify:** Check `signals_generated` in pipeline_runs.

**10. Database write failures**
- **Evidence:** Both article and event writes have error handling and continue on failure.
- **Why low:** If DB connectivity works (health check passes), writes should succeed.
- **Verify:** Check for error_summary in pipeline_runs.

---

## F. Required Live Checks

### Immediate (do these now)

- [ ] **Check Vercel dashboard → Cron Jobs** — Are crons enabled? Are they actually firing?
- [ ] **Check Vercel plan tier** — Is it Pro (required for `maxDuration=60`)?
- [ ] **Call `GET /api/health` with `x-admin-secret` header** — Get full diagnostic dump
- [ ] **Query `pipeline_runs` table** — `SELECT * FROM pipeline_runs ORDER BY run_at DESC LIMIT 10`
- [ ] **Check latest article timestamp** — `SELECT MAX(created_at) FROM articles`
- [ ] **Check latest signal timestamp** — `SELECT MAX(created_at) FROM signals`
- [ ] **Check for stuck pipeline lock** — `SELECT * FROM pipeline_locks`
- [ ] **Verify env vars in Vercel** — `CRON_SECRET`, `GNEWS_API_KEY`, `DATABASE_URL`, `ADMIN_SECRET` all set?

### Secondary (if pipeline seems configured but still stale)

- [ ] **Manually trigger pipeline** — `POST /api/pipeline/run?secret=<CRON_SECRET>` and inspect response
- [ ] **Check pipeline run response** — Look at `stages` array, `diagnostics.articlesFetched`, `diagnostics.articlesInserted`
- [ ] **Check GNews quota** — Is `GNEWS_API_KEY` valid? Has free tier quota been exhausted?
- [ ] **Check Vercel function logs** — Filter for `[pipeline]` log lines
- [ ] **Hard-refresh UI** — Ctrl+Shift+R to bypass ISR cache
- [ ] **Check page_snapshots freshness** — `SELECT key, updated_at FROM page_snapshots ORDER BY updated_at DESC`

### Structural (longer-term fixes)

- [ ] **Reduce homepage ISR to 300s** — `revalidate=3600` is too long for a real-time intelligence platform
- [ ] **Remove dead harvester code** — `src/harvester/sources/registry.ts` causes confusion
- [ ] **Ensure Pro plan** — Pipeline cannot run reliably on Hobby plan
- [ ] **Add alerting on pipeline failures** — Currently failures are logged but not alerted on

---

## G. Final Direct Answers

### 1. How many sources are currently configured, by category?

| Category | Count | Source Type |
|----------|-------|-------------|
| RSS feeds (company blogs) | 12 | RSS/Atom |
| RSS feeds (research/academic) | 10 | RSS/Atom |
| RSS feeds (media/journalism) | 10 | RSS/Atom |
| RSS feeds (funding/VC) | 8 | RSS/Atom |
| RSS feeds (policy/government) | 5 | RSS/Atom |
| RSS feeds (infrastructure) | 5 | RSS/Atom |
| **RSS subtotal** | **50** | |
| GNews API queries | 10 (3 default per run) | REST API |
| GitHub repos | 3 | REST API |
| arXiv searches | 3 | REST API |
| **Grand total** | **66 source endpoints** | |

All 50 RSS feeds have `enabled: true`. No sources are disabled in code.

### 2. What are the primary source types?

1. **RSS feeds** (50) — Primary, no quota, ~750 articles/run max (50 sources × 15 articles)
2. **GNews API** (10 queries, 3 default per run) — Secondary, quota-limited (~100 req/day free tier)
3. **GitHub releases** (3 repos) — Supplementary, via harvester
4. **arXiv API** (3 queries) — Supplementary, via harvester

### 3. What auto-run schedules are configured right now?

| Schedule | Frequency | Route | Config |
|----------|-----------|-------|--------|
| `0 * * * *` | **Hourly** | `/api/pipeline/run` | `vercel.json` |
| `0 */2 * * *` | **Every 2 hours** | `/api/intelligence/run` | `vercel.json` |
| `0 7 * * *` | **Daily 7am UTC** | `/api/alerts/send-digest` | `vercel.json` |
| Every 15 minutes | **15-min interval** | Node.js scheduler | `src/scheduler/runner.ts` (may not work on Vercel serverless) |

### 4. What part of the freshness pipeline is most likely failing?

**The cron execution layer.** The pipeline code is well-structured and should work when invoked. The most likely failure is that the pipeline is simply **not being invoked** — either because:
- Vercel crons are not enabled/deployed
- The project is on Hobby plan (10s timeout insufficient)
- `CRON_SECRET` is not set (auth fails in production)

### 5. What are the top 3 most urgent fixes/checks?

1. **Verify Vercel cron is actually firing** — Check the Vercel dashboard Cron Jobs tab. If no recent invocations show, this is the root cause.
2. **Verify all critical env vars are set** — `DATABASE_URL`, `CRON_SECRET`, `GNEWS_API_KEY`, `ADMIN_SECRET` in Vercel project settings.
3. **Manually trigger the pipeline and inspect the response** — `POST /api/pipeline/run?secret=<CRON_SECRET>`. The response JSON includes per-stage status, article counts, and error details. This single call will reveal exactly where the pipeline breaks.

---

*This audit was conducted by inspecting the actual codebase, configuration files, and code paths. No live database queries were executed. All findings are based on code evidence. Live verification steps are provided in Section F.*
