import { dbQuery } from '@/db/client';
import { TrendSignal, TrendResult } from './types';
import { aggregateTrends } from './aggregator';
import { recordTrendSnapshot } from '@/services/analytics/trendTimeseries';

// ── Row type returned by the signals query ────────────────────────────────────

interface SignalRow {
  title: string;
  category: string | null;
  source: string | null;
  entities: { type: string; name: string }[] | null;
  published_at: string | null;
  created_at: string;
  intelligence_score: number | null;
  trust_score: number | null;
}

// ── Fallback mock data (used when DB is unavailable) ──────────────────────────

const MOCK_TREND_SIGNALS: TrendSignal[] = [
  {
    title: 'OpenAI releases GPT-5 with extended context window',
    category: 'ai_model_release',
    source: 'techcrunch',
    entities: [{ type: 'mention', name: 'OpenAI' }, { type: 'mention', name: 'GPT-5' }],
  },
  {
    title: 'OpenAI secures $10B Series F funding round',
    category: 'funding',
    source: 'bloomberg',
    entities: [{ type: 'mention', name: 'OpenAI' }, { type: 'mention', name: 'Microsoft' }],
  },
  {
    title: 'OpenAI announces new enterprise partnerships',
    category: 'ai_startup',
    source: 'venturebeat',
    entities: [{ type: 'mention', name: 'OpenAI' }, { type: 'mention', name: 'Microsoft' }],
  },
  {
    title: 'Anthropic launches Claude 4 with improved reasoning',
    category: 'ai_model_release',
    source: 'techcrunch',
    entities: [{ type: 'mention', name: 'Anthropic' }, { type: 'mention', name: 'Claude' }],
  },
  {
    title: 'Anthropic raises $5B to expand AI safety research',
    category: 'funding',
    source: 'ft',
    entities: [{ type: 'mention', name: 'Anthropic' }, { type: 'mention', name: 'Google' }],
  },
  {
    title: 'Anthropic opens new research lab focused on alignment',
    category: 'research',
    source: 'wired',
    entities: [{ type: 'mention', name: 'Anthropic' }, { type: 'mention', name: 'Google' }],
  },
  {
    title: 'Microsoft integrates AI across Office 365 suite',
    category: 'tool_launch',
    source: 'zdnet',
    entities: [{ type: 'mention', name: 'Microsoft' }, { type: 'mention', name: 'OpenAI' }],
  },
];

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// ── Signal loader ─────────────────────────────────────────────────────────────

async function loadRecentSignals(): Promise<TrendSignal[]> {
  const rows = await dbQuery<SignalRow>`
    SELECT
      title,
      category,
      source,
      entities,
      published_at,
      created_at,
      confidence   AS intelligence_score,
      trust_score
    FROM signals
    WHERE created_at >= NOW() - INTERVAL '24 hours'
      AND status IN ('auto', 'published')
    ORDER BY created_at DESC
    LIMIT 500
  `;

  if (rows.length === 0) {
    if (IS_PRODUCTION) {
      // Production: return empty — do not use mock data that would generate
      // fake trends and mislead downstream insight generation.
      console.log('[trends/runner] no DB signals found in last 24h — returning empty (production)');
      return [];
    }
    // Development: use mock data so local work is unblocked
    console.log('[trends/runner] no DB signals found — using mock data (development)');
    return MOCK_TREND_SIGNALS;
  }

  return rows.map((row): TrendSignal => ({
    title:              row.title,
    category:           row.category ?? 'other',
    source:             row.source ?? 'unknown',
    entities:           Array.isArray(row.entities) ? row.entities : [],
    published_at:       row.published_at ?? row.created_at,
    intelligence_score: row.intelligence_score ?? 50,
    trust_score:        row.trust_score ?? 50,
  }));
}

// ── Trend storage ─────────────────────────────────────────────────────────────

async function storeTrends(trends: TrendResult[]): Promise<void> {
  for (const trend of trends) {
    await dbQuery`
      INSERT INTO trends (topic, category, signal_count, entities, summary, confidence, score, importance_score, velocity_score, created_at)
      VALUES (
        ${trend.topic},
        ${trend.category},
        ${trend.signal_count},
        ${JSON.stringify(trend.entities)},
        ${trend.summary},
        ${trend.confidence},
        ${trend.score},
        ${trend.importance_score},
        ${trend.velocity_score},
        NOW()
      )
      ON CONFLICT (topic) DO UPDATE SET
        category        = EXCLUDED.category,
        signal_count    = EXCLUDED.signal_count,
        entities        = EXCLUDED.entities,
        summary         = EXCLUDED.summary,
        confidence      = EXCLUDED.confidence,
        score           = EXCLUDED.score,
        importance_score = EXCLUDED.importance_score,
        velocity_score  = EXCLUDED.velocity_score,
        created_at      = EXCLUDED.created_at
    `;
  }
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function runTrendAnalysis(): Promise<void> {
  console.log('[trends/runner] starting trend analysis');

  const signals = await loadRecentSignals();
  console.log(`[trends/runner] loaded ${signals.length} signal(s) for analysis`);

  const trends = await aggregateTrends(signals);

  if (trends.length === 0) {
    console.log('[trends/runner] no trends detected (insufficient signal volume)');
    return;
  }

  for (const trend of trends) {
    console.log(
      `[trends/runner] trend detected:\n` +
      `  Topic:    ${trend.topic}\n` +
      `  Signals:  ${trend.signal_count}\n` +
      `  Category: ${trend.category}`,
    );
  }

  try {
    await storeTrends(trends);
    console.log(`[trends/runner] stored ${trends.length} trend(s) to DB`);
  } catch (err) {
    // DB may not have the trends table yet; log and continue
    console.warn('[trends/runner] could not store trends (DB unavailable or table missing):', err);
  }

  try {
    for (const trend of trends) {
      await recordTrendSnapshot(trend.topic, trend.signal_count);
    }
  } catch (err) {
    console.warn('[trends/runner] could not record trend timeseries:', err);
  }

  console.log(`[trends/runner] done — ${trends.length} trend(s) detected`);
}
