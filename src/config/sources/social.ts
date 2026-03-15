/**
 * Social Sources
 *
 * Social media accounts, community feeds, and platform-based signals
 * from key AI researchers, executives, and organisations.
 *
 * Source type: "rss"
 * Category: "social"
 *
 * Reliability guide:
 *   10 — Primary AI lab leaders
 *    9 — Major researchers / founders
 *    8 — Ecosystem developers / AI companies
 *    7 — Secondary commentators
 *
 * NOTE (2026-03): All nitter.net-based sources have been disabled.
 * Nitter (the open-source Twitter/X frontend) shut down in early 2024
 * and no longer provides RSS feeds for X/Twitter accounts.
 * These sources are preserved but disabled so they can be re-enabled
 * if a replacement X-to-RSS proxy becomes available.
 * To re-enable: replace the nitter.net URL with a working RSS proxy
 * and set enabled: true.
 */

import type { SourceDefinition } from '@/types/sources';

export const socialSources: SourceDefinition[] = [

  // ── Part A: AI Lab Leaders (reliability 10) ───────────────────────────────
  // DISABLED: nitter.net shut down in early 2024

  {
    id: 'social_sama',
    name: 'Sam Altman',
    type: 'rss',
    category: 'social',
    url: 'https://nitter.net/sama/rss',
    entity: 'sama',
    reliability: 10,
    enabled: false,
  },
  {
    id: 'social_darioamodei',
    name: 'Dario Amodei',
    type: 'rss',
    category: 'social',
    url: 'https://nitter.net/darioamodei/rss',
    entity: 'darioamodei',
    reliability: 10,
    enabled: false,
  },
  {
    id: 'social_demishassabis',
    name: 'Demis Hassabis',
    type: 'rss',
    category: 'social',
    url: 'https://nitter.net/demishassabis/rss',
    entity: 'demishassabis',
    reliability: 10,
    enabled: false,
  },
  {
    id: 'social_karpathy',
    name: 'Andrej Karpathy',
    type: 'rss',
    category: 'social',
    url: 'https://nitter.net/karpathy/rss',
    entity: 'karpathy',
    reliability: 10,
    enabled: false,
  },
  {
    id: 'social_ilyasut',
    name: 'Ilya Sutskever',
    type: 'rss',
    category: 'social',
    url: 'https://nitter.net/ilyasut/rss',
    entity: 'ilyasut',
    reliability: 10,
    enabled: false,
  },
  {
    id: 'social_jensenhuang',
    name: 'Jensen Huang',
    type: 'rss',
    category: 'social',
    url: 'https://nitter.net/jensenhuang/rss',
    entity: 'jensenhuang',
    reliability: 10,
    enabled: false,
  },

  // ── Part B: AI Researchers (reliability 9) ────────────────────────────────
  // DISABLED: nitter.net shut down in early 2024

  {
    id: 'social_ylecun',
    name: 'Yann LeCun',
    type: 'rss',
    category: 'social',
    url: 'https://nitter.net/ylecun/rss',
    entity: 'ylecun',
    reliability: 9,
    enabled: false,
  },
  {
    id: 'social_ruder',
    name: 'Sebastian Ruder',
    type: 'rss',
    category: 'social',
    url: 'https://nitter.net/ruder/rss',
    entity: 'ruder',
    reliability: 9,
    enabled: false,
  },
  {
    id: 'social_jeremyphoward',
    name: 'Jeremy Howard',
    type: 'rss',
    category: 'social',
    url: 'https://nitter.net/jeremyphoward/rss',
    entity: 'jeremyphoward',
    reliability: 9,
    enabled: false,
  },
  {
    id: 'social_lilianweng',
    name: 'Lilian Weng',
    type: 'rss',
    category: 'social',
    url: 'https://nitter.net/lilianweng/rss',
    entity: 'lilianweng',
    reliability: 9,
    enabled: false,
  },
  {
    id: 'social_chipro',
    name: 'Chip Huyen',
    type: 'rss',
    category: 'social',
    url: 'https://nitter.net/chipro/rss',
    entity: 'chipro',
    reliability: 9,
    enabled: false,
  },

  // ── Part C: Builders / Developers (reliability 8) ─────────────────────────
  // DISABLED: nitter.net shut down in early 2024

  {
    id: 'social_hwchase17',
    name: 'Harrison Chase',
    type: 'rss',
    category: 'social',
    url: 'https://nitter.net/hwchase17/rss',
    entity: 'hwchase17',
    reliability: 8,
    enabled: false,
  },
  {
    id: 'social_officiallogank',
    name: 'Logan Kilpatrick',
    type: 'rss',
    category: 'social',
    url: 'https://nitter.net/OfficialLoganK/rss',
    entity: 'OfficialLoganK',
    reliability: 8,
    enabled: false,
  },
  {
    id: 'social_huggingface',
    name: 'HuggingFace',
    type: 'rss',
    category: 'social',
    url: 'https://nitter.net/huggingface/rss',
    entity: 'huggingface',
    reliability: 8,
    enabled: false,
  },
  {
    id: 'social_langchainai',
    name: 'LangChain',
    type: 'rss',
    category: 'social',
    url: 'https://nitter.net/langchainai/rss',
    entity: 'langchainai',
    reliability: 8,
    enabled: false,
  },
  {
    id: 'social_ollama',
    name: 'Ollama',
    type: 'rss',
    category: 'social',
    url: 'https://nitter.net/ollama/rss',
    entity: 'ollama',
    reliability: 8,
    enabled: false,
  },
  {
    id: 'social_replicate',
    name: 'Replicate',
    type: 'rss',
    category: 'social',
    url: 'https://nitter.net/replicate/rss',
    entity: 'replicate',
    reliability: 8,
    enabled: false,
  },

  // ── Part D: AI Companies (reliability 9 for major labs, 8 for others) ─────
  // DISABLED: nitter.net shut down in early 2024

  {
    id: 'social_openai',
    name: 'OpenAI',
    type: 'rss',
    category: 'social',
    url: 'https://nitter.net/OpenAI/rss',
    entity: 'OpenAI',
    reliability: 9,
    enabled: false,
  },
  {
    id: 'social_anthropicai',
    name: 'Anthropic',
    type: 'rss',
    category: 'social',
    url: 'https://nitter.net/AnthropicAI/rss',
    entity: 'AnthropicAI',
    reliability: 9,
    enabled: false,
  },
  {
    id: 'social_googledeepmind',
    name: 'Google DeepMind',
    type: 'rss',
    category: 'social',
    url: 'https://nitter.net/GoogleDeepMind/rss',
    entity: 'GoogleDeepMind',
    reliability: 9,
    enabled: false,
  },
  {
    id: 'social_stabilityai',
    name: 'Stability AI',
    type: 'rss',
    category: 'social',
    url: 'https://nitter.net/StabilityAI/rss',
    entity: 'StabilityAI',
    reliability: 8,
    enabled: false,
  },
  {
    id: 'social_perplexity_ai',
    name: 'Perplexity AI',
    type: 'rss',
    category: 'social',
    url: 'https://nitter.net/perplexity_ai/rss',
    entity: 'perplexity_ai',
    reliability: 8,
    enabled: false,
  },
  {
    id: 'social_mistralai',
    name: 'Mistral AI',
    type: 'rss',
    category: 'social',
    url: 'https://nitter.net/MistralAI/rss',
    entity: 'MistralAI',
    reliability: 8,
    enabled: false,
  },

];
