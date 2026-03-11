# Signal Flow Diagnosis — Omterminal
**Date:** 2026-03-11
**Scope:** Live signal pipeline audit — ingestion to UI
**Branch:** `claude/diagnose-signal-flow-lYPOJ`

---

## 1. End-to-End Signal Flow Map

### Pipeline A — GNews → Events → Signals (cron: every 5 min)

```
/api/pipeline/run (cron, */5 * * * *)
  └─ [Stage 1] ingestGNews()                         gnewsFetcher.ts
       ├─ Fetch 10 search queries from GNews API
       ├─ classifyArticle()                           classifier.ts
       ├─ categoryToEventType()                       gnewsFetcher.ts
       ├─ saveEvent()  → INSERT INTO events           eventStore.ts
       └─ INSERT INTO intelligence_events  (legacy)   gnewsFetcher.ts
       ╳  NEVER writes to: articles table             ← CRITICAL GAP
  └─ [Stage 2] generateSignalsFromEvents()            signalEngine.ts
       ├─ getRecentEvents(500)   FROM events
       ├─ Cluster detection (5 rules, time windows)
       └─ saveSignals()  → INSERT INTO signals        signalStore.ts
  └─ [Stage 3] generatePageSnapshots()               snapshot.ts
       └─ Writes to page_snapshots + Redis
  └─ [Stage 4] refreshCaches()                       cacheRefresh.ts
       └─ Deletes Redis keys + calls revalidatePath()
```

### Pipeline B — Harvester → Intelligence Ingest (cron: every 2 hours)

```
/api/intelligence/run (cron, 10 */2 * * *)
  └─ [Stage 1] runHarvester()                        harvester/runner.ts
       ├─ getSources()  (RSS, arXiv, GitHub)          registry.ts
       ├─ normalizeSignal()                           normalizer.ts
       ├─ processSignal()   → LLM call (Groq/Grok/OpenAI)
       ├─ scoreSignal()     → MIN_SCORE = 40 filter
       ├─ isDuplicate()     → deduplication check
       └─ sendSignal()  → POST /api/intelligence/ingest
            └─ INSERT INTO signals (random UUID, trust-based status)
            └─ INSERT INTO entities  (extracted entities)
            └─ INSERT INTO signal_entities  ← table may not exist
  └─ [Stage 2] runTrendAnalysis()
  └─ [Stage 3] runInsightGeneration()
```

### UI Data Sources

| Page | Data Function | DB Table | Fallback |
|---|---|---|---|
| `/` (homepage) | `getSiteStats()` | signals, entities, articles | `siteConfig.stats` hardcoded values |
| `/intelligence` | `fetchArticles()` → `getArticles()` | **articles** | `NEWS` static array (50+ items) |
| `/signals` | `getSignals(200)` | signals | `MOCK_SIGNALS` (dev only), `[]` (prod) |
| `/funding` | `fetchFundingRounds()` | funding_rounds | `FUNDING_ROUNDS` static array |
| `/models` | `fetchModels()` | ai_models | `MODELS` static array |
| `/regulation` | `fetchRegulations()` | regulations | `REGULATIONS` static array |

---

## 2. Where Live Output Is Most Likely Thinning Out

### Critical Break Points (in order of severity)

**Break Point 1 — GNews API exhausted silently**
- `gnewsFetcher.ts:76-90`: Fires 10 queries per run
- Cron runs every 5 minutes = 10 × 288 = **2,880 requests/day needed**
- GNews free plan: **100 requests/day**
- When `!res.ok`: logs a warning, `continue` — **zero articles, zero events, no error thrown**
- Result: ingestion appears to complete (exit code 0) with `total=0, ingested=0, skipped=0`

