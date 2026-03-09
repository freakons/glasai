import { dbQuery as query } from '../../db/client';

interface SnapshotEvent {
  id: number;
  title: string;
  summary: string;
  source_url: string;
  source_name: string;
  category: string;
  published_at: string;
  created_at: string;
}

export interface IntelligenceSnapshot {
  generated_at: string;
  total: number;
  events: SnapshotEvent[];
  by_category: Record<string, SnapshotEvent[]>;
}

/**
 * Build a snapshot of the latest intelligence events from Neon,
 * then persist it to the `snapshots` table (survives redeploys).
 *
 * Snapshots are stored exclusively in PostgreSQL — no filesystem writes.
 * Falls back to the last persisted snapshot if the query fails, or
 * throws clearly so the caller can return HTTP 500.
 */
export async function buildSnapshot(): Promise<IntelligenceSnapshot> {
  try {
    const rows = await query<SnapshotEvent>`
      SELECT id, title, summary, source_url, source_name,
             category, published_at::text,
             created_at::text
      FROM intelligence_events
      ORDER BY published_at DESC
      LIMIT 200
    `;

    const by_category: Record<string, SnapshotEvent[]> = {};
    for (const event of rows) {
      const cat = event.category || 'GENERAL';
      if (!by_category[cat]) by_category[cat] = [];
      by_category[cat].push(event);
    }

    const snapshot: IntelligenceSnapshot = {
      generated_at: new Date().toISOString(),
      total: rows.length,
      events: rows,
      by_category,
    };

    // Persist to DB only — no filesystem writes
    await persistSnapshot(snapshot);

    console.log(
      `[snapshot] Built snapshot: ${rows.length} events across ${Object.keys(by_category).length} categories`,
    );
    return snapshot;
  } catch (err) {
    console.error('[snapshot] Failed to build snapshot from intelligence_events:', err);

    // Try to return last good snapshot from DB
    try {
      const last = await query<{ payload: IntelligenceSnapshot }>`
        SELECT payload FROM snapshots ORDER BY generated_at DESC LIMIT 1
      `;
      if (last.length > 0) {
        console.log('[snapshot] Returning last persisted snapshot from DB');
        return last[0].payload;
      }
    } catch (fallbackErr) {
      console.error('[snapshot] Failed to load fallback snapshot from DB:', fallbackErr);
    }

    // No snapshot available at all — throw so the API route returns HTTP 500
    throw new Error(`Snapshot build failed and no prior snapshot found: ${String(err)}`);
  }
}

/**
 * Persist snapshot to Neon `snapshots` table (DB-only, no filesystem).
 * Keeps only the latest 10 snapshots to avoid unbounded growth.
 */
async function persistSnapshot(snapshot: IntelligenceSnapshot): Promise<void> {
  try {
    await query`
      INSERT INTO snapshots (generated_at, total, payload)
      VALUES (${snapshot.generated_at}, ${snapshot.total}, ${JSON.stringify(snapshot)})
    `;

    // Prune old snapshots — keep latest 10
    await query`
      DELETE FROM snapshots
      WHERE id NOT IN (
        SELECT id FROM snapshots ORDER BY generated_at DESC LIMIT 10
      )
    `;
  } catch (err) {
    // Log but do not throw — a persist failure should not fail the snapshot read
    console.error('[snapshot] Failed to persist snapshot to DB:', err);
  }
}

/**
 * Retrieve the latest snapshot from the DB without rebuilding.
 * Returns null if no snapshot exists or DB is unavailable.
 */
export async function getLatestSnapshot(): Promise<IntelligenceSnapshot | null> {
  try {
    const rows = await query<{ payload: IntelligenceSnapshot }>`
      SELECT payload FROM snapshots ORDER BY generated_at DESC LIMIT 1
    `;
    return rows.length > 0 ? rows[0].payload : null;
  } catch (err) {
    console.error('[snapshot] Failed to retrieve snapshot:', err);
    return null;
  }
}
