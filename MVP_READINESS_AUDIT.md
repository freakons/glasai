# Omterminal — MVP Readiness Audit

**Date:** 2026-03-13
**Scope:** Post Layers 1–3 full-surface audit
**Auditor:** Principal Engineer (automated)
**Codebase:** ~34K lines TypeScript · Next.js 16 · Neon PostgreSQL · Upstash Redis · Vercel
**Branch:** `claude/mvp-readiness-audit`

---

## 1. Current Strengths

### 1a. Architecture & Infrastructure — Strong

- **Canonical pipeline** (`POST /api/pipeline/run`): 4-stage pipeline (ingest → signals → snapshots → cache) with distributed locking, per-stage timeouts, overall timeout guard, dry-run mode, and full run ledger. Production-grade.
- **Health endpoint** (`GET /api/health`): Tiered public/admin response. Admin view checks 10 subsystems (DB, schema, Redis, pipeline, LLM, environment, cron, data consistency). Computes composite grades (healthy/degraded/failing). Best-in-class for a startup.
- **Database layer**: Neon serverless PostgreSQL with parameterized queries throughout (no SQL injection risk). Clean schema with proper indexing. Two-branch policy (production + vercel-dev) is correct for solo-founder workflow.
- **Auth on pipeline routes**: Fail-closed in production when CRON_SECRET is unset. UA-based bypass removed (per LAUNCH_AUDIT fixes). Secret-based auth on admin endpoints.
- **Data service abstraction** (`dataService.ts`): DB-first with static seed fallback. All pages remain functional even without a live database. Correct degradation strategy.
- **Multi-provider AI layer** (`lib/ai/`): Supports Groq, Grok, OpenAI, Ollama with auto-detection priority chain and cached provider pattern.
- **Idempotent migrations**: All DDL uses `IF NOT EXISTS` / `ON CONFLICT` patterns. Safe to re-run.

### 1b. Intelligence System — Impressive for Stage

- **Signal engine** generates signals from events with confidence scoring, direction classification, and entity extraction.
- **Feed composer** (`feedComposer.ts`): Diversity enforcement, deduplication, significance filtering, and ranking. Not a naive chronological list.
- **Cross-signal linker**: Detects relationships between signals (e.g., funding + model release from same company).
- **Explanation layer**: Generates human-readable "So What" context for signals.
- **Trust engine** (`trustEngine.ts`, `sourceTrust.ts`): Source credibility scoring with multi-factor assessment.
- **Entity resolver** (`entityResolver.ts`): Fuzzy matching and alias resolution for company/model names.
- **Trend analysis**: Topic extraction, clustering, embeddings, scoring, aggregation pipeline.
- **Insight generation**: AI-powered insights from trend data via Groq/Grok LLM.
- **Consistency checks** (`consistencyChecks.ts`): Read-only DB integrity checks surfaced in health endpoint.

### 1c. Product Surface — Polished for Pre-MVP

- **Homepage**: Live DB stats with fallback, hero section, feature grid, trend radar component.
- **Intelligence feed** (`/intelligence`): Composed signal feed with stat cards, featured article, filtering, command bar. Revalidates every 5 minutes.
- **Entity pages** (`/entity/[slug]`): Full intelligence profile — metrics (24h/7d/30d signals, velocity, trend), major developments timeline, related entities, source coverage. Real DB data.
- **Graph page** (`/graph`): Force-directed visualization using `react-force-graph` with entity/event/signal node types.
- **Signals browser** (`/signals`): Client-side filterable signal list with mock fallback in dev only.
- **Dashboard** (`/dashboard/*`): Tabbed layout with signals, trends, and insights views.
- **Design system**: Custom fonts (Instrument Serif, DM Sans, DM Mono), CSS custom properties, glass morphism cards, ambient background, dark-first terminal aesthetic. Consistent visual identity.
- **SEO**: Proper metadata, OpenGraph, Twitter cards, robots directives, per-page titles.
- **Layout**: Sidebar + topbar + ticker + footer shell. Professional terminal-style UI.

### 1d. Operational Readiness — Good Foundation

