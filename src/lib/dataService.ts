/**
 * Data Service — Abstraction layer for data access.
 *
 * Strategy: DB-only. No static seed fallback.
 *
 * Each function queries the live database via src/db/queries.ts.
 * If the database returns an empty result or throws, the function returns
 * an empty array (or undefined for single-item queries). Page components
 * are responsible for rendering a clean empty state when no data exists.
 *
 * Static seed arrays in /lib/data are retained only for type exports and
 * build-time compatibility — they are never served to end users.
 */

import { type Article } from '@/lib/data/news';
import { type Regulation } from '@/lib/data/regulations';
import { type AIModel } from '@/lib/data/models';
import { type FundingRound } from '@/lib/data/funding';
import { type TickerItem } from '@/lib/data/ticker';

import {
  getArticles as dbGetArticles,
  getFeaturedArticle as dbGetFeaturedArticle,
  getRegulations as dbGetRegulations,
  getModels as dbGetModels,
  getFundingRounds as dbGetFundingRounds,
} from '@/db/queries';

// Re-export types for consumers — unchanged so all imports keep working
export type { Article, Regulation, AIModel, FundingRound, TickerItem };

// ─────────────────────────────────────────────────────────────────────────────
// Articles
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchArticles(category?: string): Promise<Article[]> {
  try {
    return await dbGetArticles(category, 100);
  } catch {
    return [];
  }
}

export async function fetchFeaturedArticle(): Promise<Article | undefined> {
  try {
    return await dbGetFeaturedArticle();
  } catch {
    return undefined;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Regulations
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchRegulations(type?: string): Promise<Regulation[]> {
  try {
    return await dbGetRegulations(type, 100);
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Models
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchModels(): Promise<AIModel[]> {
  try {
    return await dbGetModels(100);
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Funding Rounds
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchFundingRounds(): Promise<FundingRound[]> {
  try {
    return await dbGetFundingRounds(100);
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ticker items
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchTickerItems(): Promise<TickerItem[]> {
  // Ticker items are derived from the latest articles/signals.
  // TODO: replace with a DB query once a `ticker_items` view or table is introduced.
  return [];
}
