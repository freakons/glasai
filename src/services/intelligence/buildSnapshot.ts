import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { query } from '../../lib/db';

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

interface IntelligenceSnapshot {
    generated_at: string;
    total: number;
    events: SnapshotEvent[];
    by_category: Record<string, SnapshotEvent[]>;
}

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
                  const cat = event.category || 'COMPANY_MOVE';
                  if (!by_category[cat]) by_category[cat] = [];
                  by_category[cat].push(event);
          }

      const snapshot: IntelligenceSnapshot = {
              generated_at: new Date().toISOString(),
              total: rows.length,
              events: rows,
              by_category,
      };

      await writeSnapshot(snapshot);
          console.log(`[snapshot] Built snapshot: ${rows.length} events across ${Object.keys(by_category).length} categories`);
          return snapshot;
    } catch (err) {
          console.error('[snapshot] Failed to build snapshot:', err);
          const fallback: IntelligenceSnapshot = {
                  generated_at: new Date().toISOString(),
                  total: 0,
                  events: [],
                  by_category: {},
          };
          return fallback;
    }
}

async function writeSnapshot(snapshot: IntelligenceSnapshot): Promise<void> {
    try {
          const dir = join(process.cwd(), 'public', 'data');
          await mkdir(dir, { recursive: true });
          const file = join(dir, 'intelligence.json');
          await writeFile(file, JSON.stringify(snapshot, null, 2), 'utf-8');
    } catch (err) {
          console.error('[snapshot] Failed to write snapshot file:', err);
    }
}
