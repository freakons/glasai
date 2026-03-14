# OM Terminal — Infrastructure Architecture
## Target: 250,000 users/week

---

## Architecture Overview

```
                        ┌─────────────────────────────────┐
                        │         omterminal.com           │
                        │         (Cloudflare DNS)         │
                        └──────────────┬──────────────────┘
                                       │
                        ┌──────────────▼──────────────────┐
                        │      Cloudflare (Layer 1)        │
                        │  DDoS protection · WAF · CDN     │
                        │  Rate limiting · Bot management  │
                        └──────────────┬──────────────────┘
                                       │
                        ┌──────────────▼──────────────────┐
                        │         Vercel (Layer 2)         │
                        │  Edge Network · 100+ PoPs        │
                        │  Static HTML  · Edge Functions   │
                        │  Cron jobs    · Auto-scaling     │
                        └──────┬───────────────┬──────────┘
                               │               │
              ┌────────────────▼──┐     ┌──────▼─────────────────┐
              │  Upstash Redis    │     │   Neon PostgreSQL       │
              │  (Cache Layer)    │     │   (Primary Database)    │
              │  30min TTL news   │     │   Articles · Users      │
              │  Session tokens   │     │   Alerts · Audit log    │
              └───────────────────┘     └──────┬─────────────────┘
                                               │
                                  ┌────────────▼──────────┐
                                  │  Meilisearch (Search) │
                                  │  Full-text article    │
                                  │  search index         │
                                  └───────────────────────┘
```

---

## Layer 1 — Cloudflare

**Role:** Security, CDN, DNS, DDoS protection

| Feature | Config |
|---|---|
| DNS | A record → Vercel IP, proxied (orange cloud ON) |
| SSL | Full (strict) — Cloudflare ↔ Vercel TLS |
| WAF | OWASP ruleset enabled, custom rule: block >100 req/min per IP |
| Rate limiting | `/api/*` → 60 req/min per IP (free plan supports this) |
| Cache | Static assets (HTML, fonts) cached at edge for 1hr |
| Bot Fight Mode | ON — blocks scrapers hitting news endpoints |

**Why Cloudflare:** Free tier covers everything needed. Edge network absorbs traffic spikes before they reach Vercel. Acts as a firewall layer in addition to DNS.

---

## Layer 2 — Vercel

**Role:** Hosting, Edge Functions, Cron

| Resource | Detail |
|---|---|
| Plan | Pro ($20/month) — needed for cron jobs + higher limits |
| Edge Functions | `/api/news`, `/api/subscribe`, `/api/alerts/send-digest` |
| Regions | Auto — Vercel deploys to closest region per user |
| Cron | Digest: `0 7 * * *` (daily 07:00 UTC) |
| Bandwidth | ~400GB/month at 250K users — within Pro limits |

**Traffic capacity:** Vercel auto-scales. At 250K users/week (~36K/day, ~1,500/hr peak), no concurrency issues. Edge Functions are serverless — each request is independent.

---

## Layer 3 — Upstash Redis (Cache)

**Role:** Cache news API responses, rate-limit counters, future session tokens

**Free tier:** 10,000 commands/day — sufficient for caching. Paid at $0.2/100K commands.

```
Cache keys:
  news:ai:latest        → 30min TTL   (GNews API response)
  news:ai:{category}    → 30min TTL   (category-filtered responses)
  rate:{ip}             → 60s TTL     (rate limit counters)
  session:{token}       → 24hr TTL    (Sprint 3: auth sessions)
```

**Why Upstash:** Serverless Redis — works natively with Vercel Edge Functions. Per-request pricing, no idle cost.

---

## Layer 4 — Neon PostgreSQL (Database)

**Role:** Persistent storage for articles, users, alerts, audit log

**Free tier:** 0.5GB storage, 1 compute unit — sufficient for MVP.

### Branch Policy (Permanent)

Omterminal uses exactly **two** Neon branches:

| Branch | Purpose |
|---|---|
| `production` | Live data — used by Vercel Production environment |
| `vercel-dev` | Dev/staging data — used by Vercel Preview and Development environments |

Automatic per-preview Neon branch creation is **disabled**. All preview deployments share the `vercel-dev` branch via the `DATABASE_URL` set in Vercel's Preview environment scope. No per-PR database isolation is needed for this solo-founder project.

The app reads only `DATABASE_URL`. It does not create or select Neon branches at runtime.

### Schema

