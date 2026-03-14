# Omterminal — What to Check After Deploy

> A quick reference for founders/operators after every production deployment.
> No terminal required for most checks — browser and Vercel dashboard only.
> Last updated: 2026-03-14.

---

## Immediate Checks (First 5 Minutes)

### 1. Does the site load?

Visit `https://omterminal.com` in your browser.
- Page loads with the intelligence feed → **Good**
- Blank page or error → Check Vercel deployment logs

### 2. Is the database connected?

Visit `https://omterminal.com/api/health`
- Shows `"status": "healthy"` → **Good**
- Shows `"status": "degraded"` or `"failing"` → Check `DATABASE_URL` in Vercel env vars

### 3. Did migrations run?

If this deploy included database changes, run migrations:
```
https://omterminal.com/api/migrate?key=YOUR_ADMIN_SECRET
```
- Returns a success response → **Good**
- Returns 401 → Check your `ADMIN_SECRET` value

### 4. Are cron jobs configured?

In the Vercel dashboard → your project → **Cron Jobs**:
- You should see 3 scheduled jobs:
  - Pipeline (hourly)
  - Intelligence (every 2 hours)
  - Daily digest (7:00 UTC)
- If no crons appear, check that `vercel.json` is deployed and `CRON_SECRET` is set

---

## Within the First Hour

### 5. Does search work?

Open `Cmd+K` (or `Ctrl+K`) and type any term.
- Results appear → **Good**
- "No results" for everything → Pipeline may not have run yet; wait for first cron

### 6. Does the command palette navigate?

Click on any search result from `Cmd+K`.
- Navigates to the correct page → **Good**

### 7. Do watchlists persist?

Click the watchlist/bookmark button on any entity page, then refresh.
- Entity stays in watchlist → **Good**
- Disappears → Check that `DATABASE_URL` is correct and migrations have run

### 8. Is the subscription flow working?

Open the alert panel (bell icon) → find the Email Digest card → enter an email.
- Shows success → **Good**
- Shows error → Check browser console for details

---

## Within the First Day

### 9. Are emails sending?

After the 7:00 UTC cron runs, check:
- Your inbox for a digest email (if you subscribed)
- Or run a dry-run check:
  ```
  curl "https://omterminal.com/api/alerts/send-digest?secret=YOUR_CRON_SECRET&dry_run=true"
  ```
- Shows subscriber previews → **Good**
- Shows `RESEND_KEY not configured` → Set `RESEND_KEY` in Vercel env vars

### 10. Are alerts visible?

Open the alert panel (bell icon).
- Shows recent platform and/or personal alerts → **Good**
- Empty after 24 hours → Pipeline may not be generating alerts; check cron logs

### 11. Are signals being generated?

Visit `https://omterminal.com/signals`
- Shows recent signals with timestamps from today → **Good**
- All signals are old or empty → Check pipeline cron logs in Vercel

---

## Troubleshooting Quick Reference

| Symptom | Likely Cause | Fix |
|---|---|---|
| Site won't load | Build failed | Check Vercel deployment logs |
| "failing" health status | `DATABASE_URL` wrong or DB down | Check Neon dashboard + Vercel env vars |
| No cron jobs visible | `CRON_SECRET` not set or `vercel.json` not deployed | Set `CRON_SECRET` in Vercel; verify `vercel.json` exists in repo |
| No signals after 2+ hours | Pipeline failing silently | Check cron execution logs in Vercel; ensure `GNEWS_API_KEY` is set |
| No digest emails | `RESEND_KEY` not set | Set `RESEND_KEY` in Vercel; verify sender domain in Resend dashboard |
| Watchlist doesn't persist | Migrations haven't run | Run `/api/migrate?key=ADMIN_SECRET` |
| Command palette empty | No data ingested yet | Wait for first pipeline cron run |

---

## When NOT to Worry

- **"No signals" on a brand new deploy** — The pipeline runs hourly. Give it 1-2 hours to populate data.
- **"0 subscribers" in digest dry-run** — Nobody has subscribed yet. That's expected on a fresh deploy.
- **Optional env var warnings in health check** — Redis, secondary LLM keys, etc. are nice-to-have but not required.
