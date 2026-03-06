export interface Article {
  id: number;
  cat: 'funding' | 'models' | 'agents' | 'regulation' | 'research' | 'product';
  title: string;
  body: string;
  full: string;
  sowhat: string;
  source: string;
  sourceUrl: string;
  date: string;
  verified: boolean;
  featured?: boolean;
  stats?: { n: string; l: string }[];
  _live?: boolean;
}

/**
 * Seed data — curated intelligence articles.
 * In production, this will be replaced by database queries via the data service layer.
 */
export const NEWS: Article[] = [
  {
    id: 1, cat: 'models', title: 'Anthropic Launches Claude Opus 4 with Extended Thinking',
    body: 'Anthropic released Claude Opus 4, its most capable model to date, featuring extended thinking for complex multi-step reasoning tasks.',
    full: '<p>Anthropic released Claude Opus 4, its most capable model to date, featuring extended thinking. The model demonstrates significant improvements in coding, mathematics, and agentic workflows. Extended thinking allows the model to reason through complex problems step-by-step before responding.</p><p>Key improvements include 50% better performance on agentic coding tasks, improved instruction following, and the ability to use tools while thinking. The model is available via API and Claude.ai.</p>',
    sowhat: 'If you run AI workloads, Opus 4 changes the cost-performance math. Extended thinking means fewer prompt engineering hacks and more reliable outputs for production systems. Test your critical workflows against Opus 4 benchmarks before committing.',
    source: 'Anthropic', sourceUrl: 'https://anthropic.com', date: 'Feb 25, 2026', verified: true, featured: true,
    stats: [{ n: '50%', l: 'Coding improvement' }, { n: '#1', l: 'On SWE-bench' }, { n: '200K', l: 'Context window' }],
  },
  {
    id: 2, cat: 'funding', title: 'OpenAI Closes $40B Round at $340B Valuation',
    body: 'OpenAI completed a historic $40 billion funding round led by SoftBank, valuing the company at $340 billion — the largest private tech raise ever.',
    full: '<p>OpenAI completed a $40 billion funding round led by SoftBank, making it the most valuable private company in the world at $340 billion. The round signals massive investor confidence in AGI development timelines.</p>',
    sowhat: 'This valuation sets the ceiling for every AI startup fundraise. If you\'re raising, your comp table just changed. If you\'re competing, this is $40B more in resources pointed at your market.',
    source: 'Financial Times', sourceUrl: 'https://ft.com', date: 'Mar 1, 2026', verified: true,
  },
  {
    id: 3, cat: 'regulation', title: 'EU AI Act Full Enforcement Begins',
    body: 'The European Union\'s AI Act enters full enforcement, requiring compliance from all AI systems operating in EU markets with significant penalties for violations.',
    full: '<p>The EU AI Act has entered full enforcement phase. All high-risk AI systems must now comply with transparency, documentation, and human oversight requirements. Penalties for non-compliance reach up to 7% of global revenue.</p>',
    sowhat: 'If you deploy AI in EU markets, compliance is no longer optional. Review your risk classification immediately. High-risk systems need documentation, human oversight, and conformity assessments.',
    source: 'European Commission', sourceUrl: 'https://ec.europa.eu', date: 'Feb 28, 2026', verified: true,
  },
  {
    id: 4, cat: 'agents', title: 'Google DeepMind Unveils Gemini Agent Framework',
    body: 'Google DeepMind released an open-source agent framework built on Gemini, enabling autonomous multi-step task completion with tool use.',
    full: '<p>Google DeepMind released an agent framework that enables Gemini models to autonomously complete complex tasks. The framework supports tool use, memory, and multi-step planning.</p>',
    sowhat: 'Agent frameworks are becoming commoditized. The moat isn\'t the framework — it\'s the data and workflows you build on top. Start building vertical agent solutions now.',
    source: 'Google DeepMind', sourceUrl: 'https://deepmind.google', date: 'Feb 20, 2026', verified: true,
  },
  {
    id: 5, cat: 'research', title: 'Stanford HAI Report: AI Adoption Hits 78% Among Enterprises',
    body: 'Stanford\'s annual AI Index finds enterprise AI adoption reached 78% globally, with 45% of organizations now using generative AI in production.',
    full: '<p>The 2026 Stanford AI Index Report reveals enterprise AI adoption has reached 78% globally, up from 55% last year. Generative AI adoption in production jumped from 18% to 45%.</p>',
    sowhat: 'AI is no longer early-adopter territory. If your competitors are in the 78%, you can\'t afford to be in the 22%. Focus on production deployment, not more pilots.',
    source: 'Stanford HAI', sourceUrl: 'https://hai.stanford.edu', date: 'Mar 3, 2026', verified: true,
  },
  {
    id: 6, cat: 'product', title: 'Meta Releases Llama 4 Maverick Open-Weight Model',
    body: 'Meta open-sourced Llama 4 Maverick, a mixture-of-experts model that rivals proprietary alternatives on key benchmarks.',
    full: '<p>Meta released Llama 4 Maverick under a permissive license, making it the most capable open-weight model available. The MoE architecture delivers strong performance at lower inference costs.</p>',
    sowhat: 'Open-weight models at this capability level change the build-vs-buy calculus. If you\'re paying for API access to proprietary models, benchmark Llama 4 Maverick against your workloads.',
    source: 'Meta AI', sourceUrl: 'https://ai.meta.com', date: 'Feb 15, 2026', verified: true,
  },
  {
    id: 7, cat: 'funding', title: 'xAI Raises $6B Series C for Grok Infrastructure',
    body: 'Elon Musk\'s xAI secured $6 billion in Series C funding to expand Grok model training infrastructure and enterprise products.',
    full: '<p>xAI raised $6 billion to build out its training compute cluster and expand Grok\'s enterprise offerings. The round was led by Andreessen Horowitz and Sequoia Capital.</p>',
    sowhat: 'Another multi-billion dollar AI raise signals continued investor appetite. The capital concentration in frontier AI means infrastructure costs are barriers to entry for smaller players.',
    source: 'TechCrunch', sourceUrl: 'https://techcrunch.com', date: 'Feb 12, 2026', verified: true,
  },
  {
    id: 8, cat: 'regulation', title: 'US Senate Passes AI Transparency Act',
    body: 'The US Senate passed bipartisan legislation requiring AI-generated content labeling and algorithmic transparency for systems serving more than 1 million users.',
    full: '<p>The AI Transparency Act passed the Senate with bipartisan support. The law requires AI content labeling, algorithmic auditing, and transparency reports for large-scale AI systems.</p>',
    sowhat: 'If your AI product serves US users at scale, start implementing content provenance tracking now. The 18-month compliance window will move fast.',
    source: 'Reuters', sourceUrl: 'https://reuters.com', date: 'Mar 2, 2026', verified: true,
  },
];

export function getArticlesByCategory(cat: string): Article[] {
  if (cat === 'all') return NEWS;
  return NEWS.filter(a => a.cat === cat);
}

export function getFeaturedArticle(): Article | undefined {
  return NEWS.find(a => a.featured);
}
