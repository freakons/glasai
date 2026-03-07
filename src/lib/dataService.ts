/**
 * Data Service — Abstraction layer for data access.
 *
 * Current implementation: Static seed data from /lib/data modules.
 * Future implementation: Database queries via Supabase/PostgreSQL.
 *
 * By abstracting data access here, switching from seed data to a real database
 * requires changes ONLY in this file — all components continue working unchanged.
 */

import { NEWS, type Article, getArticlesByCategory, getFeaturedArticle } from '@/lib/data/news';
import { REGULATIONS, type Regulation, getRegulationsByType } from '@/lib/data/regulations';
import { MODELS, type AIModel } from '@/lib/data/models';
import { FUNDING_ROUNDS, type FundingRound } from '@/lib/data/funding';
import { TICKERS, type TickerItem } from '@/lib/data/ticker';

// Re-export types for consumers
export type { Article, Regulation, AIModel, FundingRound, TickerItem };

/**
 * Data access functions.
 * When database is integrated, replace implementations below.
 * Interfaces stay the same — zero component changes needed.
 */

export async function fetchArticles(category?: string): Promise<Article[]> {
  // Future: return db.query('SELECT * FROM articles WHERE cat = $1', [category]);
  return category && category !== 'all' ? getArticlesByCategory(category) : NEWS;
}

export async function fetchFeaturedArticle(): Promise<Article | undefined> {
  // Future: return db.query('SELECT * FROM articles WHERE featured = true LIMIT 1');
  return getFeaturedArticle();
}

export async function fetchRegulations(type?: string): Promise<Regulation[]> {
  // Future: return db.query('SELECT * FROM regulations WHERE type = $1', [type]);
  return type && type !== 'all' ? getRegulationsByType(type) : REGULATIONS;
}

export async function fetchModels(): Promise<AIModel[]> {
  // Future: return db.query('SELECT * FROM models ORDER BY release_date DESC');
  return MODELS;
}

export async function fetchFundingRounds(): Promise<FundingRound[]> {
  // Future: return db.query('SELECT * FROM funding_rounds ORDER BY date DESC');
  return FUNDING_ROUNDS;
}

export async function fetchTickerItems(): Promise<TickerItem[]> {
  // Future: return db.query('SELECT * FROM ticker_items ORDER BY created_at DESC LIMIT 10');
  return TICKERS;
}
