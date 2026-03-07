/**
 * Omterminal — Intelligence Source Registry
 *
 * Defines all tracked RSS/feed sources ingested by the intelligence pipeline.
 * Each source is categorised, scored for reliability, and tagged with region.
 *
 * Categories:
 *   model_lab        — AI research labs that build foundation models
 *   big_tech         — Large technology companies with significant AI programs
 *   research         — Academic and independent research institutions
 *   policy           — Government bodies and policy organisations
 *   venture_capital  — Venture capital firms and funding trackers
 *   industry_analysis — Journalists, analysts, and independent media
 */

// ─────────────────────────────────────────────────────────────────────────────
// Type definition
// ─────────────────────────────────────────────────────────────────────────────

export type SourceCategory =
  | 'model_lab'
  | 'big_tech'
  | 'research'
  | 'policy'
  | 'venture_capital'
  | 'industry_analysis';

export interface Source {
  /** Stable, machine-friendly identifier */
  id: string;
  /** Human-readable name of the source */
  name: string;
  /** Category this source belongs to */
  category: SourceCategory;
  /** RSS or Atom feed URL */
  rss: string;
  /** Two-letter ISO 3166-1 country or named region code */
  region?: string;
  /**
   * Reliability score: 1 (low) — 10 (highest).
   * Based on editorial standards, accuracy history, and primary-source proximity.
   */
  reliabilityScore?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Source Registry
// ─────────────────────────────────────────────────────────────────────────────

export const INTELLIGENCE_SOURCES: Source[] = [

  // ── Model Labs ──────────────────────────────────────────────────────────────

  {
    id: 'openai_blog',
    name: 'OpenAI Blog',
    category: 'model_lab',
    rss: 'https://openai.com/blog/rss',
    region: 'US',
    reliabilityScore: 10,
  },
  {
    id: 'anthropic_news',
    name: 'Anthropic News',
    category: 'model_lab',
    rss: 'https://www.anthropic.com/rss.xml',
    region: 'US',
    reliabilityScore: 10,
  },
  {
    id: 'deepmind_blog',
    name: 'Google DeepMind Blog',
    category: 'model_lab',
    rss: 'https://deepmind.google/blog/rss.xml',
    region: 'GB',
    reliabilityScore: 10,
  },
  {
    id: 'meta_ai_blog',
    name: 'Meta AI Blog',
    category: 'model_lab',
    rss: 'https://ai.meta.com/blog/rss/',
    region: 'US',
    reliabilityScore: 9,
  },
  {
    id: 'mistral_ai_blog',
    name: 'Mistral AI Blog',
    category: 'model_lab',
    rss: 'https://mistral.ai/news/rss',
    region: 'FR',
    reliabilityScore: 9,
  },
  {
    id: 'cohere_blog',
    name: 'Cohere Blog',
    category: 'model_lab',
    rss: 'https://cohere.com/blog/rss',
    region: 'CA',
    reliabilityScore: 8,
  },
  {
    id: 'stability_ai_blog',
    name: 'Stability AI Blog',
    category: 'model_lab',
    rss: 'https://stability.ai/news/rss',
    region: 'GB',
    reliabilityScore: 8,
  },
  {
    id: 'xai_blog',
    name: 'xAI Blog',
    category: 'model_lab',
    rss: 'https://x.ai/blog/rss',
    region: 'US',
    reliabilityScore: 8,
  },
  {
    id: 'perplexity_blog',
    name: 'Perplexity AI Blog',
    category: 'model_lab',
    rss: 'https://blog.perplexity.ai/rss',
    region: 'US',
    reliabilityScore: 7,
  },

  // ── Big Tech ─────────────────────────────────────────────────────────────────

  {
    id: 'microsoft_ai_blog',
    name: 'Microsoft AI Blog',
    category: 'big_tech',
    rss: 'https://blogs.microsoft.com/ai/feed/',
    region: 'US',
    reliabilityScore: 9,
  },
  {
    id: 'nvidia_developer_blog',
    name: 'NVIDIA Developer Blog',
    category: 'big_tech',
    rss: 'https://developer.nvidia.com/blog/feed/',
    region: 'US',
    reliabilityScore: 9,
  },
  {
    id: 'amazon_ai_blog',
    name: 'AWS Machine Learning Blog',
    category: 'big_tech',
    rss: 'https://aws.amazon.com/blogs/machine-learning/feed/',
    region: 'US',
    reliabilityScore: 8,
  },
  {
    id: 'google_ai_blog',
    name: 'Google AI Blog',
    category: 'big_tech',
    rss: 'https://blog.google/technology/ai/rss/',
    region: 'US',
    reliabilityScore: 9,
  },
  {
    id: 'ibm_research_blog',
    name: 'IBM Research Blog',
    category: 'big_tech',
    rss: 'https://research.ibm.com/blog/rss',
    region: 'US',
    reliabilityScore: 8,
  },
  {
    id: 'apple_ml_research',
    name: 'Apple Machine Learning Research',
    category: 'big_tech',
    rss: 'https://machinelearning.apple.com/rss.xml',
    region: 'US',
    reliabilityScore: 9,
  },

  // ── Research ─────────────────────────────────────────────────────────────────

  {
    id: 'arxiv_ml',
    name: 'arXiv Machine Learning (cs.LG)',
    category: 'research',
    rss: 'https://arxiv.org/rss/cs.LG',
    region: 'US',
    reliabilityScore: 9,
  },
  {
    id: 'arxiv_ai',
    name: 'arXiv Artificial Intelligence (cs.AI)',
    category: 'research',
    rss: 'https://arxiv.org/rss/cs.AI',
    region: 'US',
    reliabilityScore: 9,
  },
  {
    id: 'mit_csail',
    name: 'MIT CSAIL News',
    category: 'research',
    rss: 'https://www.csail.mit.edu/rss/news',
    region: 'US',
    reliabilityScore: 9,
  },
  {
    id: 'stanford_ai_lab',
    name: 'Stanford AI Lab Blog',
    category: 'research',
    rss: 'https://ai.stanford.edu/blog/feed.xml',
    region: 'US',
    reliabilityScore: 9,
  },
  {
    id: 'bair_blog',
    name: 'Berkeley AI Research (BAIR) Blog',
    category: 'research',
    rss: 'https://bair.berkeley.edu/blog/feed.xml',
    region: 'US',
    reliabilityScore: 9,
  },
  {
    id: 'distill_pub',
    name: 'Distill.pub',
    category: 'research',
    rss: 'https://distill.pub/rss.xml',
    region: 'US',
    reliabilityScore: 10,
  },

  // ── Policy ───────────────────────────────────────────────────────────────────

  {
    id: 'eu_ai_office',
    name: 'EU AI Office',
    category: 'policy',
    rss: 'https://digital-strategy.ec.europa.eu/en/policies/artificial-intelligence/rss',
    region: 'EU',
    reliabilityScore: 10,
  },
  {
    id: 'whitehouse_ostp',
    name: 'White House OSTP AI Policy',
    category: 'policy',
    rss: 'https://www.whitehouse.gov/ostp/news-updates/feed/',
    region: 'US',
    reliabilityScore: 10,
  },
  {
    id: 'uk_ai_safety_institute',
    name: 'UK AI Safety Institute',
    category: 'policy',
    rss: 'https://www.gov.uk/government/organisations/ai-safety-institute.atom',
    region: 'GB',
    reliabilityScore: 10,
  },
  {
    id: 'oecd_ai_policy',
    name: 'OECD AI Policy Observatory',
    category: 'policy',
    rss: 'https://oecd.ai/en/feed',
    region: 'OECD',
    reliabilityScore: 9,
  },
  {
    id: 'nist_ai',
    name: 'NIST AI Program',
    category: 'policy',
    rss: 'https://www.nist.gov/blogs/taking-measure/rss.xml',
    region: 'US',
    reliabilityScore: 9,
  },

  // ── Venture Capital ──────────────────────────────────────────────────────────

  {
    id: 'sequoia_ai',
    name: 'Sequoia Capital AI Perspectives',
    category: 'venture_capital',
    rss: 'https://www.sequoiacap.com/our-views/rss/',
    region: 'US',
    reliabilityScore: 9,
  },
  {
    id: 'a16z_ai',
    name: 'Andreessen Horowitz AI',
    category: 'venture_capital',
    rss: 'https://a16z.com/tag/ai/feed/',
    region: 'US',
    reliabilityScore: 8,
  },
  {
    id: 'lightspeed_blog',
    name: 'Lightspeed Venture Partners Blog',
    category: 'venture_capital',
    rss: 'https://lsvp.com/feed/',
    region: 'US',
    reliabilityScore: 8,
  },
  {
    id: 'crunchbase_ai',
    name: 'Crunchbase News AI',
    category: 'venture_capital',
    rss: 'https://news.crunchbase.com/tag/artificial-intelligence/feed/',
    region: 'US',
    reliabilityScore: 8,
  },
  {
    id: 'general_catalyst_blog',
    name: 'General Catalyst Insights',
    category: 'venture_capital',
    rss: 'https://www.generalcatalyst.com/perspectives/rss',
    region: 'US',
    reliabilityScore: 7,
  },

  // ── Industry Analysis ────────────────────────────────────────────────────────

  {
    id: 'mit_tech_review_ai',
    name: 'MIT Technology Review AI',
    category: 'industry_analysis',
    rss: 'https://www.technologyreview.com/topic/artificial-intelligence/feed/',
    region: 'US',
    reliabilityScore: 9,
  },
  {
    id: 'venturebeat_ai',
    name: 'VentureBeat AI',
    category: 'industry_analysis',
    rss: 'https://venturebeat.com/category/ai/feed/',
    region: 'US',
    reliabilityScore: 8,
  },
  {
    id: 'semafor_ai',
    name: 'Semafor AI',
    category: 'industry_analysis',
    rss: 'https://www.semafor.com/vertical/technology/rss',
    region: 'US',
    reliabilityScore: 8,
  },
  {
    id: 'the_information',
    name: 'The Information',
    category: 'industry_analysis',
    rss: 'https://www.theinformation.com/feed',
    region: 'US',
    reliabilityScore: 9,
  },
  {
    id: 'stratechery',
    name: 'Stratechery',
    category: 'industry_analysis',
    rss: 'https://stratechery.com/feed/',
    region: 'US',
    reliabilityScore: 9,
  },
  {
    id: 'import_ai',
    name: 'Import AI (Jack Clark)',
    category: 'industry_analysis',
    rss: 'https://importai.substack.com/feed',
    region: 'US',
    reliabilityScore: 9,
  },
  {
    id: 'ai_snake_oil',
    name: 'AI Snake Oil (Princeton)',
    category: 'industry_analysis',
    rss: 'https://aisnakeoil.substack.com/feed',
    region: 'US',
    reliabilityScore: 8,
  },
  {
    id: 'interconnects',
    name: 'Interconnects (Nathan Lambert)',
    category: 'industry_analysis',
    rss: 'https://www.interconnects.ai/feed',
    region: 'US',
    reliabilityScore: 8,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns all sources for a given category */
export function getSourcesByCategory(category: SourceCategory): Source[] {
  return INTELLIGENCE_SOURCES.filter((s) => s.category === category);
}

/** Returns a source by its stable id, or undefined if not found */
export function getSourceById(id: string): Source | undefined {
  return INTELLIGENCE_SOURCES.find((s) => s.id === id);
}

export default INTELLIGENCE_SOURCES;
