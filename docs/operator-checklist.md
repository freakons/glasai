# Omterminal — Manual Operator Checklist
## Completing the Permanent Solo-Founder Setup

> This checklist covers the dashboard actions that cannot be done from the repo.
> Follow these steps once to complete the permanent Neon + Vercel configuration.
> Simple enough to follow from a phone.

---

## Before You Start

Make sure you have access to:
- [ ] Vercel dashboard (vercel.com → your Omterminal project)
- [ ] Neon dashboard (console.neon.tech → your Omterminal project)

---

## Step 1 — Verify Vercel Environment Variables

In **Vercel → Settings → Environment Variables**, confirm all three rows exist for `DATABASE_URL`:

| Variable | Environment | Value Should Point To |
|---|---|---|
| `DATABASE_URL` | Production | Neon `production` branch connection string |
| `DATABASE_URL` | Preview | Neon `vercel-dev` branch connection string |
| `DATABASE_URL` | Development | Neon `vercel-dev` branch connection string |

Also confirm these are set (at minimum for Production):
- [ ] `CRON_SECRET` — any random secret string
- [ ] `ADMIN_SECRET` — your admin key
- [ ] `GNEWS_API_KEY` — your GNews API key
- [ ] `NEXT_PUBLIC_APP_URL` — set to `https://omterminal.com` (Production environment only)

If any are missing or wrong, update them now.

---

## Step 2 — Remove the Neon ↔ Vercel Automatic Preview Branch Integration

> This step disconnects the integration that creates a new Neon database branch
> for every Vercel preview deploy. After this, all preview deploys use
> the shared `vercel-dev` Neon branch via the `DATABASE_URL` you set in Step 1.

**In Vercel:**

1. Go to **Settings → Integrations**
2. Find the **Neon** integration
3. Click **Manage** or **Configure**
4. Look for a toggle or setting called:
   - "Create database branch for each preview deployment"
   - or "Preview branch" / "Branch per preview"
5. **Turn it OFF** (disable it)
6. Save

If you see no such toggle, the integration may not have that feature enabled — that is fine, proceed to Step 3.

If you cannot find a Neon integration in Vercel at all, skip this step — the automatic branching was never active.

---

## Step 3 — Verify Neon Has Only Two Branches

In **Neon → your project → Branches**:

You should see exactly two branches:
- `production` (or `main`) — the live database
- `vercel-dev` — the shared dev/preview database

If you see any other branches (typically named like `preview/pr-123` or `br-...`), those are stale auto-created preview branches.

**To delete a stale preview branch:**
1. Click the branch name
2. Click the **three-dot menu** (⋯) or **Delete** button
3. Confirm deletion

Delete all preview branches except `production` and `vercel-dev`.

> **Important:** Before deleting, visually confirm the branch name. Never delete `production` or `vercel-dev`.

---

## Step 4 — Redeploy Once

After removing the Neon integration's preview branching, trigger a fresh deployment to verify everything works.

**In Vercel:**
1. Go to **Deployments**
2. Find the latest Production deployment
3. Click the **three-dot menu** → **Redeploy**
4. Confirm

Wait for the deployment to finish (usually 1–2 minutes).

---

## Step 5 — Verify the App Works

After the redeploy, check:

1. **Homepage loads** — visit `https://omterminal.com`
2. **Health check passes** — visit `https://omterminal.com/api/health`
   - Should return `{ "ok": true }` or similar
   - Should not return a database error
3. **Signals endpoint works** — visit `https://omterminal.com/api/signals`
   - Should return JSON (even if empty `[]`)

If everything loads cleanly, you are done.

---

## If Something Breaks After This

Most likely cause: `DATABASE_URL` for Preview or Production environment is wrong or missing.

Fix:
1. Go to Vercel → Settings → Environment Variables
2. Check `DATABASE_URL` for the affected environment
3. Get the correct connection string from Neon → your branch → Connection Details
4. Update the variable and redeploy

---

## What You Do NOT Need to Do

- Do NOT rotate `DATABASE_URL` or any secrets (unless you believe they are compromised).
- Do NOT delete the `production` Neon branch.
- Do NOT delete the `vercel-dev` Neon branch.
- Do NOT disconnect the Vercel ↔ GitHub integration (that's what auto-deploys your code).
- Do NOT touch any GitHub branch settings.

---

## Summary

```
Vercel env vars correct?     ✓  (Step 1)
Neon auto-branch OFF?        ✓  (Step 2)
Only 2 Neon branches left?   ✓  (Step 3)
Redeployed and verified?     ✓  (Steps 4–5)
```

That's it. The permanent solo-founder setup is complete.

---

*Last updated: 2026-03-12 — permanent solo-founder workflow hardening pass.*