```sql
-- Articles (ingested from GNews + manual)
CREATE TABLE articles (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  body        TEXT,
  full        TEXT,
  category    VARCHAR(20),
  source      VARCHAR(100),
  source_url  TEXT,
  published_at TIMESTAMPTZ,
  verified    BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_articles_category ON articles(category);
CREATE INDEX idx_articles_published ON articles(published_at DESC);

-- Users (Sprint 3)
CREATE TABLE users (
  id          SERIAL PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  plan        VARCHAR(20) DEFAULT 'free',  -- free | pro
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  last_seen   TIMESTAMPTZ
);

-- Alert subscriptions (Sprint 3)
CREATE TABLE alert_rules (
  id          SERIAL PRIMARY KEY,
  user_id     INT REFERENCES users(id) ON DELETE CASCADE,
  topic       VARCHAR(50),   -- 'eu-ai-act', 'llm-regulation', etc.
  active      BOOLEAN DEFAULT true
);

-- Audit log
CREATE TABLE events (
  id          SERIAL PRIMARY KEY,
  type        VARCHAR(50),   -- 'subscribe', 'view', 'search'
  data        JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Layer 5 — Meilisearch (Search)

**Role:** Full-text search across all articles

**Hosted option:** Meilisearch Cloud — free tier 100K documents.

```
Index: articles
Searchable fields: title, body, source
Filterable fields: category, verified, published_at
Sortable: published_at
```

API call from `/api/search`: POST to Meilisearch with query, return ranked results.

---

## Domain Migration — glasai.vercel.app → omterminal.com

### Step 1 — Add domain to Vercel
1. Vercel dashboard → glasai project → **Settings → Domains**
2. Click **Add Domain** → type `omterminal.com` → Add
3. Also add `www.omterminal.com`
4. Vercel shows you DNS records to set — copy them

### Step 2 — Configure Cloudflare DNS
1. Cloudflare dashboard → omterminal.com → **DNS → Records**
2. Add the records Vercel gave you:

```
Type    Name    Value                           Proxy
A       @       76.76.21.21                     ON (orange cloud)
CNAME   www     cname.vercel-dns.com            ON (orange cloud)
```

3. Set SSL/TLS mode to **Full (strict)**

### Step 3 — Verify in Vercel
- Vercel will show a green checkmark when DNS propagates (usually 5–30 min)
- Test: `https://omterminal.com` should load the terminal

### Step 4 — Redirect old Vercel URL
Add to `vercel.json`:
```json
"redirects": [
  {
    "source": "/(.*)",
    "destination": "https://omterminal.com/$1",
    "permanent": true
  }
]
```
Deploy this on a separate Vercel project pointing to `glasai.vercel.app` — or just let the old URL 404 since it's not indexed.

---

## Traffic Spike Handling — 250K Users/Week

### How it works

```
Peak load: ~5,000 concurrent users (estimated)

Cloudflare CDN:
  → Serves cached HTML + static assets from 300+ edge nodes
  → 90%+ of requests never reach Vercel

Vercel Edge Functions:
  → Stateless — horizontal scaling is automatic
  → Each function invocation is independent
  → No cold starts on Edge Runtime

Upstash Redis:
  → News API cached 30min → GNews called ~48x/day max
  → Stays within free tier (100 req/day GNews limit easily managed)

Neon PostgreSQL:
  → Connection pooling built-in (PgBouncer)
  → Read replicas available if needed (Scale tier)
```

### Traffic Breakdown at 250K/week

| Request Type | Volume | Served By |
|---|---|---|
| Page loads (HTML) | ~250K/week | Cloudflare cache |
| `/api/news` requests | ~50K/week | Upstash cache (30min TTL) |
| `/api/subscribe` | ~1K/week | Vercel → Resend |
| `/api/alerts/send-digest` | 1/day | Vercel cron |
| DB queries | ~10K/week | Neon (within free tier) |

**Bottleneck analysis:** GNews free tier (100 req/day) is the real limit. At 30min cache TTL, we make max 48 calls/day to GNews — well within limits even at 250K users.

---

## Scaling Roadmap

| Users/Week | Action | Cost |
|---|---|---|
| 0–50K | Current stack (Vercel Hobby + free tiers) | ~$0/month |
| 50K–250K | Vercel Pro + Cloudflare Pro | ~$40/month |
| 250K–1M | Neon Scale, Upstash Pay-as-you-go, Meilisearch Cloud | ~$100/month |
| 1M+ | Dedicated DB, Redis cluster, CDN optimization | ~$500/month |

Revenue at 250K users: If 1% convert to Pro at $19/month = **$47,500 MRR**.
Infrastructure at that scale: ~$100/month. **Margin: 99.8%.**
