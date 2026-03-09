/**
 * Omterminal — Intelligence Signal Ingest
 *
 * POST /api/intelligence/ingest
 *
 * Accepts a signal payload, runs it through the Signal Trust Engine to
 * derive status and trust_score, then persists the enriched record to the
 * signals table.
 *
 * Expected JSON body:
 *   {
 *     title:      string   (required)
 *     confidence: number   (required, 0–100)
 *     summary?:   string
 *     entityId?:  string
 *     category?:  string
 *     source?:    string
 *     ai_model?:  string
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbQuery } from '@/db/client';
import { evaluateSignalTrust } from '@/lib/trustEngine';
import { extractEntities } from '@/lib/intelligence/entityExtractor';

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // ── Validate required fields ─────────────────────────────────────────────
  const { title, confidence, summary, entityId, category, source, ai_model } = body as {
    title?: unknown;
    confidence?: unknown;
    summary?: unknown;
    entityId?: unknown;
    category?: unknown;
    source?: unknown;
    ai_model?: unknown;
  };

  if (typeof title !== 'string' || title.trim() === '') {
    return NextResponse.json({ error: '`title` is required and must be a non-empty string' }, { status: 400 });
  }

  if (typeof confidence !== 'number' || confidence < 0 || confidence > 100) {
    return NextResponse.json({ error: '`confidence` is required and must be a number between 0 and 100' }, { status: 400 });
  }

  // ── Evaluate trust ────────────────────────────────────────────────────────
  const { status, trust_score } = evaluateSignalTrust({
    confidence,
    source:   typeof source   === 'string' ? source   : undefined,
    ai_model: typeof ai_model === 'string' ? ai_model : undefined,
  });

  // ── Persist to database ───────────────────────────────────────────────────
  const id = crypto.randomUUID();

  try {
    await dbQuery<{ id: string }>`
      INSERT INTO signals (
        id,
        title,
        summary,
        entity_id,
        category,
        confidence,
        source,
        ai_model,
        status,
        trust_score,
        created_at
      ) VALUES (
        ${id},
        ${title.trim()},
        ${typeof summary   === 'string' ? summary   : null},
        ${typeof entityId  === 'string' ? entityId  : null},
        ${typeof category  === 'string' ? category  : null},
        ${confidence},
        ${typeof source    === 'string' ? source    : null},
        ${typeof ai_model  === 'string' ? ai_model  : null},
        ${status},
        ${trust_score},
        NOW()
      )
    `;
  } catch (err) {
    console.error('[intelligence/ingest] db error:', err);
    return NextResponse.json({ error: 'Failed to persist signal' }, { status: 500 });
  }

  // ── Extract entities and persist graph edges ──────────────────────────────
  const signalText = `${title.trim()} ${typeof summary === 'string' ? summary : ''}`;
  try {
    const { entities } = await extractEntities(signalText);

    for (const entity of entities) {
      const entityId = crypto.randomUUID();

      // Upsert entity by name (unique index on entities.name)
      const rows = await dbQuery<{ id: string }>`
        INSERT INTO entities (id, name, type, created_at)
        VALUES (${entityId}, ${entity.name}, ${entity.type}, NOW())
        ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id
      `;

      const resolvedId = rows[0]?.id;
      if (!resolvedId) continue;

      // Insert signal→entity edge (ignore if already exists)
      await dbQuery`
        INSERT INTO signal_entities (signal_id, entity_id, confidence)
        VALUES (${id}, ${resolvedId}, ${0.8})
        ON CONFLICT (signal_id, entity_id) DO NOTHING
      `;
    }
  } catch (err) {
    // Entity extraction is best-effort — log but don't fail the request
    console.error('[intelligence/ingest] entity extraction error:', err);
  }

  return NextResponse.json({
    ok: true,
    id,
    status,
    trust_score,
  }, { status: 201 });
}
