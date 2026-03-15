/**
 * Research Sources
 *
 * Academic institutions, preprint servers, and research labs.
 * These are high-signal sources for model releases, benchmarks,
 * and foundational AI advances.
 *
 * Reliability guide:
 *    9 — Major research institution / preprint server (primary signal source)
 *    8 — Company research lab or specialist research publication
 */

import type { SourceDefinition } from '@/types/sources';

export const researchSources: SourceDefinition[] = [

  // ── arXiv preprint server (7 categories) ─────────────────────────────────

  {
    id: 'arxiv_ml',
    name: 'arXiv Machine Learning',
    type: 'arxiv',
    category: 'research',
    url: 'https://arxiv.org/rss/cs.LG',
    reliability: 9,
    enabled: true,
  },
  {
    id: 'arxiv_ai',
    name: 'arXiv Artificial Intelligence',
    type: 'arxiv',
    category: 'research',
    url: 'https://arxiv.org/rss/cs.AI',
    reliability: 9,
    enabled: true,
  },
  {
    id: 'arxiv_cl',
    name: 'arXiv Computation and Language',
    type: 'arxiv',
    category: 'research',
    url: 'https://arxiv.org/rss/cs.CL',
    reliability: 9,
    enabled: true,
  },
  {
    id: 'arxiv_cv',
    name: 'arXiv Computer Vision',
    type: 'arxiv',
    category: 'research',
    url: 'https://arxiv.org/rss/cs.CV',
    reliability: 9,
    enabled: true,
  },
  {
    id: 'arxiv_ro',
    name: 'arXiv Robotics',
    type: 'arxiv',
    category: 'research',
    url: 'https://arxiv.org/rss/cs.RO',
    reliability: 9,
    enabled: true,
  },
  {
    id: 'arxiv_ir',
    name: 'arXiv Information Retrieval',
    type: 'arxiv',
    category: 'research',
    url: 'https://arxiv.org/rss/cs.IR',
    reliability: 9,
    enabled: true,
  },
  {
    id: 'arxiv_stat_ml',
    name: 'arXiv Statistics — Machine Learning',
    type: 'arxiv',
    category: 'research',
    url: 'https://arxiv.org/rss/stat.ML',
    reliability: 9,
    enabled: true,
  },

  // ── Academic research labs (9) ────────────────────────────────────────────

  {
    id: 'mit_csail',
    name: 'MIT CSAIL News',
    type: 'rss',
    category: 'research',
    url: 'https://www.csail.mit.edu/rss/news',
    reliability: 9,
    enabled: true,
  },
  {
    id: 'stanford_ai_lab',
    name: 'Stanford AI Lab Blog',
    type: 'rss',
    category: 'research',
    url: 'https://ai.stanford.edu/blog/feed.xml',
    reliability: 9,
    enabled: true,
  },
  {
    id: 'bair_blog',
    name: 'Berkeley AI Research (BAIR) Blog',
    type: 'rss',
    category: 'research',
    url: 'https://bair.berkeley.edu/blog/feed.xml',
    reliability: 9,
    enabled: true,
  },
  {
    id: 'distill_pub',
    name: 'Distill.pub',
    type: 'rss',
    category: 'research',
    url: 'https://distill.pub/rss.xml',
    reliability: 9,
    enabled: false, // Distill.pub discontinued publication in 2021
  },
  {
    id: 'apple_ml_research',
    name: 'Apple Machine Learning Research',
    type: 'rss',
    category: 'research',
    url: 'https://machinelearning.apple.com/rss.xml',
    reliability: 8,
    enabled: true,
  },
  {
    id: 'openreview',
    name: 'OpenReview',
    type: 'rss',
    category: 'research',
    url: 'https://openreview.net/rss',
    reliability: 9,
    enabled: true,
  },
  {
    id: 'google_research_blog',
    name: 'Google Research Blog',
    type: 'rss',
    category: 'research',
    entity: 'Google',
    url: 'https://research.google/blog/rss/',
    reliability: 9,
    enabled: true,
  },
  {
    id: 'microsoft_research_blog',
    name: 'Microsoft Research Blog',
    type: 'rss',
    category: 'research',
    entity: 'Microsoft',
    url: 'https://www.microsoft.com/en-us/research/feed/',
    reliability: 9,
    enabled: true,
  },
  {
    id: 'nvidia_research_blog',
    name: 'NVIDIA Research',
    type: 'rss',
    category: 'research',
    entity: 'NVIDIA',
    url: 'https://research.nvidia.com/rss.xml',
    reliability: 8,
    enabled: true,
  },

  // ── Open research hubs (1) ────────────────────────────────────────────────

  {
    id: 'huggingface_blog',
    name: 'Hugging Face Blog',
    type: 'rss',
    category: 'research',
    url: 'https://huggingface.co/blog/feed.xml',
    reliability: 9,
    enabled: true,
  },

  // ── Research aggregators (10) ─────────────────────────────────────────────

  {
    id: 'papers_with_code',
    name: 'Papers With Code',
    type: 'rss',
    category: 'research',
    entity: 'Papers With Code',
    url: 'https://paperswithcode.com/rss',
    reliability: 10,
    enabled: true,
  },
  {
    id: 'huggingface_papers',
    name: 'HuggingFace Papers',
    type: 'rss',
    category: 'research',
    entity: 'HuggingFace',
    url: 'https://huggingface.co/papers/rss',
    reliability: 10,
    enabled: true,
  },
  {
    id: 'semantic_scholar_ai',
    name: 'Semantic Scholar — Artificial Intelligence',
    type: 'rss',
    category: 'research',
    entity: 'Semantic Scholar',
    url: 'https://www.semanticscholar.org/rss/topic/artificial-intelligence',
    reliability: 10,
    enabled: true,
  },
  {
    id: 'ml_collective',
    name: 'ML Collective',
    type: 'rss',
    category: 'research',
    entity: 'ML Collective',
    url: 'https://mlcollective.org/feed/',
    reliability: 10,
    enabled: true,
  },

  // ── Major AI conferences (9) ──────────────────────────────────────────────

  {
    id: 'neurips_blog',
    name: 'NeurIPS Blog',
    type: 'rss',
    category: 'research',
    entity: 'NeurIPS',
    url: 'https://neurips.cc/feeds/blog.xml',
    reliability: 9,
    enabled: true,
  },
  {
    id: 'icml_blog',
    name: 'ICML Blog',
    type: 'rss',
    category: 'research',
    entity: 'ICML',
    url: 'https://icml.cc/feeds/blog.xml',
    reliability: 9,
    enabled: true,
  },
  {
    id: 'iclr_blog',
    name: 'ICLR Blog',
    type: 'rss',
    category: 'research',
    entity: 'ICLR',
    url: 'https://iclr.cc/feeds/blog.xml',
    reliability: 9,
    enabled: true,
  },
  {
    id: 'cvpr_blog',
    name: 'CVPR Blog',
    type: 'rss',
    category: 'research',
    entity: 'CVPR',
    url: 'https://cvpr.thecvf.com/feeds/blog.xml',
    reliability: 9,
    enabled: true,
  },
  {
    id: 'aaai_blog',
    name: 'AAAI Blog',
    type: 'rss',
    category: 'research',
    entity: 'AAAI',
    url: 'https://aaai.org/feed/',
    reliability: 9,
    enabled: true,
  },

  // ── Benchmark / model tracking (8) ───────────────────────────────────────

  {
    id: 'papers_with_code_trending',
    name: 'Papers With Code Trending',
    type: 'rss',
    category: 'research',
    entity: 'Papers With Code',
    url: 'https://paperswithcode.com/trending/rss',
    reliability: 8,
    enabled: true,
  },
  {
    id: 'huggingface_trending_models',
    name: 'HuggingFace Trending Models',
    type: 'rss',
    category: 'research',
    entity: 'HuggingFace',
    url: 'https://huggingface.co/models?sort=trending&format=rss',
    reliability: 8,
    enabled: true,
  },
  {
    id: 'huggingface_datasets',
    name: 'HuggingFace Datasets',
    type: 'rss',
    category: 'research',
    entity: 'HuggingFace',
    url: 'https://huggingface.co/datasets?format=rss',
    reliability: 8,
    enabled: true,
  },
];
