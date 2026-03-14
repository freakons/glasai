# OM Terminal — AI Intelligence Terminal

> Stop reading AI news. Start seeing the board.

A professional-grade AI intelligence terminal tracking regulation, model releases, funding, and global policy — structured and verified for decision-makers.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Single-page HTML/CSS/JS (glassmorphic dark UI) |
| Hosting | Vercel |
| Domain | omterminal.com (Cloudflare DNS) |
| News API | GNews.io (proxied via Edge Function) |
| Email | Resend |
| Database | Neon PostgreSQL *(Sprint 3)* |
| Cache | Upstash Redis *(Sprint 3)* |
| Search | Meilisearch *(Sprint 3)* |

---

## API Routes

| Route | Purpose |
|---|---|
| `GET /api/news` | Proxies GNews API server-side — key never in client |
| `POST /api/subscribe` | Adds email to Resend audience |
| `GET /api/alerts/send-digest` | Sends daily intelligence digest (cron: 07:00 UTC daily) |

---

## Environment Variables

Add in **Vercel → Settings → Environment Variables**:

```
GNEWS_API_KEY          GNews.io API key
RESEND_KEY         Resend.com API key
RESEND_AUDIENCE    Resend audience ID
CRON_SECRET        Random string to protect manual digest trigger
DIGEST_FROM        "OM Terminal <digest@omterminal.com>"
```

---

## Local Development

```bash
npm i -g vercel
vercel dev
```

Create `.env.local`:
```
GNEWS_API_KEY=your_key
RESEND_KEY=your_key
RESEND_AUDIENCE=your_audience_id
CRON_SECRET=any_random_string
DIGEST_FROM=OM Terminal <digest@omterminal.com>
```

---

## Deployment

Push to `main` → Vercel auto-deploys via GitHub.
Dev work on `claude/` prefixed branches → merge via PR.

---

## Database — Neon Branch Policy

Omterminal uses exactly **two** Neon branches, permanently:

| Neon Branch | Used By |
|---|---|
| `production` | Vercel Production (main → omterminal.com) |
| `vercel-dev` | Vercel Preview + Development (all other deploys) |

**Automatic per-preview Neon branch creation is disabled.**
Preview deploys share the `vercel-dev` branch. No per-PR database isolation is needed for this solo project.

`DATABASE_URL` in Vercel is set per environment scope:
- Production → Neon `production` connection string
- Preview → Neon `vercel-dev` connection string
- Development → Neon `vercel-dev` connection string

See [`docs/workflow.md`](docs/workflow.md) for the full workflow guide.
See [`docs/operator-checklist.md`](docs/operator-checklist.md) for the one-time dashboard setup steps.
