export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/userId';
import {
  getWatchlistForUser,
  addWatchlistEntity,
  removeWatchlistEntity,
  bulkImportWatchlist,
} from '@/db/queries';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/watchlist — fetch all watched entities for the current user
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: 'No user identity found' },
      { status: 401 },
    );
  }

  try {
    const entities = await getWatchlistForUser(userId);
    return NextResponse.json({ ok: true, entities });
  } catch (err) {
    console.error('[api/watchlist] GET error:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to fetch watchlist' },
      { status: 503 },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/watchlist — add an entity or bulk-import from localStorage
// ─────────────────────────────────────────────────────────────────────────────
//
// Single add:   { slug: string, name: string, sector?: string, country?: string }
// Bulk import:  { entities: Array<{ slug, name, sector?, country?, addedAt? }> }
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: 'No user identity found' },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  // Bulk import path
  if (Array.isArray(body.entities)) {
    const entities = body.entities as Array<{
      slug: string;
      name: string;
      sector?: string;
      country?: string;
      addedAt?: string;
    }>;

    // Validate each entity
    for (const e of entities) {
      if (!e.slug || typeof e.slug !== 'string' || !e.name || typeof e.name !== 'string') {
        return NextResponse.json(
          { ok: false, error: 'Each entity must have slug and name strings' },
          { status: 400 },
        );
      }
    }

    try {
      const imported = await bulkImportWatchlist(userId, entities);
      return NextResponse.json({ ok: true, imported });
    } catch (err) {
      console.error('[api/watchlist] bulk import error:', err);
      return NextResponse.json(
        { ok: false, error: 'Failed to import watchlist' },
        { status: 503 },
      );
    }
  }

  // Single add path
  const { slug, name, sector, country } = body as {
    slug?: string;
    name?: string;
    sector?: string;
    country?: string;
  };

  if (!slug || typeof slug !== 'string' || !name || typeof name !== 'string') {
    return NextResponse.json(
      { ok: false, error: 'slug and name are required strings' },
      { status: 400 },
    );
  }

  try {
    await addWatchlistEntity(userId, slug, name, sector as string | undefined, country as string | undefined);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/watchlist] POST error:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to add entity to watchlist' },
      { status: 503 },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/watchlist?slug=<entitySlug> — remove an entity
// ─────────────────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: 'No user identity found' },
      { status: 401 },
    );
  }

  const slug = new URL(req.url).searchParams.get('slug');
  if (!slug) {
    return NextResponse.json(
      { ok: false, error: 'slug query parameter is required' },
      { status: 400 },
    );
  }

  try {
    await removeWatchlistEntity(userId, slug);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/watchlist] DELETE error:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to remove entity from watchlist' },
      { status: 503 },
    );
  }
}
