/**
 * seed-static-data.ts
 *
 * One-time seed script: inserts the current static arrays for regulations,
 * AI models, and funding rounds into the database.
 *
 * Run with:
 *   npx tsx scripts/seed-static-data.ts
 *
 * Safe to run multiple times — uses INSERT ... ON CONFLICT DO NOTHING so
 * existing rows are never overwritten.
 *
 * Prerequisites:
 *   1. Migration 003 has been applied (regulations, ai_models, funding_rounds tables exist).
 *   2. DATABASE_URL is set in the environment.
 */

import 'dotenv/config';
import { dbQuery } from '../src/db/client';
import { REGULATIONS } from '../src/lib/data/regulations';
import { MODELS }      from '../src/lib/data/models';
import { FUNDING_ROUNDS } from '../src/lib/data/funding';
import { parseFundingAmountUsdM } from '../src/lib/parseFundingAmount';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

let inserted = 0;
let skipped  = 0;

function log(msg: string) { console.log(`[seed] ${msg}`); }

// ─────────────────────────────────────────────────────────────────────────────
// Seed regulations
// ─────────────────────────────────────────────────────────────────────────────

async function seedRegulations() {
  log(`Seeding ${REGULATIONS.length} regulations…`);
  for (const r of REGULATIONS) {
    const rows = await dbQuery`
      INSERT INTO regulations (id, title, type, country, flag, status, summary, date, impact)
      VALUES (
        ${r.id}, ${r.title}, ${r.type}, ${r.country}, ${r.flag},
        ${r.status}, ${r.summary}, ${r.date}, ${r.impact}
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `;
    if (rows.length > 0) { inserted++; log(`  + regulation: ${r.id}`); }
    else                  { skipped++;  log(`  ~ skipped (exists): ${r.id}`); }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed AI models
// ─────────────────────────────────────────────────────────────────────────────

async function seedModels() {
  log(`Seeding ${MODELS.length} AI models…`);
  for (const m of MODELS) {
    const rows = await dbQuery`
      INSERT INTO ai_models (id, name, company, icon, release_date, type, context_window, key_capability, summary)
      VALUES (
        ${m.id}, ${m.name}, ${m.company}, ${m.icon}, ${m.releaseDate},
        ${m.type}, ${m.contextWindow}, ${m.keyCapability}, ${m.summary}
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `;
    if (rows.length > 0) { inserted++; log(`  + model: ${m.id}`); }
    else                  { skipped++;  log(`  ~ skipped (exists): ${m.id}`); }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed funding rounds
// ─────────────────────────────────────────────────────────────────────────────

async function seedFundingRounds() {
  log(`Seeding ${FUNDING_ROUNDS.length} funding rounds…`);
  for (const f of FUNDING_ROUNDS) {
    const amountUsdM = parseFundingAmountUsdM(f.amount);
    const rows = await dbQuery`
      INSERT INTO funding_rounds (id, company, icon, amount, amount_usd_m, valuation, round, date, investors, summary)
      VALUES (
        ${f.id}, ${f.company}, ${f.icon}, ${f.amount}, ${amountUsdM}, ${f.valuation},
        ${f.round}, ${f.date}, ${f.investors}, ${f.summary}
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `;
    if (rows.length > 0) { inserted++; log(`  + funding: ${f.id} (amount_usd_m: ${amountUsdM ?? 'null'})`); }
    else                  { skipped++;  log(`  ~ skipped (exists): ${f.id}`); }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[seed] ERROR: DATABASE_URL is not set. Aborting.');
    process.exit(1);
  }

  log('Starting seed…');

  await seedRegulations();
  await seedModels();
  await seedFundingRounds();

  log('─────────────────────────────────────────────');
  log(`Done. Inserted: ${inserted}  Skipped: ${skipped}`);
}

main().catch((err) => {
  console.error('[seed] Fatal error:', err);
  process.exit(1);
});
