import { dbQuery } from '@/db/client';
import { TrendResult } from '@/trends/types';
import { Insight } from './types';
import { generateInsights } from './generator';
import { generateDigest } from './digest';
import { generateNewsletter } from './newsletter';

// ── Row type returned by the trends query ─────────────────────────────────────

interface TrendRow {
  topic: string;
  category: string;
  signal_count: number;
  score: number;
  entities: string[] | null;
  summary: string;
  confidence: number;
}

// ── Fallback mock trends (used when DB is unavailable) ────────────────────────

const MOCK_TRENDS: TrendResult[] = [
  {
    topic:        'OpenAI',
    category:     'ai_model_release',
    signal_count: 5,
    score:        10,
    entities:     ['GPT-5', 'Microsoft'],
    summary:      'Multiple signals mention OpenAI across AI model release activity.',
    confidence:   100,
  },
  {
    topic:        'Anthropic',
    category:     'funding',
    signal_count: 3,
    score:        6,
    entities:     ['Claude', 'Google'],
    summary:      'Multiple signals mention Anthropic across funding activity.',
    confidence:   60,
  },
];

// ── Trend loader ──────────────────────────────────────────────────────────────

async function loadTrends(): Promise<TrendResult[]> {
  const rows = await dbQuery<TrendRow>`
    SELECT topic, category, signal_count, entities, summary, confidence
    FROM trends
    ORDER BY confidence DESC
    LIMIT 100
  `;

  if (rows.length === 0) {
    console.log('[insights/runner] no DB trends found — using mock data');
    return MOCK_TRENDS;
  }

  return rows.map((row): TrendResult => ({
    topic:        row.topic,
    category:     row.category,
    signal_count: row.signal_count,
    score:        row.score ?? 0,
    entities:     Array.isArray(row.entities) ? row.entities : [],
    summary:      row.summary,
    confidence:   row.confidence,
  }));
}

// ── Insight storage ───────────────────────────────────────────────────────────

async function storeInsights(insights: Insight[]): Promise<void> {
  for (const insight of insights) {
    await dbQuery`
      INSERT INTO insights (title, summary, category, topics, confidence, created_at)
      VALUES (
        ${insight.title},
        ${insight.summary},
        ${insight.category},
        ${JSON.stringify(insight.topics)},
        ${insight.confidence},
        NOW()
      )
      ON CONFLICT (title) DO UPDATE SET
        summary    = EXCLUDED.summary,
        category   = EXCLUDED.category,
        topics     = EXCLUDED.topics,
        confidence = EXCLUDED.confidence,
        created_at = EXCLUDED.created_at
    `;
  }
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function runInsightGeneration(): Promise<void> {
  console.log('[insights/runner] starting insight generation');

  const trends = await loadTrends();
  console.log(`[insights/runner] loaded ${trends.length} trend(s)`);

  const insights = await generateInsights(trends);

  if (insights.length === 0) {
    console.log('[insights/runner] no insights generated (no qualifying trends)');
    return;
  }

  for (const insight of insights) {
    console.log(
      `[insights/runner] insight generated:\n` +
      `  Title:      ${insight.title}\n` +
      `  Confidence: ${insight.confidence}`,
    );
  }

  const digest = generateDigest(insights);
  console.log('\n');
  console.log(digest);

  const newsletter = await generateNewsletter(insights);
  console.log('\n');
  console.log('AI Trend Newsletter');
  console.log('====================');
  console.log(newsletter);

  try {
    await storeInsights(insights);
    console.log(`[insights/runner] stored ${insights.length} insight(s) to DB`);
  } catch (err) {
    console.warn('[insights/runner] could not store insights (DB unavailable or table missing):', err);
  }

  console.log(`[insights/runner] done — ${insights.length} insight(s) generated`);
}
