export const runtime = 'nodejs';
/**
 * Omterminal — Opportunities API
 *
 * GET /api/opportunities
 *
 * Returns the top 20 ranked market opportunities derived from the latest
 * intelligence signals, together with an overall market-bias reading.
 *
 * Pipeline
 * ────────
 *  1. Fetch latest signals from DB
 *     - Production + empty DB → trigger background pipeline, return db-empty sentinel
 *     - Development + empty DB → fall back to MOCK_SIGNALS
 *  2. Map each signal → SignalInput and call computeSignalScore()
 *  3. Feed scored results into rankOpportunities() (top 20, score desc)
 *  4. Derive marketBias from the direction distribution of ranked signals
 *  5. Return { marketBias, signals, source, timestamp }
 *
 * Response shape
 * ──────────────
 *  {
 *    marketBias: "BULLISH" | "BEARISH" | "NEUTRAL"
 *    signals: [
 *      { rank, symbol, score, direction, velocity, volumeSpike, timestamp },
 *      …
 *    ]
 *    source:    "db" | "mock" | "db-empty"
 *    timestamp: string  // ISO-8601
 *  }
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateEnvironment }   from '@/lib/env';
import { getOrCreateRequestId, logWithRequestId } from '@/lib/requestId';
import { getCache as redisGet, setCache as redisSet, TTL } from '@/lib/cache/redis';
import { broadcastOpportunity }  from '@/server/opportunitySocket';
import { triggerPipelineOnce }   from '@/lib/pipelineTrigger';
import { getSignals }            from '@/db/queries';
import { MOCK_SIGNALS }        from '@/data/mockSignals';
import { computeSignalScore }  from '@/lib/signals/signalScore';
import { rankOpportunities }   from '@/lib/signals/opportunityRanker';
import { computeMarketPulse }  from '@/lib/signals/marketPulse';
import type { Signal }         from '@/data/mockSignals';
import type { SignalInput, TrendDirection } from '@/lib/signals/signalScore';
import type { SignalCandidate } from '@/lib/signals/opportunityRanker';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const RESULT_LIMIT         = 20;
const FETCH_LIMIT          = 60;  // fetch slightly more than we rank to give scorer headroom
const VOLUME_SPIKE_FLOOR   = 80;  // confidence >= 80 → treat as volume-spike signal
const VELOCITY_MAX         = 100; // confidence scale denominator for velocity mapping


// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map a signal category to a TrendDirection.
 *
 * Bullish categories (funding, model launches, research, product) → UP
 * Regulatory / compliance signals → DOWN (uncertainty)
 * Everything else                 → NEUTRAL
 */
function categoryToDirection(category: string): TrendDirection {
  switch (category) {
    case 'funding':
    case 'models':
    case 'research':
    case 'agents':
    case 'product':
      return 'UP';
    case 'regulation':
      return 'DOWN';
    default:
      return 'NEUTRAL';
  }
}

/**
 * Convert a frontend Signal (0-100 confidence) into a SignalInput suitable
 * for computeSignalScore().
 *
 * Mapping rationale
 * ─────────────────
 *  velocity      — confidence scaled from [0, 100] to [0, 5] (scorer's expected range)
 *  volumeSpike   — true when confidence >= VOLUME_SPIKE_FLOOR (high-conviction signal)
 *  trendDirection — derived from signal category
 *  momentum      — confidence normalized to [0, 1]
 *  liquidityScore — fixed at 0.70; no liquidity data available in the signal layer,
 *                   0.70 represents a moderate-liquidity prior rather than artificially
 *                   inflating or deflating scores
 */
