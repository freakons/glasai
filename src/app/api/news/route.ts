import { NextRequest, NextResponse } from 'next/server';
import { detectCategory } from '@/utils';
import { cacheConfig } from '@/config/cache';

export const runtime = 'edge';

const ALLOWED_ORIGINS = ['https://omterminal.com', 'https://www.omterminal.com'];

function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function getCorsOrigin(req: NextRequest): string {
  const origin = req.headers.get('origin') || '';
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(getCorsOrigin(req)) });
}

export async function GET(req: NextRequest) {
  const corsOrigin = getCorsOrigin(req);
  const key = process.env.GNEWS_API_KEY;

  if (!key) {
    return NextResponse.json(
      { error: 'API key not configured' },
      { status: 500, headers: corsHeaders(corsOrigin) }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') || 'artificial intelligence';
    const cat = searchParams.get('cat') || null;
    const max = Math.min(parseInt(searchParams.get('max') || '20'), 20);

    const catKeywords: Record<string, string> = {
      regulation: 'regulation law policy',
      funding: 'funding investment billion',
      models: 'model GPT Claude Gemini LLM',
      agents: 'AI agent autonomous',
      research: 'AI research paper benchmark',
      product: 'AI product launch',
    };

    const query = cat ? `${q} ${catKeywords[cat] || ''}` : q;
    const gUrl = `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=en&sortby=publishedAt&max=${max}&apikey=${key}`;
    const gRes = await fetch(gUrl);

    if (!gRes.ok) {
      console.error('GNews error:', await gRes.text());
      return NextResponse.json(
        { error: 'Upstream error', articles: [] },
        { status: 502, headers: corsHeaders(corsOrigin) }
      );
    }

    const data = await gRes.json();
    const articles = (data.articles || []).map((a: Record<string, unknown>) => ({
      title: a.title || '',
      body: (a as { description?: string }).description || '',
      full: (a as { content?: string }).content || (a as { description?: string }).description || '',
      source: ((a as { source?: { name?: string } }).source)?.name || 'News',
      sourceUrl: (a as { url?: string }).url || '#',
      publishedAt: (a as { publishedAt?: string }).publishedAt || new Date().toISOString(),
      image: (a as { image?: string }).image || null,
      cat: detectCategory(String(a.title || '') + ' ' + String((a as { description?: string }).description || '')),
      verified: false,
      _live: true,
    }));

    const ttl = cacheConfig.apiResponse.ttl;
    return NextResponse.json(
      { articles, total: (data as { totalArticles?: number }).totalArticles || articles.length },
      {
        status: 200,
        headers: {
          ...corsHeaders(corsOrigin),
          'Cache-Control': `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 2}`,
        },
      }
    );
  } catch (err) {
    console.error('news handler:', err);
    return NextResponse.json(
      { error: 'Internal error', articles: [] },
      { status: 500, headers: corsHeaders(corsOrigin) }
    );
  }
}
