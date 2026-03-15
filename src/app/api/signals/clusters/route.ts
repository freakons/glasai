/**
 * GET /api/signals/clusters
 *
 * Returns recent signal corroboration clusters — groups of related signals
 * from different sources that reference the same entity or topic.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSignalClusters } from '@/lib/signals/clusterSignals';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);

  try {
    const rows = await getSignalClusters(limit);

    const clusters = rows.map((row) => ({
      entity: row.entity,
      topic: row.topic,
      confidence: row.confidence_score,
      signals: row.signal_count,
    }));

    return NextResponse.json({ clusters });
  } catch (err) {
    console.error(
      '[api/signals/clusters] Error:',
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json(
      { clusters: [], error: 'Failed to fetch clusters' },
      { status: 500 },
    );
  }
}
