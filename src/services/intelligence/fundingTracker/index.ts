/**
 * Funding Tracker — Intelligence service for AI investment and M&A.
 *
 * Tracks: funding rounds, valuations, M&A activity, investor patterns.
 * Future: automated ingestion from Crunchbase API and SEC filings.
 */

import { fetchFundingRounds, type FundingRound } from '@/lib/dataService';

export interface FundingTrend {
  period: string;
  totalAmount: string;
  dealCount: number;
  topSector: string;
}

export async function getLatestFunding(): Promise<FundingRound[]> {
  return fetchFundingRounds();
}

export async function getFundingByCompany(company: string): Promise<FundingRound[]> {
  const rounds = await fetchFundingRounds();
  return rounds.filter(r => r.company.toLowerCase().includes(company.toLowerCase()));
}

/** Placeholder for future: funding trend analysis */
export async function getFundingTrends(): Promise<FundingTrend[]> {
  // Future: aggregate funding data by period for trend analysis
  return [];
}