**Break Point 2 — `articles` table is never written to**
- `gnewsFetcher.ts` writes to `events` and `intelligence_events` only
- No code in the entire codebase executes `INSERT INTO articles`
- `fetchArticles()` in `dataService.ts:34-41`: tries DB → empty → **falls back to static NEWS array forever**
- The `/intelligence` feed shows the same 50+ hardcoded articles indefinitely
- Homepage `sources` stat = 0 (from `COUNT(DISTINCT source) FROM articles`) → falls back to `siteConfig.stats.sources = 24`

**Break Point 3 — Signal clustering requires event density that isn't reached**
- Even if some events are saved (first run before rate limit), the clustering rules require:
  - CAPITAL_ACCELERATION: ≥3 `funding` events within 14 days
  - MODEL_RELEASE_WAVE: ≥2 `model_release` events within 7 days
  - REGULATION_ACTIVITY: ≥2 `regulation`/`policy` events within 10 days
  - RESEARCH_MOMENTUM: ≥2 `research_breakthrough` events within 7 days
  - COMPANY_EXPANSION: ≥2 `company_strategy` events within 10 days
- With GNews rate-limited, ~10 total events per day may exist — not enough to cluster

**Break Point 4 — Snapshots based on empty source data**
- `generatePageSnapshots()` runs after ingestion
- `generateTopSignals()` queries `signals` table — empty → snapshot contains `{ signals: [], count: 0 }`
- Redis and DB snapshots are dutifully refreshed with empty data
- The system is "healthy operationally" while producing no visible output

---

## 3. Thresholds and Filters Identified

### Signal Engine (Pipeline A)

| Filter | Rule | Effect |
|---|---|---|
| Event type match | Must match `eventTypes[]` array per rule | Events typed as `other` never contribute to any signal |
| Cluster window | TIME_WINDOW: 7–14 days depending on signal type | Sparse events that don't cluster within window are silently dropped |
| Minimum count | 2–3 events per cluster | Fewer events = no signal fires at all |
| Confidence floor | Min 0.60 (when exactly `minCount` events) | No explicit cutoff but min confidence is always 0.60 |
| Status filter (read) | `status IS NULL OR status NOT IN ('rejected')` | Does NOT filter `auto`, `review`, `internal`, `published` — all pass |

### Harvester (Pipeline B)

| Filter | Rule | Effect |
|---|---|---|
| `MIN_SCORE = 40` | `score = confidence + category_bonus + entity_count` | Signals scoring < 40 are silently dropped pre-ingest |
| Trust engine | `confidence < 60` → status `internal` | Signals still written to DB; not filtered by `getSignals()` |
| `isDuplicate()` | Deduplication before ingest | May suppress valid re-ingested signals |
| LLM availability | `processSignal()` requires LLM provider | If no LLM key configured, `processSignal()` fails → signal skipped |

### Data Service Layer (Read path)

| Filter | Rule | Effect |
|---|---|---|
| DB-first with fallback | `if (dbRows.length > 0) return dbRows` | If DB has 0 rows, static data is served — **no indication to the user** |
| `getSignals()` status filter | Excludes `rejected` only | Correct: `auto`, `published`, `review`, `internal` all pass through |
| `getRegulations()` | `tableExists('regulations')` guard | If migration 003 not applied, returns [] → static fallback |
| `getModels()` | `tableExists('ai_models')` guard | Same as above |
| `getFundingRounds()` | `tableExists('funding_rounds')` guard | Same as above |
| `readSnapshot()` | Rejects snapshots older than 2× TTL | Stale snapshots (> 10 min) are discarded |

---

## 4. Remaining Static/Mock/Fallback Usage

### Always Static (no DB path exists)

| Location | Data | Notes |
|---|---|---|
| `src/lib/dataService.ts:99-104` | `fetchTickerItems()` always returns `TICKERS` | Hardcoded, no DB query at all |
| `src/config/site.ts:39-45` | `siteConfig.stats` (signals: 47, companies: 18, etc.) | Shown when DB returns 0; **masks broken state** |
| `src/app/page.tsx:14` | Homepage fallback values if `getSiteStats()` fails | Safe, but stats = 47 look live |
| `src/app/intelligence/page.tsx:4,42-43` | `MODELS`, `FUNDING_ROUNDS` imported from static arrays | Used for funding label calculation when DB is empty |

