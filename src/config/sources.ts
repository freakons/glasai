/**
 * Omterminal — Structured Source Registry
 *
 * Canonical registry of all intelligence sources ingested by the platform.
 * Replaces hardcoded feed arrays throughout the ingestion pipeline with a
 * single, typed, human-readable source list.
 *
 * Categories:
 *   company        — AI companies, model labs, and major tech firms
 *   research       — Academic labs, preprint servers, research institutions
 *   media          — Journalists, analysts, newsletters, tech media
 *   funding        — Venture capital, funding trackers, startup intelligence
 *   policy         — Government bodies, regulators, standards organisations
 *   infrastructure — Chip/hardware vendors, cloud providers, MLOps platforms
 *
 * Priority:
 *   "high"   — Top-tier strategic sources; always ingested first
 *   "normal" — Valuable sources ingested on standard schedule
 *
 * Enabled:
 *   true  — Source is active and will be fetched (default)
 *   false — Source is paused (e.g. feed broken, temporarily unavailable)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Type definitions
// ─────────────────────────────────────────────────────────────────────────────

export type SourceCategory =
  | 'company'
  | 'research'
  | 'media'
  | 'funding'
  | 'policy'
  | 'infrastructure';

export interface Source {
  /** Stable, machine-friendly identifier (snake_case) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Category this source belongs to */
  category: SourceCategory;
  /** RSS or Atom feed URL */
  rss: string;
  /** Ingestion priority */
  priority?: 'high' | 'normal';
  /** Whether this source is actively ingested */
  enabled?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Source Registry (~50 curated AI intelligence sources)
// ─────────────────────────────────────────────────────────────────────────────

