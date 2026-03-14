# Omterminal — Launch Test Runbook

> A step-by-step manual test checklist for verifying every launch-critical flow.
> Follow this before launch and after any significant deploy.
> Last updated: 2026-03-14.

---

## Prerequisites

- Production deployment is live
- You have the values of `CRON_SECRET` and `ADMIN_SECRET` from Vercel env vars
- You have access to the Vercel dashboard
- Base URL below: replace `$BASE` with your production URL (e.g. `https://omterminal.com`)

---

## A. Migrations

Verify the database schema is up to date.

```bash
# Run migrations (idempotent — safe to run multiple times)
curl "$BASE/api/migrate?key=$ADMIN_SECRET"
```

- [ ] Returns 200 with a list of tables/columns
- [ ] No SQL errors in the response

---

## B. Watchlist Add/Remove

1. Open `$BASE` in a browser
2. Navigate to any entity page (e.g. click a company name from the intelligence feed)
3. Click the watchlist button (bookmark/star icon)
   - [ ] Entity appears in your watchlist (`$BASE/watchlist`)
4. Click the watchlist button again to remove
   - [ ] Entity disappears from the watchlist page
5. Refresh the page
   - [ ] Watchlist state persists (server-side, tied to your cookie)

---

## C. Email Digest Subscription

1. Open the alert panel (bell icon in the top bar)
2. Find the "Email Digest" card
3. Enter your email address and enable the digest
   - [ ] Subscription saved (no error shown)
4. Verify via API:
   ```bash
   # Check subscription status (requires browser cookie — easiest to check in DevTools)
   # Network tab → GET /api/alerts/email-subscription → should show your email
   ```

---

## D. Personalized Alert Generation

1. Add at least one entity to your watchlist
2. Wait for the next pipeline run (hourly), or trigger manually:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" "$BASE/api/pipeline/run"
   ```
3. Open the alert panel (bell icon)
   - [ ] You see alerts related to your watched entities (if any new signals exist)
   - [ ] Platform-wide alerts also appear

---

## E. Digest Dry-Run

Preview what the daily digest would send without actually sending emails.

```bash
# Dry run for all subscribers
curl "$BASE/api/alerts/send-digest?secret=$CRON_SECRET&dry_run=true"
```

- [ ] Returns JSON with `ok: true` and `dryRun: true`
- [ ] Shows `previews` array with per-user alert counts and subject lines
- [ ] No emails were actually sent

---

## F. Single-User Digest Send

Test actual email delivery for one user before enabling for all.

```bash
# Find your user ID (check browser cookie "omterminal_uid" in DevTools)
# Then send a real digest to just yourself:
curl "$BASE/api/alerts/send-digest?secret=$CRON_SECRET&user_id=$YOUR_USER_ID"
```

- [ ] Returns JSON with `sent: 1` (or `skippedNoAlerts` if you have no recent alerts)
- [ ] Check your inbox — digest email arrived
- [ ] Email contains your personal alerts + platform alerts
- [ ] Links in the email point to the correct production URL

---

## G. Duplicate-Send Prevention

Run the same single-user send again (same day):

```bash
curl "$BASE/api/alerts/send-digest?secret=$CRON_SECRET&user_id=$YOUR_USER_ID"
```

- [ ] Returns `skippedAlreadySent: 1`
- [ ] No duplicate email received

---

## H. Command Palette Basic Navigation

1. Press `Cmd+K` (Mac) or `Ctrl+K` (Windows/Linux) anywhere on the site
   - [ ] Command palette opens
2. Type a company name (e.g. "OpenAI")
   - [ ] Search results appear in real time
3. Select a result
   - [ ] Navigates to the correct entity/signal/trend page
4. Open command palette again and type a command (e.g. "watchlist", "signals")
   - [ ] Action items appear and work when selected
5. Press `Escape`
   - [ ] Command palette closes

---

## I. Alert Panel Behavior

1. Click the bell icon in the top bar
   - [ ] Alert panel opens showing recent alerts
2. Check that alerts show:
   - [ ] Platform alerts (visible to all users)
   - [ ] Personal alerts (related to your watched entities)
3. Click "mark as read" on an alert
   - [ ] Alert visual state updates
   - [ ] Unread count in the bell badge decreases
4. Close and reopen the panel
   - [ ] Read/unread state persists

---

## J. Health Checks

```bash
# Basic health (public)
curl "$BASE/api/health"
# Should return: {"status": "healthy", "ok": true, ...}

# Full diagnostics (admin)
curl -H "x-admin-secret: $ADMIN_SECRET" "$BASE/api/health"
# Should return detailed subsystem grades
```

- [ ] Public health returns `ok: true`
- [ ] Admin health shows all subsystems graded
- [ ] No subsystem shows `failing` grade

---

## K. Search API

```bash
curl "$BASE/api/search?q=openai"
```

- [ ] Returns JSON with grouped results (entities, signals, trends, events, actions)
- [ ] Results are relevant to the query

---

## L. Cron Verification

In Vercel dashboard → Cron Jobs:
- [ ] `/api/pipeline/run` — every hour (`0 * * * *`)
- [ ] `/api/intelligence/run` — every 2 hours (`0 */2 * * *`)
- [ ] `/api/alerts/send-digest` — daily 7:00 UTC (`0 7 * * *`)
- [ ] All three crons show recent successful executions (after first day)

---

## Quick Smoke Test (5 minutes)

If you're short on time, do just these:

1. `curl $BASE/api/health` → `ok: true`
2. Load `$BASE` in browser → page renders
3. `Cmd+K` → search works
4. Click an entity → entity page loads
5. Click watchlist button → persists on refresh
6. `curl "$BASE/api/alerts/send-digest?secret=$CRON_SECRET&dry_run=true"` → `ok: true`

If all six pass, the core platform is operational.