### DB-first but permanently falling back

| Location | Data | Root Cause |
|---|---|---|
| `src/lib/dataService.ts:33-41` | `fetchArticles()` → `NEWS` static array | `articles` table is never written to by live pipeline |
| `src/lib/dataService.ts:57-65` | `fetchRegulations()` → `REGULATIONS` static array | `regulations` table only populated by `/api/seed` (not auto) |
| `src/lib/dataService.ts:71-79` | `fetchModels()` → `MODELS` static array | `ai_models` table only populated by `/api/seed` |
| `src/lib/dataService.ts:85-93` | `fetchFundingRounds()` → `FUNDING_ROUNDS` static array | `funding_rounds` table only populated by `/api/seed` |

### Dev-only mock still visible in production path

| File | Mock | Condition |
|---|---|---|
| `src/app/signals/page.tsx:18-23` | `MOCK_SIGNALS` | Used in dev only; production gets `[]` |
| `src/db/queries.ts:128` | Default confidence `80` | Applied when both `confidence` and `confidence_score` columns are NULL |

### Dead code (never called in live flow)

| File | Status |
|---|---|
| `src/services/extraction/eventExtractor.ts` | `extractEventsFromArticle()` never called in production pipeline. `gnewsFetcher.ts` does its own inline classification. |
| `src/services/ingestion/rssFetcher.ts` | Placeholder — referenced only in harvester but may not write to `events` table |

---

## 5. Most Probable Root Causes Ranked

### Rank 1 — GNews API rate limit exhausted (VERY HIGH PROBABILITY)

- **Evidence**: 10 queries × every 5 min = 2,880 requests/day; free plan is 100/day
- **Symptom**: `ingestGNews()` silently returns `{ total: 0, ingested: 0, skipped: 0 }` on every run after the first
- **Effect**: Zero new events in `events` table after initial run; zero signals ever generated
- **Test**: Check `/api/ingest` response `diagnostics.eventsTableCount` — if it hasn't grown in 24 hours, the rate limit is the culprit

### Rank 2 — `articles` table never written to (CONFIRMED)

- **Evidence**: `grep -r "INSERT INTO articles" src/` returns zero results
- **Symptom**: `/intelligence` page always shows the same 50+ hardcoded articles
- **Effect**: The most-visible "live feed" page is permanently static
- **Test**: Query `SELECT COUNT(*) FROM articles` in the database — should be 0

### Rank 3 — Event density too low for signal clustering (HIGH PROBABILITY)

- **Evidence**: Signal rules require 2–3 same-type events in 7–14 days; GNews rate limit means near-zero events
- **Symptom**: `signals` table has 0 rows; `/signals` page shows empty state in production
- **Effect**: No signals visible to users; all signal stats = 0

### Rank 4 — Hardcoded fallback stats masking broken state (CONFIRMED)

- **Evidence**: `siteConfig.stats.signals = 47` in `site.ts`; used on homepage and intelligence page when DB = 0
- **Symptom**: Homepage shows "47 Signals this week" even when DB has 0 signals
- **Effect**: Platform looks operational; makes it harder to notice the pipeline is broken

### Rank 5 — Seed never run for regulations/models/funding (MEDIUM PROBABILITY)

- **Evidence**: `/api/seed` must be called manually with ADMIN_SECRET; no auto-seeding on deploy
- **Symptom**: `/regulation`, `/models`, `/funding` pages show static seed data if seed was run; or static array if not (same visual result either way)
- **Effect**: These pages never update regardless of pipeline health

### Rank 6 — `signal_entities` table missing (MEDIUM PROBABILITY)

