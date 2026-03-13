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
    aliases: ['Open AI', 'OpenAI Inc', 'OpenAI Inc.'],
    founded: 2015,
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    country: 'US',
    sector: 'foundation_models',
    website: 'https://anthropic.com',
    aliases: ['Anthropic AI', 'Anthropic PBC'],
    founded: 2021,
  },
  {
    id: 'google_deepmind',
    name: 'Google DeepMind',
    country: 'GB',
    sector: 'foundation_models',
    website: 'https://deepmind.google',
    aliases: ['DeepMind', 'Google Brain', 'Google AI', 'Alphabet AI'],
    ticker: 'GOOGL',
    founded: 2023,
  },
  {
    id: 'meta_ai',
    name: 'Meta AI',
    country: 'US',
    sector: 'foundation_models',
    website: 'https://ai.meta.com',
    aliases: ['Meta Platforms AI', 'Facebook AI Research', 'Meta Platforms', 'Meta'],
    ticker: 'META',
    founded: 2023,
  },
  {
    id: 'mistral_ai',
    name: 'Mistral AI',
    country: 'FR',
    sector: 'foundation_models',
    website: 'https://mistral.ai',
    aliases: ['Mistral', 'MistralAI'],
    founded: 2023,
  },
  {
    id: 'cohere',
    name: 'Cohere',
    country: 'CA',
    sector: 'foundation_models',
    website: 'https://cohere.com',
    aliases: ['Cohere AI', 'Cohere Inc'],
    founded: 2019,
  },
  {
    id: 'stability_ai',
    name: 'Stability AI',
    country: 'GB',
    sector: 'foundation_models',
    website: 'https://stability.ai',
    aliases: ['StabilityAI', 'Stability'],
    founded: 2020,
  },
  {
    id: 'xai',
    name: 'xAI',
    country: 'US',
    sector: 'foundation_models',
    website: 'https://x.ai',
    aliases: ['Elon Musk AI', 'X AI', 'x.ai'],
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
    aliases: ['Nvidia', 'NVDA'],
    ticker: 'NVDA',
    founded: 1993,
  },
  {
    id: 'microsoft',
    name: 'Microsoft',
    country: 'US',
    sector: 'enterprise_software',
    website: 'https://microsoft.com',
    aliases: ['Microsoft Corp', 'Microsoft Corporation', 'MSFT'],
    ticker: 'MSFT',
    founded: 1975,
  },
  {
    id: 'amazon',
    name: 'Amazon',
    country: 'US',
    sector: 'enterprise_software',
    website: 'https://aws.amazon.com',
    aliases: ['Amazon Web Services', 'AWS', 'Amazon AI'],
    ticker: 'AMZN',
    founded: 1994,
  },
  {
    id: 'apple',
    name: 'Apple',
    country: 'US',
    sector: 'consumer',
    website: 'https://apple.com',
    aliases: ['Apple Inc', 'Apple Intelligence'],
    ticker: 'AAPL',
    founded: 1976,
  },
  {
    id: 'samsung',
    name: 'Samsung',
    country: 'KR',
    sector: 'semiconductors',
    website: 'https://samsung.com',
    aliases: ['Samsung Electronics', 'Samsung AI'],
    founded: 1938,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    country: 'CN',
    sector: 'foundation_models',
    website: 'https://deepseek.com',
    aliases: ['Deep Seek', 'DeepSeek AI'],
    founded: 2023,
  },
  {
    id: 'baidu',
    name: 'Baidu',
    country: 'CN',
    sector: 'foundation_models',
    website: 'https://baidu.com',
    aliases: ['Baidu AI', 'Baidu Inc'],
    founded: 2000,
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
    aliases: ['HuggingFace', 'Hugging Face Inc'],
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
    aliases: ['Inflection'],
    founded: 2022,
  },
  {
    id: 'databricks',
    name: 'Databricks',
    country: 'US',
    sector: 'ai_infrastructure',
    website: 'https://databricks.com',
    aliases: ['Databricks Inc', 'Mosaic ML', 'MosaicML'],
    founded: 2013,
  },
  {
    id: 'ai21_labs',
    name: 'AI21 Labs',
    country: 'IL',
    sector: 'foundation_models',
    website: 'https://ai21.com',
    aliases: ['AI21', 'AI21Labs'],
    founded: 2017,
  },
  {
    id: 'character_ai',
    name: 'Character.AI',
    country: 'US',
    sector: 'consumer',
    website: 'https://character.ai',
    aliases: ['Character AI', 'CharacterAI'],
    founded: 2021,
  },
  {
    id: 'runway',
    name: 'Runway',
    country: 'US',
    sector: 'applied_ai',
    website: 'https://runwayml.com',
    aliases: ['Runway ML', 'RunwayML'],
    founded: 2018,
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
 *
 * Uses normalized comparison to handle punctuation/casing variants:
 *   "Open AI" → OpenAI, "deepmind" → Google DeepMind, etc.
 */
export function resolveCompany(nameOrAlias: string): CompanyEntity | undefined {
  const normalised = normalizeForMatch(nameOrAlias);
  return COMPANIES.find(
    (c) =>
      c.id === normalised ||
      normalizeForMatch(c.name) === normalised ||
      c.aliases?.some((a) => normalizeForMatch(a) === normalised)
  );
}

/** Normalize a name for matching: lowercase, strip punctuation, collapse spaces. */
function normalizeForMatch(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[-_.,:;'"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export default COMPANIES;
