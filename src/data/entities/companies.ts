/**
 * Omterminal — Company Entity Registry
 *
 * Canonical list of AI companies tracked by the intelligence platform.
 * Used to normalise company names across ingested articles and events,
 * and to power entity linking in the intelligence pipeline.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Type definition
// ─────────────────────────────────────────────────────────────────────────────

export type CompanyEntitySector =
  | 'foundation_models'
  | 'applied_ai'
  | 'ai_infrastructure'
  | 'semiconductors'
  | 'robotics'
  | 'enterprise_software'
  | 'consumer'
  | 'ai_safety'
  | 'other';

export interface CompanyEntity {
  /** Stable machine-friendly identifier */
  id: string;
  /** Canonical company name used for normalisation */
  name: string;
  /** Headquarters country (ISO 3166-1 alpha-2 or named region) */
  country: string;
  /** Primary industry sector */
  sector: CompanyEntitySector;
  /** Company website */
  website: string;
  /** Known aliases used in news coverage (for entity resolution) */
  aliases?: string[];
  /** Stock ticker if publicly traded */
  ticker?: string;
  /** Year founded */
  founded?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Company Registry
// ─────────────────────────────────────────────────────────────────────────────

export const COMPANIES: CompanyEntity[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    country: 'US',
    sector: 'foundation_models',
    website: 'https://openai.com',
    aliases: ['Open AI'],
    founded: 2015,
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    country: 'US',
    sector: 'foundation_models',
    website: 'https://anthropic.com',
    founded: 2021,
  },
  {
    id: 'google_deepmind',
    name: 'Google DeepMind',
    country: 'GB',
    sector: 'foundation_models',
    website: 'https://deepmind.google',
    aliases: ['DeepMind', 'Google Brain'],
    ticker: 'GOOGL',
    founded: 2023,
  },
  {
    id: 'meta_ai',
    name: 'Meta AI',
    country: 'US',
    sector: 'foundation_models',
    website: 'https://ai.meta.com',
    aliases: ['Meta Platforms AI', 'Facebook AI Research', 'FAIR'],
    ticker: 'META',
    founded: 2023,
  },
  {
    id: 'mistral_ai',
    name: 'Mistral AI',
    country: 'FR',
    sector: 'foundation_models',
    website: 'https://mistral.ai',
    founded: 2023,
  },
  {
    id: 'cohere',
    name: 'Cohere',
    country: 'CA',
    sector: 'foundation_models',
    website: 'https://cohere.com',
    founded: 2019,
  },
  {
    id: 'stability_ai',
    name: 'Stability AI',
    country: 'GB',
    sector: 'foundation_models',
    website: 'https://stability.ai',
    aliases: ['StabilityAI'],
    founded: 2020,
  },
  {
    id: 'xai',
    name: 'xAI',
    country: 'US',
    sector: 'foundation_models',
    website: 'https://x.ai',
    aliases: ['Elon Musk AI', 'X AI'],
    founded: 2023,
  },
  {
    id: 'perplexity',
    name: 'Perplexity AI',
    country: 'US',
    sector: 'applied_ai',
    website: 'https://perplexity.ai',
    aliases: ['Perplexity'],
    founded: 2022,
  },
  {
    id: 'nvidia',
    name: 'NVIDIA',
    country: 'US',
    sector: 'semiconductors',
    website: 'https://nvidia.com',
    aliases: ['Nvidia'],
    ticker: 'NVDA',
    founded: 1993,
  },
  {
    id: 'microsoft',
    name: 'Microsoft',
    country: 'US',
    sector: 'enterprise_software',
    website: 'https://microsoft.com',
    aliases: ['MSFT'],
    ticker: 'MSFT',
    founded: 1975,
  },
  {
    id: 'scale_ai',
    name: 'Scale AI',
    country: 'US',
    sector: 'ai_infrastructure',
    website: 'https://scale.com',
    aliases: ['Scale'],
    founded: 2016,
  },
  {
    id: 'hugging_face',
    name: 'Hugging Face',
    country: 'US',
    sector: 'ai_infrastructure',
    website: 'https://huggingface.co',
    aliases: ['HuggingFace'],
    founded: 2016,
  },
  {
    id: 'together_ai',
    name: 'Together AI',
    country: 'US',
    sector: 'ai_infrastructure',
    website: 'https://together.ai',
    aliases: ['Together'],
    founded: 2022,
  },
  {
    id: 'inflection_ai',
    name: 'Inflection AI',
    country: 'US',
    sector: 'foundation_models',
    website: 'https://inflection.ai',
    founded: 2022,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Look up a company by its stable id */
export function getCompanyById(id: string): CompanyEntity | undefined {
  return COMPANIES.find((c) => c.id === id);
}

/**
 * Resolve a free-text company name (from an article or event) to the canonical
 * CompanyEntity by matching against id, name, and known aliases.
 */
export function resolveCompany(nameOrAlias: string): CompanyEntity | undefined {
  const normalised = nameOrAlias.toLowerCase().trim();
  return COMPANIES.find(
    (c) =>
      c.id === normalised ||
      c.name.toLowerCase() === normalised ||
      c.aliases?.some((a) => a.toLowerCase() === normalised)
  );
}

export default COMPANIES;
