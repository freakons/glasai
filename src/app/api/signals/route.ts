export const runtime = 'nodejs';
/**
 * Omterminal — Signals API Route
 *
 * Runs the signals engine over recent events and persists the results.
 * Triggered automatically by the ingest pipeline or called on demand.
 *
 * GET /api/signals
 *   No params required — returns stored signals in frontend format.
 *   Returns source='db' when real data exists, source='empty' when the DB
 *   has no signals yet.  Never silently falls back to mock data; callers
 *   must detect source='empty' and show an appropriate empty state.
 *
 * GET /api/signals?secret=<CRON_SECRET>
 *   Runs signal generation and returns newly generated signals.
 *
 * GET /api/signals?list=true
 *   Returns the most recent stored signals in the internal engine format
 *   without re-running the engine.
 *
 * Error transparency contract:
 *   DB unavailable        → HTTP 503  { ok: false, source: 'error', error: '...' }
 *   No signals in DB yet  → HTTP 200  { ok: true,  source: 'empty', signals: [], count: 0 }
 *   Real signals found    → HTTP 200  { ok: true,  source: 'db',    signals: [...] }
 *   Engine failure        → HTTP 500  { ok: false, error: '...' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateEnvironment } from '@/lib/env';
import { createRequestId, logWithRequestId } from '@/lib/requestId';
import { withPipelineLock, pipelineLockedResponse } from '@/lib/pipelineLock';
import { getCache, setCache } from '@/lib/memoryCache';
import { getEdgeSignals, setEdgeSignals } from '@/lib/edgeCache';
import { getCache as redisGet, setCache as redisSet, TTL } from '@/lib/cache/redis';
import { getRecentEvents } from '@/services/storage/eventStore';
import { generateSignalsFromEvents } from '@/services/signals/signalEngine';
import { saveSignals, getRecentSignals } from '@/services/storage/signalStore';
import { getSignals } from '@/db/queries';
import { parseSignalMode, DEFAULT_SIGNAL_MODE } from '@/lib/signals/signalModes';

export const maxDuration = 10; // Vercel Hobby plan limit; upgrade to Pro for larger event lookbacks

// Short TTL so fresh data appears quickly; stale-while-revalidate keeps UX snappy
const CACHE_HEADERS = { 'Cache-Control': 's-maxage=10, stale-while-revalidate=60' };

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const reqId = createRequestId();
  try {
    validateEnvironment(['DATABASE_URL']);
  } catch (err) {
    console.error('[api/signals] environment validation failed:', err);
    return NextResponse.json(
      { ok: false, source: 'error', error: 'signals query failed', signals: [], count: 0 },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(req.url);
  const cronSecret  = req.headers.get('x-vercel-cron-secret') || '';
  const querySecret = searchParams.get('secret') || '';
  const expected    = process.env.CRON_SECRET || '';
  const listOnly    = searchParams.get('list') === 'true';

  // ── Frontend mode ─────────────────────────────────────────────────────────
  // Called without auth params → serve frontend-formatted signals from DB.
  // No mock-data fallback: callers receive an explicit source indicator.
  const isAuthRequest =
    listOnly ||
    (expected !== '' && (cronSecret === expected || querySecret === expected));

  if (!isAuthRequest) {
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200);
    // Parse signal quality mode from query param; default to standard for public surfaces.
    const mode  = parseSignalMode(searchParams.get('mode'));
    // Include mode in cache key so raw/standard/premium never serve each other's cached data.
    const cacheBase = mode === DEFAULT_SIGNAL_MODE ? '' : `:mode:${mode}`;
    const redisCacheKey = limit === 50
      ? `signals:latest${cacheBase}`
      : `signals:list:limit:${limit}${cacheBase}`;
    const debug = searchParams.get('debug') === 'true';

    try {
      // 1. Edge cache (KV-backed, cross-region)
      // Only use edge cache for the default mode to keep it simple.
      if (mode === DEFAULT_SIGNAL_MODE) {
        const edgeCached = await getEdgeSignals();
        if (edgeCached) {
          logWithRequestId(reqId, 'signals', `cache_hit source=edge mode=${mode} ms=${Date.now() - t0}`);
          return NextResponse.json(edgeCached, { headers: { ...CACHE_HEADERS, 'x-source': 'cache' } });
        }
      }

      // 2. Redis cache (Upstash, cross-region, persistent)
      const redisCached = await redisGet(redisCacheKey);
      if (redisCached) {
        logWithRequestId(reqId, 'signals', `cache_hit source=redis mode=${mode} ms=${Date.now() - t0}`);
        return NextResponse.json(redisCached, { headers: { ...CACHE_HEADERS, 'x-source': 'cache' } });
      }

      // 3. In-process memory cache (per-instance, 5 s)
      const memCacheKey = `signals:${mode}`;
      const cached = getCache(memCacheKey, 5000);
      if (cached) {
        logWithRequestId(reqId, 'signals', `cache_hit source=memory mode=${mode} ms=${Date.now() - t0}`);
        return NextResponse.json(cached, { headers: { ...CACHE_HEADERS, 'x-source': 'cache' } });
      }

      // 4. Database query — mode-aware filtering applied inside getSignals()
      const dbSignals = await getSignals(limit, mode);

      // Diagnostics: log table state for debugging
      let diagnostics: Record<string, unknown> | undefined;
      if (debug || dbSignals.length === 0) {
        try {
          const { dbQuery: rawQuery } = await import('@/db/client');
          const countResult = await rawQuery<{ count: string }>`SELECT COUNT(*) AS count FROM signals`;
          const sampleResult = await rawQuery<Record<string, unknown>>`SELECT id, title, status, signal_type, confidence_score, created_at FROM signals ORDER BY created_at DESC LIMIT 1`;
          diagnostics = {
            totalRows: countResult[0]?.count ?? 'unknown',
            sampleRow: sampleResult[0] ?? null,
          };
          console.log('[api/signals] diagnostics:', JSON.stringify(diagnostics));
        } catch (diagErr) {
          console.warn('[api/signals] diagnostics query failed:', diagErr);
        }
      }

      if (dbSignals.length > 0) {
        const payload: Record<string, unknown> = { ok: true, source: 'db', mode, signals: dbSignals, count: dbSignals.length };
        if (debug && diagnostics) payload.diagnostics = diagnostics;
        // Only populate edge cache for the default mode (avoids edge cache thrash across modes).
        if (mode === DEFAULT_SIGNAL_MODE) await setEdgeSignals(payload);
        await redisSet(redisCacheKey, payload, TTL.SIGNALS);
        setCache(memCacheKey, payload);
        logWithRequestId(reqId, 'signals', `cache_miss source=db mode=${mode} signals=${dbSignals.length} ms=${Date.now() - t0}`);
        return NextResponse.json(payload, { headers: { ...CACHE_HEADERS, 'x-source': 'db' } });
      }

      // DB is reachable but has no signals yet — return an explicit empty state.
      // Do NOT serve mock data: this would mask a real pipeline issue.
      logWithRequestId(reqId, 'signals', `cache_miss source=empty ms=${Date.now() - t0}`);
      return NextResponse.json(
        {
          ok: true,
          source: 'empty',
          signals: [],
          count: 0,
          message: 'No signals ingested yet. Trigger /api/ingest to populate.',
          ...(diagnostics ? { diagnostics } : {}),
        },
        { headers: { ...CACHE_HEADERS, 'x-source': 'empty' } },
      );
    } catch (err) {
      // Cache or DB query failed — surface the error clearly rather than hiding it with mock data.
      console.error('[api/signals] fetch error:', err);
      return NextResponse.json(
        {
          ok: false,
          source: 'error',
          error: process.env.NODE_ENV === 'production' ? 'signals query failed' : String(err),
          signals: [],
          count: 0,
        },
        { status: 503, headers: { 'x-source': 'error' } },
      );
    }
  }

  // ── Auth check (engine / list modes) ─────────────────────────────────────
  if (expected && cronSecret !== expected && querySecret !== expected) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // ── List-only mode: return stored signals without running the engine ───────
  if (listOnly) {
    const limit   = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 200);
    const signals = await getRecentSignals(limit);
    return NextResponse.json({ ok: true, signals, count: signals.length });
  }

  // ── Engine mode: run signals generation (lock-protected) ─────────────────
  // Parse mode for the engine run; defaults to standard to preserve existing behaviour.
  const engineMode = parseSignalMode(new URL(req.url).searchParams.get('mode'));

  try {
    const guard = await withPipelineLock('signals-engine', reqId, 'signals', async () => {
      const events = await getRecentEvents(500);
      const signals = generateSignalsFromEvents(events, engineMode);
      const inserted = await saveSignals(signals);
      return { events, signals, inserted };
    });

    if (guard.locked) {
      return pipelineLockedResponse(reqId, guard);
    }

    const { events, signals, inserted } = guard.result;
    logWithRequestId(reqId, 'signals', `engine: mode=${engineMode} events=${events.length} generated=${signals.length} inserted=${inserted} ms=${Date.now() - t0}`);

    return NextResponse.json({
      ok:               true,
      mode:             engineMode,
      eventsAnalysed:   events.length,
      signalsGenerated: signals.length,
      signalsInserted:  inserted,
      signals,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[api/signals] engine error:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export const POST = GET;