- **Vercel cron scheduling**: Three crons configured (pipeline hourly, intelligence every 2h, digest daily 07:00 UTC).
- **Pipeline observability**: Every run (including skipped/dry-run) recorded in `pipeline_runs` with correlation IDs, timing, error summaries.
- **Admin system page** (`/admin/system`): Live deployment diagnostics showing DB status, signal counts, data source, environment vars.
- **Operator checklist** (`docs/operator-checklist.md`): Step-by-step Vercel/Neon setup instructions.
- **Deployment guard** (`scripts/deployment-check.js`): Pre-build validation.
- **Request IDs**: `crypto.randomUUID()` for correlation across logs and responses.

### 1e. Test Coverage — Targeted

- 14 test files covering: deduplication, normalization helpers, entity resolution, trust engine, source trust, relationship intelligence, entity intelligence, rank scoring, feed composition, event detection, significance scoring, explanation layer, cross-signal linking, consistency checks.
- Tests cover the most critical intelligence logic — correct prioritization.

---

## 2. Current Weaknesses

### 2a. Static Data Dependencies — HIGH

Several major pages still serve static seed data when the DB tables are empty:

| Page | Data Source When DB Empty |
|---|---|
| `/intelligence` | `NEWS` array from `lib/data/news.ts` (hardcoded articles) |
| `/regulation`, `/regulation/[slug]` | `REGULATIONS` array from `lib/data/regulations.ts` |
| `/models`, `/models/[slug]` | `MODELS` array from `lib/data/models.ts` |
| `/funding`, `/funding/[slug]` | `FUNDING_ROUNDS` array from `lib/data/funding.ts` |
| Ticker | Always static (`TICKERS` array) — no DB query at all |
| Homepage | `siteConfig.stats.markets` (hardcoded "12"), "2.4K Professionals" (hardcoded) |
| About page | Hardcoded stats from `siteConfig` |

**Impact:** A founder visiting `/regulation` or `/models` sees curated but frozen editorial content. This is acceptable for launch if users understand it's seeded data, but creates a credibility gap if the data is stale.

### 2b. No User Authentication — CRITICAL for Monetization, Acceptable for MVP

- No user login, session management, or access control.
- No user accounts table is populated (schema exists in `INFRASTRUCTURE.md` but not in `schema.sql`).
- The "Request Access" button stores emails in `access_requests` but there's no access gating.
- All content is publicly accessible — no paywall, no gated content, no user-specific views.
- Admin page (`/admin/system`) has no auth gate — relies on obscurity.

**Impact:** Fine for a free MVP launch / waitlist stage. Blocks any monetization.

### 2c. No Search — MEDIUM

- Meilisearch is described in `INFRASTRUCTURE.md` but no search implementation exists.
- No `/api/search` endpoint.
- No search UI anywhere in the app.
- Users cannot search across signals, entities, articles, or events.

**Impact:** Acceptable for early MVP if the feed is curated. Becomes a blocker as content volume grows.

### 2d. No User Alerts/Notifications — MEDIUM

- `alert_rules` table described in infrastructure but not in the live schema.
- No mechanism for users to subscribe to entity-specific or topic-specific alerts.
- Daily digest implemented via `/api/alerts/send-digest` with per-user personalized alerts (resolved in current sprint).

### 2e. Admin System Page Unprotected — LOW-MEDIUM

- `/admin/system` renders server-side with no auth check.
- Exposes: DB connection status, env var presence, signal counts, data source.
- Not indexed (noted in page footer) but discoverable by URL guessing.

### 2f. Legacy/Dead Code — LOW

- `/api/ingest` route still exists (was identified as problematic in LAUNCH_AUDIT).
- Some dual-path confusion between `/api/pipeline/run` and `/api/intelligence/run` — two separate crons doing overlapping work.
- `src/server/opportunitySocket.ts` — WebSocket server code that's not integrated.
- `src/terminal/commandParser.ts`, `commandRouter.ts` — terminal command system that appears unused.
- Duplicate component paths: `src/components/` and `src/ui/` both have cards, badges, etc.

### 2g. No Error Boundary / Loading States — LOW

- No React error boundaries for graceful failure on the client side.
- No loading skeletons or suspense boundaries (pages use ISR so this is less critical).
- Empty states exist but are minimal (just text like "No signals available").

### 2h. No Analytics / Monitoring in Production — LOW