function toSignalInput(signal: Signal): SignalInput {
  const direction = categoryToDirection(signal.category);
  const confidence01 = signal.confidence / VELOCITY_MAX;

  return {
    symbol:         signal.entityName || signal.id,
    velocity:       confidence01 * 5,
    volumeSpike:    signal.confidence >= VOLUME_SPIKE_FLOOR,
    trendDirection: direction,
    momentum:       confidence01,
    liquidityScore: 0.70,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────────────────────

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const CACHE_HEADERS = { 'Cache-Control': 's-maxage=10, stale-while-revalidate=60' };
const REDIS_KEY = 'signals:marketPulse';

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const reqId = getOrCreateRequestId(req);
  validateEnvironment(['DATABASE_URL']);

  // ── 0. Redis cache check ────────────────────────────────────────────────
  const redisCached = await redisGet(REDIS_KEY);
  if (redisCached) {
    logWithRequestId(reqId, 'opportunities', `cache_hit source=redis ms=${Date.now() - t0}`);
    return NextResponse.json(redisCached, { headers: { ...CACHE_HEADERS, 'x-source': 'cache' } });
  }

  // ── 1. Fetch latest signals ───────────────────────────────────────────────
  let raw: Signal[];
  let source: 'db' | 'mock' | 'db-empty';

  try {
    raw = await getSignals(FETCH_LIMIT);

    if (raw.length === 0) {
      // Production: kick off a background pipeline run so the DB populates
      // itself, then return the empty sentinel.  The next poll cycle (5 s)
      // will pick up real data once ingestion completes.
      if (IS_PRODUCTION) {
        triggerPipelineOnce(); // fire-and-forget, cooldown-gated
        logWithRequestId(reqId, 'opportunities', `cache_miss db-empty — pipeline triggered ms=${Date.now() - t0}`);
        return NextResponse.json(
          { marketBias: 'NEUTRAL', signals: [], source: 'db-empty', requestId: reqId, timestamp: new Date().toISOString() },
          { headers: { ...CACHE_HEADERS, 'x-source': 'empty', 'x-request-id': reqId } },
        );
      }
      // Development: fall back to mock data so local work is unblocked.
      raw    = MOCK_SIGNALS.slice(0, FETCH_LIMIT);
      source = 'mock';
    } else {
      source = 'db';
    }
  } catch {
    // A query error in production surfaces as a 500 (thrown by dbQuery / getClient).
    // In development, fall back to mock data.
    if (IS_PRODUCTION) throw new Error('Failed to fetch signals from database.');
    raw    = MOCK_SIGNALS.slice(0, FETCH_LIMIT);
    source = 'mock';
  }

  // ── 2. Score each signal ──────────────────────────────────────────────────
  // computeSignalScore() is pure/synchronous — no async overhead.
  const candidates: SignalCandidate[] = raw.map((signal) => {
    const input  = toSignalInput(signal);
    const result = computeSignalScore(input);

    return {
      symbol:      result.symbol,
      score:       result.score,
      direction:   result.direction,
      velocity:    input.velocity,
      volumeSpike: input.volumeSpike,
    };
  });

  // ── 3. Rank (top 20, score descending) ───────────────────────────────────
  const ranked = rankOpportunities(candidates, { limit: RESULT_LIMIT });

  // ── 4. Market bias ────────────────────────────────────────────────────────
  // Bias is computed over the ranked set (post-filter), not the raw pool,
  // so it reflects the quality-weighted view of the market.
  const { bias: marketBias } = computeMarketPulse(ranked);

  // ── 5. Respond ────────────────────────────────────────────────────────────
  const payload = { marketBias, signals: ranked, source, requestId: reqId, timestamp: new Date().toISOString() };
  broadcastOpportunity({ type: 'opportunity_update', data: ranked });

  // Store in Redis for subsequent requests
  await redisSet(REDIS_KEY, payload, TTL.SIGNALS);

  logWithRequestId(reqId, 'opportunities', `cache_miss source=${source} signals=${ranked.length} ms=${Date.now() - t0}`);
  return NextResponse.json(payload, { headers: { ...CACHE_HEADERS, 'x-source': source, 'x-request-id': reqId } });
}
