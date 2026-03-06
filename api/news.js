/**
 * /api/news — GNews proxy + future Supabase integration
 *
 * Environment variables required (set in Vercel dashboard):
 *   GNEWS_KEY   — your GNews.io API key (never exposed to client)
 *
 * Optional (Sprint 2 — Supabase):
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

export const config = { runtime: 'edge' };

const CACHE_TTL = 60 * 30; // 30 min cache

export default async function handler(req) {
  // CORS — allow only your domain in production
  const origin = req.headers.get('origin') || '';
  const allowed = ['https://omterminal.com', 'https://www.omterminal.com'];
  const corsOrigin = allowed.includes(origin) ? origin : allowed[0];

  // Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(corsOrigin),
    });
  }

  const key = process.env.GNEWS_KEY;
  if (!key) {
    return json({ error: 'API key not configured' }, 500, corsOrigin);
  }

  try {
    const { searchParams } = new URL(req.url);
    const q     = searchParams.get('q')    || 'artificial intelligence';
    const cat   = searchParams.get('cat')  || null;
    const max   = Math.min(parseInt(searchParams.get('max') || '20'), 20);

    // Build GNews query — narrow by category if requested
    const query = cat ? `${q} ${catKeywords(cat)}` : q;

    const gUrl = `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=en&sortby=publishedAt&max=${max}&apikey=${key}`;
    const gRes = await fetch(gUrl);

    if (!gRes.ok) {
      const err = await gRes.text();
      console.error('GNews error:', err);
      return json({ error: 'Upstream error', articles: [] }, 502, corsOrigin);
    }

    const data = await gRes.json();
    const articles = (data.articles || []).map(normalise);

    return json({ articles, total: data.totalArticles || articles.length }, 200, corsOrigin, CACHE_TTL);
  } catch (err) {
    console.error('news handler:', err);
    return json({ error: 'Internal error', articles: [] }, 500, corsOrigin);
  }
}

/* ── Normalise GNews article to our schema ── */
function normalise(a) {
  return {
    title:       a.title       || '',
    body:        a.description || '',
    full:        a.content     || a.description || '',
    source:      a.source?.name || 'News',
    sourceUrl:   a.url         || '#',
    publishedAt: a.publishedAt || new Date().toISOString(),
    image:       a.image       || null,
    cat:         detectCat(a.title + ' ' + (a.description || '')),
    verified:    false,
    _live:       true,
  };
}

/* ── Category detection (mirrors client-side logic) ── */
function detectCat(t) {
  if (/fund|billion|invest|rais/i.test(t))          return 'funding';
  if (/regulat|law|bill|govern|policy|act\b/i.test(t)) return 'regulation';
  if (/agent|autonom|workflow/i.test(t))             return 'agents';
  if (/model|gpt|claude|gemini|llm|mistral/i.test(t)) return 'models';
  if (/research|paper|benchmark|study/i.test(t))    return 'research';
  return 'product';
}

/* ── Extra keywords to narrow GNews query by category ── */
function catKeywords(cat) {
  const map = {
    regulation: 'regulation law policy',
    funding:    'funding investment billion',
    models:     'model GPT Claude Gemini LLM',
    agents:     'AI agent autonomous',
    research:   'AI research paper benchmark',
    product:    'AI product launch',
  };
  return map[cat] || '';
}

/* ── Helpers ── */
function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(body, status = 200, origin = '*', ttl = 0) {
  const headers = {
    'Content-Type': 'application/json',
    ...corsHeaders(origin),
  };
  if (ttl > 0) {
    headers['Cache-Control'] = `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 2}`;
  }
  return new Response(JSON.stringify(body), { status, headers });
}