- `useAnalytics.ts`, `usePerformance.ts`, `useErrorMonitoring.ts` hooks exist but are likely stubs.
- No Vercel Analytics, Sentry, or similar integration visible.

---

## 3. MVP Blockers (Must-Have Before Launch)

| # | Blocker | Severity | Effort | Why |
|---|---|---|---|---|
| **B1** | Protect `/admin/system` with auth or remove from production build | HIGH | 30 min | Leaks deployment internals to anyone who guesses the URL |
| **B2** | Verify LAUNCH_AUDIT F1–F5 fixes are applied | HIGH | 1 hr | Security holes (dual-ingest race, secret leakage) may still be live |
| **B3** | Ensure at least one cron pipeline is producing real data end-to-end | HIGH | 2 hr | Without confirmed live data flow, users see empty or frozen static data |
| **B4** | Empty-state UX for all pages when DB has no data | MEDIUM | 2 hr | Empty pages with just "No signals available" look broken, not empty |
| **B5** | Remove or hide hardcoded vanity metrics ("2.4K Professionals tracking AI") | MEDIUM | 15 min | Falsifiable claims damage credibility if the product is new |

**Total estimated effort: ~6 hours**

---

## 4. Should-Have Soon After MVP

| # | Item | Category | Effort |
|---|---|---|---|
| **S1** | Add auth gate to `/admin/system` (redirect or 404 without `ADMIN_SECRET` cookie/header) | Security | 1 hr |
| **S2** | Wire regulation, models, funding pages to live DB instead of static arrays | Data completeness | 4 hr |
| **S3** | Add basic full-text search across signals and entities | Discovery | 6 hr |
| **S4** | Add email-based login (magic link via Resend) for waitlist-to-user conversion | Auth | 8 hr |
| **S5** | Error boundaries and loading skeletons for all major pages | Polish | 3 hr |
| **S6** | Remove dead code: unused terminal commands, opportunity WebSocket, duplicate component paths | Hygiene | 2 hr |
| **S7** | Wire ticker to live data (latest signals or events) instead of static array | Polish | 1 hr |
| **S8** | Consolidate `/api/pipeline/run` and `/api/intelligence/run` into one pipeline or document why both exist | Architecture | 3 hr |

---

## 5. Later / Beta / Premium Work

| # | Item | Category |
|---|---|---|
| **L1** | User accounts + subscription tiers (free/pro) | Monetization |
| **L2** | Personalized alerts (entity/topic subscriptions) | Engagement |
| **L3** | Meilisearch integration for full-text search | Scale |
| **L4** | Embeddable widgets (signal cards, trend radar) for external sites | Growth |
| **L5** | API access for pro users (rate-limited signal/entity endpoints) | Monetization |
| **L6** | Mobile-optimized responsive pass | Reach |
| **L7** | Real-time WebSocket updates (signals push) | Engagement |
| **L8** | Competitive benchmarking dashboard | Premium feature |
| **L9** | Analytics integration (Vercel Analytics / PostHog / Plausible) | Ops |
| **L10** | Custom AI briefings per user | Premium feature |

---

## 6. Recommended Next 5 Build Tasks

These are ordered by impact-to-effort ratio for a solo founder:

### Task 1: Verify and Close LAUNCH_AUDIT Security Fixes (F1–F5)
**Why first:** Security holes cannot ship. Verify `/api/ingest` cron is removed from `vercel.json`, UA-based auth is gone, CRON_SECRET fails closed, no secret leakage.
**Effort:** 1–2 hours
**Deliverable:** Verified production deployment with no open auth bypasses.

### Task 2: Confirm End-to-End Data Pipeline Is Running
**Why:** Without real data flowing, the product is a static mockup. Trigger `/api/intelligence/run` manually, verify signals appear in `/api/signals`, verify they render on `/intelligence` and `/signals` pages.
**Effort:** 2 hours
**Deliverable:** Screenshots/logs proving: cron fires → harvester fetches → signals written → pages render live data.

### Task 3: Empty-State Polish + Remove Vanity Metrics
**Why:** First impressions. A new visitor should see a clean "intelligence is being gathered" state, not a broken page or obviously fake stats.
**Effort:** 2–3 hours
**Deliverable:** All pages handle zero-data gracefully. "2.4K Professionals" removed or replaced with real waitlist count.

