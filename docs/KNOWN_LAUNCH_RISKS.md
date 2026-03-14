# Omterminal — Known Launch Risks

> Items identified during the launch readiness pass that are documented
> rather than fixed, to avoid expanding scope before launch.
> Last updated: 2026-03-14.

---

## Low Risk — Acceptable for Launch

### 1. No rate limiting on public endpoints
**Endpoints:** `/api/search`, `/api/subscribe`, `/api/watchlist/signals`
**Impact:** Could be abused to enumerate data or spam the Resend API.
**Mitigation:** Vercel's built-in DDoS protection provides baseline coverage. Add rate limiting post-launch if abuse is observed.

### 2. `/api/migrate` accepts ADMIN_SECRET via query param
**Impact:** Secret appears in URL, visible in server logs and browser history.
**Mitigation:** Only used by the operator during deploys. Consider moving to header-based auth post-launch.

### 3. Alert PATCH endpoint lacks ownership verification
**Endpoint:** `PATCH /api/alerts`
**Impact:** A user could theoretically mark another user's alerts as read (requires knowing the alert ID).
**Mitigation:** Alert IDs are UUIDs — not enumerable. Low practical risk.

### 4. Digest dedup uses calendar date (UTC), not 24-hour window
**Impact:** If the cron schedule shifts or is manually re-triggered near midnight UTC, edge-case double-sends are theoretically possible.
**Mitigation:** Cron runs at 7:00 UTC — well away from midnight. Acceptable.

### 5. Subscribe endpoint always returns 200
**Endpoint:** `POST /api/subscribe`
**Impact:** Client can't tell if the subscription actually saved when Resend is down.
**Mitigation:** Acceptable UX tradeoff — avoids exposing internal failures to end users.

---

## Medium Risk — Address Post-Launch

### 6. GNews API free-tier rate limit
**Impact:** The pipeline runs 10 queries per invocation. GNews free tier allows 100 requests/day. At hourly cron (24 runs/day × 10 queries = 240), the quota depletes within hours. After depletion, ingestion silently returns 0 articles.
**Mitigation:** The 50 RSS sources in `src/config/sources.ts` provide a fallback ingestion path. Monitor GNews usage and consider upgrading the plan or reducing `GNEWS_MAX_QUERIES` if signal generation is sparse.

### 7. Homepage stats are hardcoded fallbacks
**File:** `src/config/site.ts`
**Impact:** Homepage shows `47 signals, 18 companies, 7 regulations` even when the database is empty. This masks ingestion failures.
**Mitigation:** Acceptable for launch optics. Replace with live queries once ingestion is stable.

### 8. No automated test suite
**Impact:** Regressions can only be caught via TypeScript type checking and manual testing.
**Recommendation:** Add integration tests for critical paths (digest, pipeline, watchlist) after launch stabilization.

### 9. Single TypeScript error in test file
**File:** `src/db/__tests__/consistencyChecks.test.ts:293`
**Error:** Type comparison mismatch (`"ok"` vs `"started"`).
**Impact:** Pre-existing; does not affect runtime behavior.

### 10. ESLint config doesn't cover plain JS files
**Impact:** `scripts/deployment-check.js` is not linted. Minimal risk since it's a simple validation script.

---

## Out of Scope — Intentionally Deferred

- **User authentication system** — App uses cookie-based UIDs, not full auth. Acceptable for initial launch.
- **Redis requirement** — Redis is optional; app degrades gracefully to in-memory/CDN caching.
- **Multi-timezone digest scheduling** — Digests send at 7:00 UTC for all users. Timezone-aware scheduling is a post-launch feature.
- **Email verification** — Email regex validation only; no verification email sent. Acceptable for early users.
- **Premium intelligence mode** — Significance scoring is designed (`docs/signal-significance-architecture.md`) but not implemented. Standard mode works; Premium equals Standard with a higher confidence threshold.
- **`signal_entities` join table** — Referenced by `alertEngine.ts` but not created in migrations. Alert engine falls back gracefully. Needed for entity-level velocity alerts post-launch.
