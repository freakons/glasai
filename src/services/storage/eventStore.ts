/**
 * Omterminal — Event Store
 *
 * Persistence layer for intelligence events.
 * Sits at the end of the extraction pipeline and feeds the signals engine.
 *
 * Pipeline position:
 *   RSS ingestion → normalization → event extraction → eventStore → signals engine
 *
 * Functions:
 *   saveEvent      — persist a single Event
 *   saveEvents     — persist an array of Events (bulk, skips duplicates)
 *   getRecentEvents — retrieve the N most recent stored events
 */

import { dbQuery } from '@/db/client';
import type { Event } from '@/types/intelligence';

// ─────────────────────────────────────────────────────────────────────────────
// Row type returned from the `events` table
// ─────────────────────────────────────────────────────────────────────────────

interface EventRow {
  id: string;
  type: string;
  company: string;
  related_model: string | null;
  title: string;
  description: string;
  timestamp: string;
  source_article_id: string | null;
  tags: string[] | null;
  region: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Map a database row back to the canonical Event interface. */
function rowToEvent(row: EventRow): Event {
  return {
    id:           row.id,
    type:         row.type as Event['type'],
    company:      row.company,
    relatedModel: row.related_model ?? undefined,
    title:        row.title,
    description:  row.description,
    timestamp:    typeof row.timestamp === 'string'
                    ? row.timestamp
                    : new Date(row.timestamp).toISOString(),
    tags:         row.tags ?? undefined,
    region:       row.region ?? undefined,
    payload:      row.payload ?? undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist a single Event to the database.
 *
 * Uses INSERT … ON CONFLICT DO NOTHING so repeated ingestion of the same
 * event ID is idempotent — no duplicates will be created.
 *
 * @returns true if the row was inserted, false if it already existed or DB is unavailable.
 */
export async function saveEvent(event: Event): Promise<boolean> {
  const sourceArticleId = event.sourceArticle?.id ?? null;
  const tagsArray       = event.tags && event.tags.length > 0 ? event.tags : null;
  const payloadJson     = event.payload ? JSON.stringify(event.payload) : null;

  const rows = await dbQuery<{ id: string }>`
    INSERT INTO events (
      id, type, company, related_model, title, description,
      timestamp, source_article_id, tags, region, payload
    ) VALUES (
      ${event.id},
      ${event.type},
      ${event.company},
      ${event.relatedModel ?? null},
      ${event.title},
      ${event.description},
      ${event.timestamp},
      ${sourceArticleId},
      ${tagsArray},
      ${event.region ?? null},
      ${payloadJson}
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `;

  return rows.length > 0;
}

/**
 * Persist an array of Events in parallel, skipping duplicates.
 *
 * Individual failures are caught and logged; they do not abort the batch.
 *
 * @returns Number of newly inserted events.
 */
export async function saveEvents(events: Event[]): Promise<number> {
  if (events.length === 0) return 0;

  const results = await Promise.allSettled(events.map(saveEvent));

  let inserted = 0;
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) inserted++;
    if (result.status === 'rejected') {
      console.error('[eventStore] Failed to save event:', result.reason);
    }
  }

  console.log(`[eventStore] saveEvents: ${inserted}/${events.length} inserted.`);
  return inserted;
}

/**
 * Retrieve the most recent Events from the database, ordered by timestamp desc.
 *
 * @param limit  Maximum number of events to return (default 50, max 500).
 * @returns      Array of Events, newest first.
 */
export async function getRecentEvents(limit = 50): Promise<Event[]> {
  const safeLimit = Math.min(Math.max(1, limit), 500);

  const rows = await dbQuery<EventRow>`
    SELECT
      id, type, company, related_model, title, description,
      timestamp, source_article_id, tags, region, payload, created_at
    FROM events
    ORDER BY timestamp DESC
    LIMIT ${safeLimit}
  `;

  return rows.map(rowToEvent);
}
