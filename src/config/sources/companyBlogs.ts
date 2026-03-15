/**
 * Company Blog Sources
 *
 * Official blogs from AI model labs, major tech companies,
 * and AI infrastructure/tooling providers.
 *
 * Reliability guide:
 *   10 — Primary AI model lab (direct source for model releases, research)
 *    8 — Official cloud/hardware/MLOps company blog
 */

import type { SourceDefinition } from '@/types/sources';

export const companyBlogSources: SourceDefinition[] = [

  // ── AI model labs (12) ───────────────────────────────────────────────────

  {
    id: 'openai_blog',
    name: 'OpenAI Blog',
    type: 'rss',
    category: 'company',
    url: 'https://openai.com/blog/rss',
    reliability: 10,
    enabled: true,
  },
  {
    id: 'anthropic_news',
    name: 'Anthropic Blog',
    type: 'rss',
    category: 'company',
    url: 'https://www.anthropic.com/rss.xml',
    reliability: 10,
    enabled: true,
  },
  {
    id: 'deepmind_blog',
    name: 'Google DeepMind Blog',
    type: 'rss',
    category: 'company',
    url: 'https://deepmind.google/blog/rss.xml',
    reliability: 10,
    enabled: true,
  },
  {
    id: 'meta_ai_blog',
    name: 'Meta AI Blog',
    type: 'rss',
    category: 'company',
    url: 'https://ai.meta.com/blog/rss/',
    reliability: 10,
    enabled: true,
  },
  {
    id: 'nvidia_developer_blog',
    name: 'NVIDIA Developer Blog',
    type: 'rss',
    category: 'company',
    url: 'https://developer.nvidia.com/blog/feed/',
    reliability: 10,
    enabled: true,
  },
  {
    id: 'microsoft_ai_blog',
    name: 'Microsoft AI Blog',
    type: 'rss',
    category: 'company',
    url: 'https://blogs.microsoft.com/ai/feed/',
    reliability: 10,
    enabled: true,
  },
  {
    id: 'google_ai_blog',
    name: 'Google AI Blog',
    type: 'rss',
    category: 'company',
    url: 'https://blog.google/technology/ai/rss/',
    reliability: 10,
    enabled: true,
  },
  {
    id: 'mistral_ai_blog',
    name: 'Mistral AI Blog',
    type: 'rss',
    category: 'company',
    url: 'https://mistral.ai/news/rss',
    reliability: 10,
    enabled: true,
  },
  {
    id: 'cohere_blog',
    name: 'Cohere Blog',
    type: 'rss',
    category: 'company',
    url: 'https://cohere.com/blog/rss',
    reliability: 10,
    enabled: true,
  },
  {
    id: 'stability_ai_blog',
    name: 'Stability AI Blog',
    type: 'rss',
    category: 'company',
    url: 'https://stability.ai/news/rss',
    reliability: 10,
    enabled: true,
  },
  {
    id: 'xai_blog',
    name: 'xAI Blog',
    type: 'rss',
    category: 'company',
    url: 'https://x.ai/blog/rss',
    reliability: 10,
    enabled: true,
  },
  {
    id: 'perplexity_blog',
    name: 'Perplexity AI Blog',
    type: 'rss',
    category: 'company',
    url: 'https://blog.perplexity.ai/rss',
    reliability: 10,
    enabled: true,
  },

  // ── Infrastructure & MLOps company blogs (5) ──────────────────────────────

  {
    id: 'aws_ml_blog',
    name: 'AWS Machine Learning Blog',
    type: 'rss',
    category: 'company',
    url: 'https://aws.amazon.com/blogs/machine-learning/feed/',
    reliability: 8,
    enabled: true,
  },
  {
    id: 'ibm_research_blog',
    name: 'IBM Research Blog',
    type: 'rss',
    category: 'company',
    url: 'https://research.ibm.com/blog/rss',
    reliability: 8,
    enabled: true,
  },
  {
    id: 'weights_biases_blog',
    name: 'Weights & Biases Blog',
    type: 'rss',
    category: 'company',
    url: 'https://wandb.ai/fully-connected/rss.xml',
    reliability: 7,
    enabled: true,
  },
  {
    id: 'lightning_ai_blog',
    name: 'Lightning AI Blog',
    type: 'rss',
    category: 'company',
    url: 'https://lightning.ai/blog/feed/',
    reliability: 7,
    enabled: true,
  },
  {
    id: 'semiconductor_engineering',
    name: 'Semiconductor Engineering AI',
    type: 'rss',
    category: 'company',
    url: 'https://semiengineering.com/category/artificial-intelligence/feed/',
    reliability: 7,
    enabled: true,
  },
];
