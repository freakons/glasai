/**
 * News Sources
 *
 * Tech media outlets, AI-focused newsletters, industry analysts,
 * and venture capital firms producing AI content.
 *
 * Reliability guide:
 *    8 — Established technology / business news outlet
 *    7 — Reputable VC firm or well-known industry publication
 *    6 — Independent newsletter, analyst commentary, or industry blog
 */

import type { SourceDefinition } from '@/types/sources';

export const newsSources: SourceDefinition[] = [

  // ── Tech media & newsletters (10) ─────────────────────────────────────────

  {
    id: 'techcrunch_ai',
    name: 'TechCrunch AI',
    type: 'rss',
    category: 'news',
    url: 'https://techcrunch.com/tag/artificial-intelligence/feed/',
    reliability: 8,
    enabled: true,
  },
  {
    id: 'venturebeat_ai',
    name: 'VentureBeat AI',
    type: 'rss',
    category: 'news',
    url: 'https://venturebeat.com/category/ai/feed/',
    reliability: 8,
    enabled: true,
  },
  {
    id: 'mit_tech_review_ai',
    name: 'MIT Technology Review AI',
    type: 'rss',
    category: 'news',
    url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed/',
    reliability: 8,
    enabled: true,
  },
  {
    id: 'semafor_ai',
    name: 'Semafor AI',
    type: 'rss',
    category: 'news',
    url: 'https://www.semafor.com/vertical/technology/rss',
    reliability: 8,
    enabled: true,
  },
  {
    id: 'the_information',
    name: 'The Information',
    type: 'rss',
    category: 'news',
    url: 'https://www.theinformation.com/feed',
    reliability: 8,
    enabled: true,
  },
  {
    id: 'import_ai',
    name: 'Import AI (Jack Clark)',
    type: 'rss',
    category: 'news',
    url: 'https://importai.substack.com/feed',
    reliability: 6,
    enabled: true,
  },
  {
    id: 'ai_snake_oil',
    name: 'AI Snake Oil (Princeton)',
    type: 'rss',
    category: 'news',
    url: 'https://aisnakeoil.substack.com/feed',
    reliability: 6,
    enabled: true,
  },
  {
    id: 'interconnects',
    name: 'Interconnects (Nathan Lambert)',
    type: 'rss',
    category: 'news',
    url: 'https://www.interconnects.ai/feed',
    reliability: 6,
    enabled: true,
  },
  {
    id: 'stratechery',
    name: 'Stratechery',
    type: 'rss',
    category: 'news',
    url: 'https://stratechery.com/feed/',
    reliability: 6,
    enabled: true,
  },
  {
    id: 'the_verge_ai',
    name: 'The Verge AI',
    type: 'rss',
    category: 'news',
    url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
    reliability: 8,
    enabled: true,
  },

  // ── Venture capital & funding intelligence (8) ────────────────────────────

  {
    id: 'crunchbase_ai',
    name: 'Crunchbase News AI',
    type: 'rss',
    category: 'news',
    url: 'https://news.crunchbase.com/tag/artificial-intelligence/feed/',
    reliability: 6,
    enabled: true,
  },
  {
    id: 'sequoia_ai',
    name: 'Sequoia Capital AI Perspectives',
    type: 'rss',
    category: 'news',
    url: 'https://www.sequoiacap.com/our-views/rss/',
    reliability: 7,
    enabled: true,
  },
  {
    id: 'a16z_ai',
    name: 'Andreessen Horowitz AI',
    type: 'rss',
    category: 'news',
    url: 'https://a16z.com/tag/ai/feed/',
    reliability: 7,
    enabled: true,
  },
  {
    id: 'lightspeed_blog',
    name: 'Lightspeed Venture Partners Blog',
    type: 'rss',
    category: 'news',
    url: 'https://lsvp.com/feed/',
    reliability: 6,
    enabled: true,
  },
  {
    id: 'general_catalyst_blog',
    name: 'General Catalyst Insights',
    type: 'rss',
    category: 'news',
    url: 'https://www.generalcatalyst.com/perspectives/rss',
    reliability: 6,
    enabled: true,
  },
  {
    id: 'first_round_review',
    name: 'First Round Review',
    type: 'rss',
    category: 'news',
    url: 'https://review.firstround.com/feed.xml',
    reliability: 6,
    enabled: true,
  },
  {
    id: 'techcrunch_venture',
    name: 'TechCrunch Venture',
    type: 'rss',
    category: 'news',
    url: 'https://techcrunch.com/tag/venture-capital/feed/',
    reliability: 8,
    enabled: true,
  },
  {
    id: 'ai_fund_news',
    name: 'AI Fund Blog',
    type: 'rss',
    category: 'news',
    url: 'https://aifund.ai/blog/feed/',
    reliability: 6,
    enabled: true,
  },
];
