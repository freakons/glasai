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
| `GET /api/digest` | Sends weekly intelligence digest (cron: Fridays 09:00 UTC) |

---

## Environment Variables

Add in **Vercel → Settings → Environment Variables**:

```
GNEWS_KEY          GNews.io API key
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
GNEWS_KEY=your_key
RESEND_KEY=your_key
RESEND_AUDIENCE=your_audience_id
CRON_SECRET=any_random_string
DIGEST_FROM=OM Terminal <digest@omterminal.com>
```

---

## Deployment

Push to `main` → Vercel auto-deploys via GitHub.
Dev work on `claude/` prefixed branches → merge via PR.
