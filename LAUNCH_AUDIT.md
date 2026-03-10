# Omterminal Launch-Readiness Audit

**Date:** 2026-03-10
**Auditor:** Principal Engineer (automated)
**Verdict:** NO-GO — 5 blocking issues identified

---

## 1. What Was Implemented Well

- **Single canonical pipeline route.** Consolidating all write-side orchestration into `POST /api/pipeline/run` with a 4-stage pipeline (ingest → signals → snapshots → cache) is the correct architectural move. It eliminates ad-hoc mutation paths.
- **Distributed lock with fallback chain.** Redis NX → DB INSERT ON CONFLICT → noop is a reasonable degradation strategy. The Redis path uses a Lua-scripted atomic release (check-and-delete), which is correct.
- **Per-stage timeout via `Promise.race`.** Each stage has an independent timeout, and a timed-out stage records an error and lets the pipeline continue. The overall 55s guard prevents runaway execution.
- **Pipeline run ledger.** Recording every run (including skipped ones) in `pipeline_runs` with trigger type, correlation ID, timing, and error summary gives basic operational visibility.
- **Idempotent migrations.** All DDL uses `IF NOT EXISTS` / `DROP CONSTRAINT IF EXISTS` patterns, making `/api/migrate` safe to re-run.
- **Parameterized queries throughout.** All SQL uses tagged template literals with the Neon driver. No string interpolation. No injection risk.
- **Correlation IDs use `crypto.randomUUID()`.** Cryptographically random, not predictable.

---

## 2. Hidden Failure Modes Still Likely

### 2a. Dual-ingest race condition (CRITICAL)

`vercel.json` schedules both `/api/ingest` (daily 06:00 UTC) and `/api/pipeline/run` (every 5 minutes). Both call `ingestGNews()`. `/api/ingest` does **not** acquire the distributed pipeline lock. At 06:00, both routes fire concurrently:

- Both fetch from GNews (duplicate API quota burn).
- Both write to `intelligence_events` (duplicate rows unless UNIQUE constraint exists).
- `/api/ingest` fire-and-forgets separate `/api/snapshot` and `/api/signals` fetches, which race with the canonical pipeline's stages.

### 2b. Noop lock fallback silently disables concurrency control

`lock.ts:200-204`: If the `pipeline_locks` table doesn't exist and Redis isn't configured, every request returns `acquired: true, strategy: 'noop'`. All concurrent invocations proceed simultaneously. Only a `console.warn` is emitted.

### 2c. Dangling stage promises after timeout

`Promise.race` resolves the timeout but the underlying stage function continues running. No `AbortController` or cancellation signal exists. A slow `ingestGNews()` call continues consuming resources for the full duration, invisible to the pipeline result.

### 2d. Silent loss of run records

`pipeline_runs` INSERT/UPDATE wrapped in `try/catch` with empty catch blocks. If the DB is under load, runs complete but are never recorded. Health endpoint then reports stale data (false-positive alerts).

### 2e. Fire-and-forget fetches use attacker-controlled header for URL construction

`ingest/route.ts:45-47`: Base URL derived from `x-forwarded-host`. An attacker controlling this header redirects fire-and-forget calls to an arbitrary domain, leaking `CRON_SECRET` in the query string.

---

## 3. Weak Architectural Assumptions

| Assumption | Reality |
|---|---|
| "Only one cron fires at a time on Vercel" | Vercel does not guarantee sequential cron execution. Overlaps possible with 5-min schedule and 60s maxDuration. |
| maxDuration=60 works on current plan | Hobby plan hard-caps at 10s. Sum of default stage timeouts (30+10+15+5=60s) fills budget with zero headroom. |
| `revalidatePath()` works in route handlers | Unreliable in API routes in many Next.js deployment configs. Fallback to TTL expiry means up to 5-min stale cache. |
| Health endpoint can query all subsystems | No timeout guards on DB/Redis calls. If DB is slow, health endpoint itself times out — useless for diagnosing the problem. |

---

## 4. What Must Be Fixed Before Public Launch

| # | Issue | File(s) | Fix |
|---|---|---|---|
| **F1** | Dual-ingest race: `/api/ingest` cron bypasses distributed lock | `vercel.json:5-6` | Remove `/api/ingest` cron entry. Canonical route handles ingest. |
| **F2** | User-Agent spoofing bypasses auth | `pipeline/run/route.ts:87`, `ingest/route.ts:21` | Remove UA-based trust. Require `x-vercel-cron-secret` header. |
| **F3** | Missing CRON_SECRET = open endpoint | `pipeline/run/route.ts:84`, `ingest/route.ts:29` | Fail closed: `if (!expected) return process.env.NODE_ENV !== 'production'` |
| **F4** | CRON_SECRET leaked via spoofable x-forwarded-host | `ingest/route.ts:45-52` | Remove fire-and-forget fetches (redundant with canonical pipeline). |
| **F5** | Health endpoint leaks env vars, table names, errors unauthenticated | `health/route.ts:50-55` | Add auth gate or redact to `{ ok, status }` for public. |

---

## 5. What Can Wait Until After Launch

| # | Issue | Why deferrable |
|---|---|---|
| D1 | Noop lock fallback should return `acquired: false` | Acceptable if migration 005 applied before first cron |
| D2 | AbortController for timed-out stages | Performance, not correctness |
| D3 | Transaction wrapping for `/api/migrate` | Idempotent DDL compensates |
| D4 | N+1 queries in `generateHomepageStats()` | Fine at current scale |
| D5 | Pipeline run record persistence failures | Observability improvement |
| D6 | maxDuration budget tightness (60s total, 55s guard) | Operational tuning |
| D7 | Lock ID uses `Math.random()` instead of `crypto` | Internal-only, never exposed |

---

## 6. Launch-Readiness Assessment

**Not ready.** Three classes of blocking problems:

1. **Security holes** — Two auth bypass paths (UA spoofing + missing-secret-means-open) expose write endpoints to unauthenticated attackers. Health endpoint leaks internals.
2. **Architectural contradiction** — Report claims single canonical pipeline, but `vercel.json` still schedules old `/api/ingest` cron outside the lock and ledger.
3. **Secret leakage** — Fire-and-forget in `/api/ingest` passes `CRON_SECRET` via URL to attacker-controlled host.

None require architectural rework. All are targeted fixes under 20 lines each.

---

## 7. Final Recommendation

**NO-GO. Fix F1–F5, then launch.**

Estimated effort: 2–4 hours for all five fixes:

- **F1** (5 min): Delete `/api/ingest` cron from `vercel.json`
- **F2** (10 min): Remove UA-based auth bypass in both route files
- **F3** (5 min): Fail closed when `CRON_SECRET` is unset in production
- **F4** (15 min): Remove fire-and-forget fetches from `/api/ingest`
- **F5** (20 min): Add auth to health endpoint or split into public/private tiers

After fixes verified and migration 005 confirmed applied — system is launch-ready.