export const SOURCES: Source[] = [

  // ── Company Sources (12) ──────────────────────────────────────────────────
  // Model labs and major tech companies building AI products.

  {
    id: 'openai_blog',
    name: 'OpenAI Blog',
    category: 'company',
    rss: 'https://openai.com/blog/rss',
    priority: 'high',
    enabled: true,
  },
  {
    id: 'anthropic_news',
    name: 'Anthropic Blog',
    category: 'company',
    rss: 'https://www.anthropic.com/rss.xml',
    priority: 'high',
    enabled: true,
  },
  {
    id: 'deepmind_blog',
    name: 'Google DeepMind Blog',
    category: 'company',
    rss: 'https://deepmind.google/blog/rss.xml',
    priority: 'high',
    enabled: true,
  },
  {
    id: 'meta_ai_blog',
    name: 'Meta AI Blog',
    category: 'company',
    rss: 'https://ai.meta.com/blog/rss/',
    priority: 'high',
    enabled: true,
  },
  {
    id: 'nvidia_developer_blog',
    name: 'NVIDIA Developer Blog',
    category: 'company',
    rss: 'https://developer.nvidia.com/blog/feed/',
    priority: 'high',
    enabled: true,
  },
  {
    id: 'microsoft_ai_blog',
    name: 'Microsoft AI Blog',
    category: 'company',
    rss: 'https://blogs.microsoft.com/ai/feed/',
    priority: 'normal',
    enabled: true,
  },
  {
    id: 'google_ai_blog',
    name: 'Google AI Blog',
    category: 'company',
    rss: 'https://blog.google/technology/ai/rss/',
    priority: 'normal',
    enabled: true,
  },
  {
    id: 'mistral_ai_blog',
    name: 'Mistral AI Blog',
    category: 'company',
    rss: 'https://mistral.ai/news/rss',
    priority: 'normal',
    enabled: true,
  },
  {
    id: 'cohere_blog',
    name: 'Cohere Blog',
    category: 'company',
    rss: 'https://cohere.com/blog/rss',
    priority: 'normal',
    enabled: true,
  },
  {
    id: 'stability_ai_blog',
    name: 'Stability AI Blog',
    category: 'company',
    rss: 'https://stability.ai/news/rss',
    priority: 'normal',
    enabled: true,
  },
  {
    id: 'xai_blog',
    name: 'xAI Blog',
    category: 'company',
    rss: 'https://x.ai/blog/rss',
    priority: 'normal',
    enabled: true,
  },
  {
    id: 'perplexity_blog',
    name: 'Perplexity AI Blog',
    category: 'company',
    rss: 'https://blog.perplexity.ai/rss',
    priority: 'normal',
    enabled: true,
  },

  // ── Research Sources (10) ─────────────────────────────────────────────────
  // Academic labs, preprint servers, and research institutions.

  {
    id: 'arxiv_ml',
    name: 'arXiv Machine Learning',
    category: 'research',
    rss: 'https://arxiv.org/rss/cs.LG',
    priority: 'high',
    enabled: true,
  },
  {
    id: 'arxiv_ai',
    name: 'arXiv Artificial Intelligence',
    category: 'research',
    rss: 'https://arxiv.org/rss/cs.AI',
    priority: 'normal',
    enabled: true,
  },
  {
    id: 'arxiv_cl',
    name: 'arXiv Computation and Language',
    category: 'research',
    rss: 'https://arxiv.org/rss/cs.CL',
    priority: 'normal',
    enabled: true,
  },
  {
    id: 'arxiv_cv',
    name: 'arXiv Computer Vision',
    category: 'research',
    rss: 'https://arxiv.org/rss/cs.CV',
    priority: 'normal',
    enabled: true,
  },
  {
    id: 'mit_csail',
    name: 'MIT CSAIL News',
    category: 'research',
    rss: 'https://www.csail.mit.edu/rss/news',
    priority: 'normal',
    enabled: true,
  },
  {
    id: 'stanford_ai_lab',
    name: 'Stanford AI Lab Blog',
    category: 'research',
    rss: 'https://ai.stanford.edu/blog/feed.xml',
    priority: 'normal',
    enabled: true,
  },
  {
    id: 'bair_blog',
    name: 'Berkeley AI Research (BAIR) Blog',
    category: 'research',
    rss: 'https://bair.berkeley.edu/blog/feed.xml',
    priority: 'normal',
    enabled: true,
  },
  {
    id: 'distill_pub',
    name: 'Distill.pub',
    category: 'research',
    rss: 'https://distill.pub/rss.xml',
    priority: 'normal',
    enabled: true,
  },
  {
    id: 'apple_ml_research',
    name: 'Apple Machine Learning Research',
    category: 'research',
    rss: 'https://machinelearning.apple.com/rss.xml',
    priority: 'normal',
    enabled: true,
  },
  {
    id: 'huggingface_blog',
    name: 'Hugging Face Blog',
    category: 'research',
    rss: 'https://huggingface.co/blog/feed.xml',
    priority: 'high',
    enabled: true,
  },

  // ── Media Sources (10) ────────────────────────────────────────────────────
  // Journalists, analysts, newsletters, and tech media outlets.

  {
    id: 'techcrunch_ai',
    name: 'TechCrunch AI',
    category: 'media',
    rss: 'https://techcrunch.com/tag/artificial-intelligence/feed/',
    priority: 'high',
    enabled: true,
  },
  {
    id: 'venturebeat_ai',
    name: 'VentureBeat AI',
    category: 'media',
    rss: 'https://venturebeat.com/category/ai/feed/',
    priority: 'high',
    enabled: true,
  },
  {
    id: 'mit_tech_review_ai',
    name: 'MIT Technology Review AI',
    category: 'media',
    rss: 'https://www.technologyreview.com/topic/artificial-intelligence/feed/',
    priority: 'high',
    enabled: true,
  },
  {
    id: 'semafor_ai',
    name: 'Semafor AI',
    category: 'media',
    rss: 'https://www.semafor.com/vertical/technology/rss',
    priority: 'normal',
    enabled: true,
  },
  {
    id: 'the_information',
    name: 'The Information',
    category: 'media',
    rss: 'https://www.theinformation.com/feed',
    priority: 'normal',
    enabled: true,
  },
  {
    id: 'import_ai',
    name: 'Import AI (Jack Clark)',
    category: 'media',
    rss: 'https://importai.substack.com/feed',
    priority: 'normal',
    enabled: true,
  },
  {
    id: 'ai_snake_oil',
    name: 'AI Snake Oil (Princeton)',
    category: 'media',
    rss: 'https://aisnakeoil.substack.com/feed',
    priority: 'normal',
    enabled: true,
  },
  {
    id: 'interconnects',
    name: 'Interconnects (Nathan Lambert)',
    category: 'media',
    rss: 'https://www.interconnects.ai/feed',
    priority: 'normal',
    enabled: true,
  },
  {
    id: 'stratechery',
    name: 'Stratechery',
    category: 'media',
    rss: 'https://stratechery.com/feed/',
    priority: 'normal',
    enabled: true,
  },
  {
    id: 'the_verge_ai',
    name: 'The Verge AI',
    category: 'media',
    rss: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
    priority: 'normal',
    enabled: true,
  },

  // ── Funding Sources (8) ───────────────────────────────────────────────────
  // Venture capital, funding trackers, and startup intelligence.

  {
    id: 'crunchbase_ai',
    name: 'Crunchbase News AI',
    category: 'funding',
    rss: 'https://news.crunchbase.com/tag/artificial-intelligence/feed/',
    priority: 'normal',
    enabled: true,
  },
  {
    id: 'sequoia_ai',
    name: 'Sequoia Capital AI Perspectives',
    category: 'funding',
    rss: 'https://www.sequoiacap.com/our-views/rss/',
    priority: 'normal',
    enabled: true,
  },
  {
    id: 'a16z_ai',
    name: 'Andreessen Horowitz AI',
    category: 'funding',
    rss: 'https://a16z.com/tag/ai/feed/',
    priority: 'normal',
    enabled: true,
  },
  {
    id: 'lightspeed_blog',
    name: 'Lightspeed Venture Partners Blog',
    category: 'funding',
    rss: 'https://lsvp.com/feed/',
    priority: 'normal',
    enabled: true,
  },
  {
    id: 'general_catalyst_blog',
    name: 'General Catalyst Insights',
    category: 'funding',
    rss: 'https://www.generalcatalyst.com/perspectives/rss',
    priority: 'normal',
    enabled: true,
  },
  {
    id: 'first_round_review',
    name: 'First Round Review',
    category: 'funding',
    rss: 'https://review.firstround.com/feed.xml',
    priority: 'normal',
    enabled: true,
  },
  {
    id: 'techcrunch_venture',
    name: 'TechCrunch Venture',
    category: 'funding',
    rss: 'https://techcrunch.com/tag/venture-capital/feed/',
    priority: 'normal',
    enabled: true,
  },
  {
    id: 'ai_fund_news',
    name: 'AI Fund Blog',
    category: 'funding',
    rss: 'https://aifund.ai/blog/feed/',
    priority: 'normal',
    enabled: true,
  },

  // ── Policy Sources (5) ────────────────────────────────────────────────────
  // Government bodies, regulators, and standards organisations.

  {
    id: 'eu_ai_office',
    name: 'EU AI Office',
    category: 'policy',
    rss: 'https://digital-strategy.ec.europa.eu/en/policies/artificial-intelligence/rss',
    priority: 'normal',
    enabled: true,
  },
  {
    id: 'whitehouse_ostp',
    name: 'White House OSTP AI Policy',
    category: 'policy',
    rss: 'https://www.whitehouse.gov/ostp/news-updates/feed/',
    priority: 'normal',
    enabled: true,
  },
  {
    id: 'uk_ai_safety_institute',
    name: 'UK AI Safety Institute',
    category: 'policy',
    rss: 'https://www.gov.uk/government/organisations/ai-safety-institute.atom',
    priority: 'normal',
    enabled: true,
  },
  {
    id: 'oecd_ai_policy',
    name: 'OECD AI Policy Observatory',
    category: 'policy',
    rss: 'https://oecd.ai/en/feed',
    priority: 'normal',
    enabled: true,
  },
  {
    id: 'nist_ai',
    name: 'NIST AI Program',
    category: 'policy',
    rss: 'https://www.nist.gov/blogs/taking-measure/rss.xml',
    priority: 'normal',
    enabled: true,
  },

  // ── Infrastructure Sources (5) ────────────────────────────────────────────
  // Chip/hardware vendors, cloud providers, and MLOps platforms.

  {
    id: 'aws_ml_blog',
    name: 'AWS Machine Learning Blog',
    category: 'infrastructure',
    rss: 'https://aws.amazon.com/blogs/machine-learning/feed/',
    priority: 'normal',
    enabled: true,
  },
  {
    id: 'ibm_research_blog',
    name: 'IBM Research Blog',
    category: 'infrastructure',
    rss: 'https://research.ibm.com/blog/rss',
    priority: 'normal',
    enabled: true,
  },
  {
    id: 'weights_biases_blog',
    name: 'Weights & Biases Blog',
    category: 'infrastructure',
    rss: 'https://wandb.ai/fully-connected/rss.xml',
    priority: 'normal',
    enabled: true,
  },
  {
    id: 'lightning_ai_blog',
    name: 'Lightning AI Blog',
    category: 'infrastructure',
    rss: 'https://lightning.ai/blog/feed/',
    priority: 'normal',
    enabled: true,
  },
  {
    id: 'semiconductor_engineering',
    name: 'Semiconductor Engineering AI',
    category: 'infrastructure',
    rss: 'https://semiengineering.com/category/artificial-intelligence/feed/',
    priority: 'normal',
    enabled: true,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns all enabled sources */
export function getEnabledSources(): Source[] {
  return SOURCES.filter((s) => s.enabled !== false);
}

/** Returns all enabled high-priority sources */
export function getHighPrioritySources(): Source[] {
  return SOURCES.filter((s) => s.enabled !== false && s.priority === 'high');
}

/** Returns all enabled sources for a given category */
export function getSourcesByCategory(category: SourceCategory): Source[] {
  return SOURCES.filter((s) => s.enabled !== false && s.category === category);
}

/** Returns a source by its stable id, or undefined if not found */
export function getSourceById(id: string): Source | undefined {
  return SOURCES.find((s) => s.id === id);
}

export default SOURCES;