- **Evidence**: `/api/intelligence/ingest` tries to `INSERT INTO signal_entities` — this table is in no migration
- **Effect**: Entity extraction silently fails on every Pipeline B signal; error is swallowed
- **Test**: Check `signal_entities` table exists in DB

### Rank 7 — LLM provider not configured for Pipeline B (MEDIUM PROBABILITY)

- **Evidence**: Pipeline B (`/api/intelligence/run`) calls `processSignal()` which requires LLM; no fallback if all keys absent
- **Symptom**: Every source's signals fail at `processSignal()` stage; `anyError = true`; signals skipped
- **Effect**: Harvester runs every 2 hours but produces 0 signals if LLM is unconfigured

### Rank 8 — Homepage ISR cache too long (CONFIRMED BUT SECONDARY)

- **Evidence**: `export const revalidate = 3600` (1 hour) in `app/page.tsx`
- **Effect**: Even if pipeline produces signals, homepage won't reflect them for up to 1 hour

---

## 6. Is the Pipeline Broken, Too Strict, or Just Underfed?

**The pipeline is broken at the source, not too strict.**

The filtering and confidence logic is reasonable and not over-aggressive. The core problems are:

1. **Source exhaustion**: GNews API key is almost certainly rate-limited. The ingestion layer calls 10 queries per 5-minute cron run, which exceeds any free plan within minutes of deployment.

2. **Structural gap**: The `articles` table is architecturally required by the `/intelligence` page, but the live ingestion pipeline (`gnewsFetcher.ts`) never writes to it. This is a missing integration point, not a filtering issue.

3. **Density starvation**: The signal clustering engine is correct, but it requires minimum event density (2–3 events of the same type in a time window). With a rate-limited GNews API, this density is never reached.

4. **Opacity**: The hardcoded `siteConfig.stats` fallback values (`signals: 47`, etc.) make the platform look operational when the DB has zero live data.

The pipeline is not too strict — if it received adequate event density, signals would fire. It is **structurally broken** (articles table) and **source-starved** (GNews rate limit).

---

## 7. Recommended Next Implementation Phase

### Priority 1 — Fix GNews rate limiting (immediate)

**Option A (quick fix):** Reduce queries per run from 10 to 3. At 3 queries × 288 runs/day = 864 requests/day — still over free tier, but reduces pressure.

