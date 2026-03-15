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

  // ── arXiv preprint server (4 categories) ─────────────────────────────────

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

  // ── Academic research labs (5) ────────────────────────────────────────────

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
    enabled: true,
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
];
