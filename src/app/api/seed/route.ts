/**
 * POST /api/seed?key=<ADMIN_SECRET>
 *
 * Seeds the regulations, ai_models, and funding_rounds tables with the
 * current static arrays from src/lib/data/.
 *
 * Safe to run multiple times — uses ON CONFLICT DO NOTHING so existing
 * rows are never overwritten.
 *
 * Requires ADMIN_SECRET query param for authorization.
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbQuery } from '@/db/client';
import { REGULATIONS } from '@/lib/data/regulations';
import { MODELS } from '@/lib/data/models';
import { FUNDING_ROUNDS } from '@/lib/data/funding';
import { parseFundingAmountUsdM } from '@/lib/parseFundingAmount';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const url       = new URL(req.url);
  const keyParam  = url.searchParams.get('key') ?? '';
  const adminKey  = process.env.ADMIN_SECRET ?? '';

  if (!adminKey || keyParam !== adminKey) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, { inserted: number; skipped: number }> = {
    regulations:    { inserted: 0, skipped: 0 },
    ai_models:      { inserted: 0, skipped: 0 },
    funding_rounds: { inserted: 0, skipped: 0 },
  };

  try {
    // ── regulations ──────────────────────────────────────────────────────────
    for (const r of REGULATIONS) {
      const rows = await dbQuery`
        INSERT INTO regulations (id, title, type, country, flag, status, summary, date, impact)
        VALUES (${r.id}, ${r.title}, ${r.type}, ${r.country}, ${r.flag},
                ${r.status}, ${r.summary}, ${r.date}, ${r.impact})
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `;
      if (rows.length > 0) results.regulations.inserted++;
      else                  results.regulations.skipped++;
    }

    // ── ai_models ─────────────────────────────────────────────────────────────
    for (const m of MODELS) {
      const rows = await dbQuery`
        INSERT INTO ai_models
          (id, name, company, icon, release_date, type, context_window, key_capability, summary)
        VALUES (${m.id}, ${m.name}, ${m.company}, ${m.icon}, ${m.releaseDate},
                ${m.type}, ${m.contextWindow}, ${m.keyCapability}, ${m.summary})
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `;
      if (rows.length > 0) results.ai_models.inserted++;
      else                  results.ai_models.skipped++;
    }

    // ── funding_rounds ────────────────────────────────────────────────────────
    for (const f of FUNDING_ROUNDS) {
      const amountUsdM = parseFundingAmountUsdM(f.amount);
      const rows = await dbQuery`
        INSERT INTO funding_rounds
          (id, company, icon, amount, amount_usd_m, valuation, round, date, investors, summary)
        VALUES (${f.id}, ${f.company}, ${f.icon}, ${f.amount}, ${amountUsdM},
                ${f.valuation}, ${f.round}, ${f.date}, ${f.investors}, ${f.summary})
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `;
      if (rows.length > 0) results.funding_rounds.inserted++;
      else                  results.funding_rounds.skipped++;
    }

    const totalInserted = Object.values(results).reduce((s, r) => s + r.inserted, 0);
    const totalSkipped  = Object.values(results).reduce((s, r) => s + r.skipped,  0);

    console.log('[seed] Complete — inserted:', totalInserted, 'skipped:', totalSkipped);

    return NextResponse.json({
      ok: true,
      inserted: totalInserted,
      skipped:  totalSkipped,
      details:  results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[seed] error:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
