# Omterminal — Solo-Founder Workflow Guide

> **Audience:** Future AI agents (Claude Code) and the human founder.
> Keep this document accurate. Update it when the workflow changes.

---

## The Core Model (Permanent)

Omterminal runs on a strict, simple split:

| Concern | Tool | Branches |
|---|---|---|
| Code work | GitHub | `main` + `claude/<task>-<id>` |
| Database | Neon PostgreSQL | `production` + `vercel-dev` |
| Hosting | Vercel | Production deploy + Preview deploys |

**There are exactly two Neon branches, always.**

---

## GitHub Branches

### Purpose
GitHub branches are for **code changes only**. They represent a unit of work — one task, one PR, one merge.

### Naming convention
All working branches follow: `claude/<short-description>-<sessionId>`

Examples:
- `claude/fix-signal-flow-TaB4X`
- `claude/add-digest-auth-XkJ2R`
- `claude/harden-solo-workflow-FDyxE`

### Rules
1. One task per branch.
2. One mission per Claude Code prompt session — do not mix unrelated fixes in a single branch.
3. Merge to `main` after verification (typecheck + build pass, functionality checked).
4. Delete the branch after merging. Old branches are noise.
5. Never develop directly on `main`.

### When to merge to `main`
- Build and typecheck pass.
- The feature or fix does what it was supposed to do.
- No regressions introduced.

### When NOT to merge
- Build is broken.
- Typecheck fails.
- The change is mid-task (incomplete).
- You are unsure of the impact on production.

---

## Neon Branches

### The permanent rule: only two branches

| Neon Branch | Purpose | Used By |
|---|---|---|
| `production` | Live database for omterminal.com users | Vercel Production environment |
| `vercel-dev` | Shared dev/preview database | Vercel Preview and Development environments |

**This is it. No other Neon branches should exist permanently.**

### Why only two branches?

Neon supports database branching (like Git for your DB schema). Some teams create a new Neon branch per Vercel preview deployment. **Omterminal does not do this**, because:

1. As a solo project, there is no team reviewing multiple parallel previews against isolated databases.
2. Automatic per-preview DB branches accumulate silently and consume Neon free-tier compute.
3. Preview deploys are used for UI/code review only — they do not need schema isolation.
4. A shared `vercel-dev` branch is simpler, cheaper, and sufficient for this operating model.

### What each Neon branch contains

- **`production`** — The real data. Articles, signals, entities, funding rounds, regulations. Treat this as sacred.
- **`vercel-dev`** — Development/staging data. Can be reset. Used for testing pipeline changes and migrations before they touch production.

### When to use each Neon branch

| Situation | Neon Branch |
|---|---|
| Production deploy (main branch, omterminal.com) | `production` |
| Local development (`vercel dev`, `.env.local`) | `vercel-dev` |
| Vercel preview deploy (any `claude/` branch PR) | `vercel-dev` |
| Testing a new migration before applying to production | `vercel-dev` |
| Applying a migration to production | `production` |

---

## Vercel Environments

Vercel has three environment types. Each gets its own set of environment variables.

| Vercel Environment | Triggered by | Neon Branch to Use |
|---|---|---|
| **Production** | Push to `main` | `production` |
| **Preview** | Push to any other branch | `vercel-dev` |
| **Development** | `vercel dev` locally | `vercel-dev` |

### DATABASE_URL in Vercel

- **Production** environment → set `DATABASE_URL` to the Neon `production` branch connection string.
- **Preview** environment → set `DATABASE_URL` to the Neon `vercel-dev` branch connection string.
- **Development** environment → set `DATABASE_URL` to the Neon `vercel-dev` branch connection string.

The app code (`src/db/client.ts`) reads only `DATABASE_URL`. It does not branch-select, does not query Neon's API, and does not create branches. Vercel's environment scoping handles the routing.

---

## How Claude Code Should Be Used

### One task, one branch, one prompt mission

Each Claude Code session should have a single clear goal. Examples of good sessions:
- "Fix the signal pipeline rate-limit issue"
- "Add CRON_SECRET validation to the ingest endpoint"
- "Harden the solo-founder workflow documentation"

Examples of bad (mixed) sessions:
- "Fix the pipeline AND redesign the homepage AND add a new API route"

When scope creep appears mid-session, stop and open a new branch for the new concern.

### Session flow for Claude Code

```
1. Create branch:  claude/<task>-<sessionId>
2. Do the work
3. Run typecheck:  npm run typecheck
4. Run build:      npm run build
5. Commit + push
6. Open PR → verify on preview URL
7. Merge to main → production deploys automatically
8. Delete the branch
```

### What Claude Code should not do

- Push directly to `main`.
- Create new Neon branches via the Neon API.
- Rotate or delete production secrets.
- Modify the Vercel↔Neon dashboard integration.
- Claim to have done dashboard actions it cannot perform in the repo.

---

## Environment Variable Reference

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes (production) | Neon connection string — scoped per Vercel environment |
| `CRON_SECRET` | Yes (production) | Authorizes cron job invocations |
| `ADMIN_SECRET` | Yes (production) | Admin endpoint key |
| `GNEWS_API_KEY` | Yes (production) | News ingestion |
| `NEXT_PUBLIC_APP_URL` | Recommended | Set to `https://omterminal.com` in production to ensure internal fetch calls use the canonical domain |
| `UPSTASH_REDIS_REST_URL` | Optional | Cache layer |
| `UPSTASH_REDIS_REST_TOKEN` | Optional | Cache layer |
| `GROQ_API_KEY` | Optional | LLM inference |
| `RESEND_KEY` | Optional | Email digest |

`DATABASE_URL` does NOT use branch-per-environment suffixes or auto-naming. The correct connection string for each environment is set manually in Vercel → Settings → Environment Variables.

---

## Things That Are Intentionally NOT In This Repo

- **GitHub Actions** — Vercel handles CI/CD automatically via its GitHub integration.
- **Neon branch creation scripts** — Branches are managed manually in the Neon dashboard.
- **Per-preview DB seeding** — Previews share `vercel-dev` and do not need fresh seeds.
- **`DATABASE_URL_UNPOOLED`** — Not needed; the app uses Neon's pooled HTTP driver (`@neondatabase/serverless`).

---

## Database Migration Workflow

1. Write the migration SQL in `db/migrations/00N_description.sql`.
2. Test it on `vercel-dev` by calling `/api/migrate?key=<ADMIN_SECRET>` on a preview deploy.
3. Verify the schema change works correctly on preview.
4. Merge the code change to `main`.
5. After production deploy, call `/api/migrate?key=<ADMIN_SECRET>` on the production URL to apply to the `production` Neon branch.

Never apply a migration to `production` without verifying it on `vercel-dev` first.

---

## Quick Reference

```
GitHub branch created?  →  Use vercel-dev Neon branch (auto via Vercel Preview env)
Merged to main?         →  Use production Neon branch (auto via Vercel Production env)
Local dev?              →  Use vercel-dev Neon branch (set in .env.local)
New Neon branch?        →  Only if explicitly needed for schema experiments (delete after)
Auto preview Neon?      →  NO. This integration is disabled.
```

---

*Last updated: 2026-03-12 — permanent solo-founder workflow hardening pass.*
