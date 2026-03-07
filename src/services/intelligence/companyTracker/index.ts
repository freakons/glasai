/**
 * Company Tracker — intelligence on AI company developments.
 *
 * Tracks: product launches, leadership changes, partnerships,
 * benchmark performance, team changes, acquisitions.
 *
 * Future data sources: Crunchbase API, press releases, SEC filings.
 */

import type { IntelligenceEvent } from '@/types';
import { createEvent } from '@/types';
import { fetchArticles } from '@/lib/dataService';

export interface CompanyProfile {
  id: string;
  name: string;
  icon: string;
  type: string;
  valuation: string;
  founded: string;
  hq: string;
  eventCount: number;
}

/** Get all company-related intelligence events from the feed */
export async function getCompanyEvents(company?: string): Promise<IntelligenceEvent[]> {
  const articles = await fetchArticles();

  return articles
    .filter((a) => !company || a.title.toLowerCase().includes(company.toLowerCase()))
    .map((a) =>
      createEvent({
        id: String(a.id),
        type: 'company',
        company: extractCompany(a.title),
        title: a.title,
        date: a.date,
        summary: a.body,
        analysis: a.sowhat,
        tags: [a.cat, extractCompany(a.title).toLowerCase()],
        severity: 'medium',
        sourceUrl: a.sourceUrl,
        verified: a.verified,
        slug: String(a.id),
      })
    );
}

/** Get company profiles (seed data — future: from database) */
export function getCompanyProfiles(): CompanyProfile[] {
  return COMPANIES;
}

/** Extract company name from article title (simple heuristic) */
function extractCompany(title: string): string {
  const companies = [
    'OpenAI', 'Anthropic', 'Google', 'DeepMind', 'Meta', 'Microsoft',
    'Mistral', 'xAI', 'Cohere', 'Perplexity', 'Stability AI', 'Inflection',
    'Amazon', 'Apple', 'NVIDIA', 'Hugging Face', 'Databricks', 'Scale AI',
  ];
  for (const co of companies) {
    if (title.toLowerCase().includes(co.toLowerCase())) return co;
  }
  return 'Unknown';
}

const COMPANIES: CompanyProfile[] = [
  { id: 'openai', name: 'OpenAI', icon: '🟢', type: 'Foundation Model', valuation: '$340B', founded: '2015', hq: 'San Francisco', eventCount: 3 },
  { id: 'anthropic', name: 'Anthropic', icon: '🟣', type: 'AI Safety Lab', valuation: '$61B', founded: '2021', hq: 'San Francisco', eventCount: 2 },
  { id: 'google-deepmind', name: 'Google DeepMind', icon: '🔵', type: 'Research Lab', valuation: 'Alphabet subsidiary', founded: '2010', hq: 'London', eventCount: 2 },
  { id: 'meta-ai', name: 'Meta AI', icon: '🔷', type: 'Open Source Models', valuation: 'Meta subsidiary', founded: '2013', hq: 'Menlo Park', eventCount: 1 },
  { id: 'mistral', name: 'Mistral AI', icon: '🔶', type: 'Foundation Model', valuation: '€6B', founded: '2023', hq: 'Paris', eventCount: 1 },
  { id: 'xai', name: 'xAI', icon: '⚡', type: 'Foundation Model', valuation: '$50B', founded: '2023', hq: 'Austin', eventCount: 1 },
  { id: 'cohere', name: 'Cohere', icon: '🟤', type: 'Enterprise AI', valuation: '$5.5B', founded: '2019', hq: 'Toronto', eventCount: 1 },
  { id: 'perplexity', name: 'Perplexity', icon: '🔍', type: 'AI Search', valuation: '$9B', founded: '2022', hq: 'San Francisco', eventCount: 1 },
];