### Task 4: Protect Admin Page
**Why:** `/admin/system` leaks internals. Either add `ADMIN_SECRET` cookie check or exclude from production build.
**Effort:** 30 min – 1 hour
**Deliverable:** Admin page returns 404 or redirects for unauthenticated visitors.

### Task 5: Wire Regulation/Models/Funding to Live DB
**Why:** These are key product surfaces. Static data works as seed content but should be augmented by the intelligence pipeline writing real regulations, model releases, and funding events.
**Effort:** 4–6 hours
**Deliverable:** Pages query DB first, fall back to seed data only when DB is empty. Pipeline populates these tables.

---

## 7. Risks and Technical Debt to Watch

| Risk | Severity | Mitigation |
|---|---|---|
| **Dual pipeline confusion** — `/api/pipeline/run` (hourly) and `/api/intelligence/run` (every 2h) do overlapping but different work. The `pipeline/run` reads from `events` table while `intelligence/run` uses the harvester chain. | HIGH | Consolidate into one pipeline or clearly document the separation. Currently confusing even to auditors. |
| **GNews API rate limits** — Free tier is 100 req/day. At 30-min cache TTL with hourly cron, this is fine. But adding more queries or reducing TTL could hit limits. | MEDIUM | Monitor GNews usage. RSS is the primary source; GNews is supplementary. |
| **Vercel function timeout** — `maxDuration=60` with stage timeouts summing to 60s. On Hobby plan this is 10s. Must be on Pro plan. | MEDIUM | Already documented. Ensure Pro plan is active before launch. |
| **No database backups** — Neon free tier may not include point-in-time recovery. | MEDIUM | Verify Neon backup policy. Consider periodic `pg_dump` to S3. |
| **Static seed data staleness** — `lib/data/` files contain curated but time-specific data (e.g., specific funding rounds, model releases). This data will become stale. | LOW | Replace with DB-sourced data per Task 5. Seed data becomes initial migration content. |
| **Component duplication** — `src/components/` and `src/ui/` both define cards, badges, etc. | LOW | Consolidate to one component library. Currently functional but will cause confusion as team grows. |
| **No rate limiting on public API routes** — `/api/signals`, `/api/entities`, etc. have no application-level rate limiting. Cloudflare WAF rule covers `/api/*` at 60 req/min, but this depends on Cloudflare being configured. | MEDIUM | Add application-level rate limiting or verify Cloudflare rules are active. |

---

## 8. Files Changed in This Audit

| File | Change |
|---|---|
| `MVP_READINESS_AUDIT.md` | This document (new) |

No code changes were made. This audit is diagnostic only.

---

## 9. Final MVP Readiness Judgment

### Verdict: CONDITIONAL GO

**The product is architecturally sound and surprisingly mature for a solo-founder build.** The intelligence pipeline, signal processing, entity resolution, and trust scoring systems are production-quality. The UI is polished and has a clear, professional identity. The health/diagnostics system is best-in-class.

**Conditions for launch:**

1. **Verify LAUNCH_AUDIT security fixes are deployed** (1–2 hours)
2. **Confirm live data is flowing end-to-end** (2 hours)
3. **Remove hardcoded vanity metrics** (15 minutes)
4. **Protect or remove `/admin/system`** (30 minutes)

With these 4 items addressed (~4–5 hours of work), Omterminal is ready for a founder-grade MVP launch — a product that can be shown to early users, investors, and design partners.

**What makes it ready:**
- Real intelligence pipeline with scheduled automation
- Signal quality system (scoring, ranking, dedup, explanation)
- Entity intelligence pages with real metrics
- Professional UI that doesn't look like a prototype
- Operational diagnostics for founder self-service

**What keeps it from being a product:**
- No user accounts or auth (acceptable for waitlist/free launch)
- No search (acceptable at current content volume)
- Some pages serve static seed data (acceptable if disclosed or if pipeline is running)

**Recommended launch strategy:** Launch as invite-only / waitlist with all content public. Use the "Request Access" flow to build the user list. Gate premium features (alerts, personalized briefings, API access) behind future auth.

---

*This audit was conducted on the `claude/mvp-readiness-audit` branch. No code changes were made.*