**Option B (proper fix):** Add RSS ingestion as primary source. The intelligence sources config (`config/intelligenceSources.ts`) already defines 35+ sources with RSS feed URLs. These require no API key. Implement `rssFetcher.ts` properly (it's currently a placeholder), write to `events` table the same way `gnewsFetcher.ts` does.

**Option C (architecture fix):** Move GNews to run once per hour or less. Change cron from `*/5 * * * *` to `0 * * * *` (once/hour = 240 requests/day for 10 queries, still over free but much better).

### Priority 2 — Write to `articles` table from ingest (immediate)

In `gnewsFetcher.ts`, add `INSERT INTO articles` alongside the existing `INSERT INTO events`. The schema is already defined. Map:
- `id` → same hash as event ID (or URL-based)
- `title`, `source`, `url`, `published_at` → from GNews article
- `category` → from `classifyArticle()` result mapped to article category

This will immediately make `/intelligence` show live data instead of the 50-item static array.

### Priority 3 — Run `/api/seed` to populate static tables (immediate operational)

Trigger `POST /api/seed?key=<ADMIN_SECRET>` to populate `regulations`, `ai_models`, `funding_rounds` tables with current static arrays. Without this, those tables are empty and pages show the static arrays anyway — but counts in `getSiteStats()` will remain 0.

### Priority 4 — Fix `signal_entities` table missing (short-term)

Create migration `008_signal_entities.sql`:
```sql
CREATE TABLE IF NOT EXISTS signal_entities (
  signal_id  TEXT NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  entity_id  TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  confidence NUMERIC(4,3) DEFAULT 0.8,
  PRIMARY KEY (signal_id, entity_id)
);
```

### Priority 5 — Reduce homepage ISR to 300s (quick fix)

Change `export const revalidate = 3600` to `export const revalidate = 300` in `src/app/page.tsx` to match other pages.

### Priority 6 — Add a `/api/admin/health-check` diagnostic endpoint (observability)

Expose event count, signal count, articles count, last pipeline run timestamp, GNews success/fail rate — without requiring authentication in dev, or with admin key in prod.

### Priority 7 — Lower signal thresholds for initial operation

While the pipeline is being stabilized, temporarily lower thresholds:
- MODEL_RELEASE_WAVE: minCount 2 → 1 (fires on any single model release)
- CAPITAL_ACCELERATION: minCount 3 → 2

Revert once event density is healthy.

---

## 8. Raw / Standard / Premium Modes — Still the Right Next Step?

**Verdict: Yes — but not yet. Fix the pipeline first.**

The three-mode design remains sound architecture. After fixing ingestion and verifying signals actually reach the DB, the modes map cleanly onto what already exists:

| Mode | Definition | Implementation |
|---|---|---|
| **Raw** | All engine-generated signals with `status IN ('auto', 'review', 'internal')` | Already returned by `getSignals()` today |
| **Standard** | Signals with `confidence >= 60` or `status IN ('auto', 'published')` | Add `confidence_score >= 0.60` filter to `getSignals()` |
| **Premium** | Standard + LLM-enriched context (`signal_contexts` status = 'ready') | Already modeled in migration 006 + `getSignals()` LEFT JOIN |

The mode concept becomes meaningful only when signals exist. The immediate priority order is:

1. Fix articles table write (2-hour task)
2. Fix GNews rate limit via RSS fallback (1-day task)
3. Run seed + verify DB tables populated (30-minute operational task)
4. Verify signals start appearing in DB after above fixes
5. Then implement raw/standard/premium mode filtering UI

---

## Typecheck Status

TypeScript errors: **1,577 — all environment-level** (node_modules not installed in this environment). The errors are uniformly `Cannot find module 'next'` and `JSX element implicitly has type 'any'` — missing package declarations, not logic errors. Application logic files contain no detectable type-level bugs from this audit.

Build: Not runnable in this environment (missing node_modules). Pre-existing.

---

## Key Files Referenced in This Diagnosis

| File | Issue Found |
|---|---|
| `src/services/ingestion/gnewsFetcher.ts:65-69` | Returns `{ingested:0}` silently when GNEWS_API_KEY missing or rate-limited |
| `src/services/ingestion/gnewsFetcher.ts:76-78` | 10 queries per run; exhausts free GNews tier in minutes |
| `src/services/ingestion/gnewsFetcher.ts:95-130` | Writes to `events` + `intelligence_events` but NEVER `articles` |
| `src/lib/dataService.ts:33-41` | Falls back to static `NEWS` array when `articles` DB is empty |
| `src/lib/dataService.ts:99-104` | `fetchTickerItems()` is permanently static with no DB path |
| `src/config/site.ts:39-45` | `siteConfig.stats.signals = 47` hardcoded fallback masks pipeline failure |
| `src/app/page.tsx:8` | `revalidate = 3600` — homepage stale for up to 1 hour |
| `src/app/signals/page.tsx:17-23` | Shows `MOCK_SIGNALS` in dev, `[]` in prod — no live data |
| `src/app/api/intelligence/ingest/route.ts:107-130` | Inserts into `signal_entities` table that does not exist in migrations |
| `src/services/signals/signalEngine.ts:38-74` | Signal rules are correct; starved of events, not too strict |
| `vercel.json:3-17` | Cron runs pipeline every 5 min (too frequent for GNews) |
| `src/harvester/runner.ts:9` | `MIN_SCORE = 40` filter in Pipeline B |
| `src/services/extraction/eventExtractor.ts` | Never called in live pipeline (dead code in production flow) |
