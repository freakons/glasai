import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export const runtime = 'nodejs';

const STATEMENTS = [
    `CREATE TABLE IF NOT EXISTS articles (
        id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
                source TEXT NOT NULL,
                    url TEXT NOT NULL UNIQUE,
                        published_at TIMESTAMPTZ NOT NULL,
                            category TEXT NOT NULL,
                                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                                  )`,
    `CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles (published_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_articles_category ON articles (category)`,
    `CREATE INDEX IF NOT EXISTS idx_articles_source ON articles (source)`,
    `CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
                company TEXT NOT NULL,
                    related_model TEXT,
                        title TEXT NOT NULL,
                            description TEXT NOT NULL,
                                timestamp TIMESTAMPTZ NOT NULL,
                                    source_article_id TEXT REFERENCES articles (id) ON DELETE SET NULL,
                                        tags TEXT[],
                                            region TEXT,
                                                payload JSONB,
                                                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                                                      )`,
    `CREATE INDEX IF NOT EXISTS idx_events_type ON events (type)`,
    `CREATE INDEX IF NOT EXISTS idx_events_company ON events (company)`,
    `CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events (timestamp DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_events_source_article_id ON events (source_article_id)`,
    `CREATE TABLE IF NOT EXISTS signals (
        id TEXT PRIMARY KEY,
            signal_type TEXT CHECK (signal_type IN (
                  'CAPITAL_ACCELERATION','MODEL_RELEASE_WAVE',
                        'REGULATION_ACTIVITY','RESEARCH_MOMENTUM','COMPANY_EXPANSION'
                            )),
                                title TEXT NOT NULL,
                                    description TEXT NOT NULL,
                                        supporting_events TEXT[] NOT NULL DEFAULT '{}',
                                            confidence_score NUMERIC(4,3) NOT NULL DEFAULT 0.0
                                                  CHECK (confidence_score BETWEEN 0.0 AND 1.0),
                                                      direction TEXT CHECK (direction IN ('bullish','bearish','neutral','uncertain')),
                                                          affected_entities TEXT[],
                                                              recommendation TEXT,
                                                                  human_verified BOOLEAN NOT NULL DEFAULT FALSE,
                                                                      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                                                                          updated_at TIMESTAMPTZ
                                                                            )`,
    `CREATE INDEX IF NOT EXISTS idx_signals_signal_type ON signals (signal_type)`,
    `CREATE INDEX IF NOT EXISTS idx_signals_direction ON signals (direction)`,
    `CREATE INDEX IF NOT EXISTS idx_signals_created_at ON signals (created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_signals_confidence ON signals (confidence_score DESC)`,
    `CREATE TABLE IF NOT EXISTS access_requests (
        id SERIAL PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                  )`,
    `CREATE INDEX IF NOT EXISTS idx_access_requests_created_at ON access_requests (created_at DESC)`,
  ];

export async function POST(req: NextRequest) {
    const secret = req.headers.get('x-cron-secret');
    if (secret !== process.env.CRON_SECRET) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

  const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
          return NextResponse.json({ error: 'DATABASE_URL not configured' }, { status: 500 });
    }

  try {
        const sql = neon(dbUrl);
        const results: string[] = [];
        for (const stmt of STATEMENTS) {
                await sql(stmt);
                results.push('ok');
        }
        return NextResponse.json({ ok: true, message: 'Migration complete', statements: results.length });
  } catch (err) {
        console.error('[migrate] error:', err);
        return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
    return POST(req);
}
