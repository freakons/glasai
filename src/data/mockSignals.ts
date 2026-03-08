/**
 * Mock signal dataset — intelligence signals detected across the AI ecosystem.
 * Signals represent meaningful moments of change: model launches, funding rounds,
 * regulatory moves, breakthrough research, etc.
 */

export type SignalCategory =
  | 'models'
  | 'funding'
  | 'regulation'
  | 'agents'
  | 'research'
  | 'product';

export interface Signal {
  id: string;
  title: string;
  category: SignalCategory;
  /** Canonical entity ID this signal is attributed to */
  entityId: string;
  entityName: string;
  summary: string;
  /** ISO date string */
  date: string;
  /** Confidence score 0–100 */
  confidence: number;
  /** Optional related signal IDs */
  relatedIds?: string[];
}

export const MOCK_SIGNALS: Signal[] = [
  {
    id: 'sig-001',
    title: 'GPT-5 architecture leak signals imminent launch',
    category: 'models',
    entityId: 'openai',
    entityName: 'OpenAI',
    summary:
      'Multiple sources corroborate a 10T-parameter sparse mixture-of-experts design, expected Q2 launch window.',
    date: '2026-03-05',
    confidence: 82,
    relatedIds: ['sig-007'],
  },
  {
    id: 'sig-002',
    title: 'Anthropic raises $3.5B Series E at $30B valuation',
    category: 'funding',
    entityId: 'anthropic',
    entityName: 'Anthropic',
    summary:
      'Round led by Google and Spark Capital. Proceeds earmarked for interpretability research and compute expansion.',
    date: '2026-03-01',
    confidence: 96,
  },
  {
    id: 'sig-003',
    title: 'EU AI Act enforcement triggers first compliance audit',
    category: 'regulation',
    entityId: 'google_deepmind',
    entityName: 'Google DeepMind',
    summary:
      'European AI Office opens formal review of Gemini Ultra deployment under high-risk AI provisions.',
    date: '2026-02-28',
    confidence: 91,
  },
  {
    id: 'sig-004',
    title: 'Meta AI releases Llama 4 under open-weights licence',
    category: 'models',
    entityId: 'meta_ai',
    entityName: 'Meta AI',
    summary:
      'Llama 4 405B outperforms GPT-4o on MMLU; instruct variant available via Hugging Face immediately.',
    date: '2026-02-25',
    confidence: 99,
    relatedIds: ['sig-009'],
  },
  {
    id: 'sig-005',
    title: 'Mistral AI acquires inference startup Nector for €180M',
    category: 'funding',
    entityId: 'mistral_ai',
    entityName: 'Mistral AI',
    summary:
      'Strategic buy secures sovereign cloud inference capacity across EU data-centres ahead of regulation.',
    date: '2026-02-20',
    confidence: 88,
  },
  {
    id: 'sig-006',
    title: 'xAI Grok-3 beats o3 on ARC-AGI benchmark',
    category: 'research',
    entityId: 'xai',
    entityName: 'xAI',
    summary:
      'Grok-3 scores 94.7% on ARC-AGI, the highest any closed model has reached. Full paper released concurrently.',
    date: '2026-02-18',
    confidence: 95,
  },
  {
    id: 'sig-007',
    title: 'OpenAI launches o3-mini with 40% cost reduction',
    category: 'product',
    entityId: 'openai',
    entityName: 'OpenAI',
    summary:
      'Reasoning model available via API; targets developer segment displaced by Claude 3.5 Haiku.',
    date: '2026-02-15',
    confidence: 99,
    relatedIds: ['sig-001'],
  },
  {
    id: 'sig-008',
    title: 'Google DeepMind AlphaFold 3 extended to drug design',
    category: 'research',
    entityId: 'google_deepmind',
    entityName: 'Google DeepMind',
    summary:
      'New module predicts small-molecule binding with 89% accuracy; partnership with Novartis announced.',
    date: '2026-02-12',
    confidence: 93,
  },
  {
    id: 'sig-009',
    title: 'Meta AI autonomous agent stack reaches 1M developers',
    category: 'agents',
    entityId: 'meta_ai',
    entityName: 'Meta AI',
    summary:
      'Llama Agents SDK crosses one-million monthly active developers; tightest growth curve since React launch.',
    date: '2026-02-08',
    confidence: 87,
    relatedIds: ['sig-004'],
  },
  {
    id: 'sig-010',
    title: 'Perplexity AI secures $500M at $8B valuation',
    category: 'funding',
    entityId: 'perplexity',
    entityName: 'Perplexity AI',
    summary:
      'SoftBank Vision Fund 3 leads round; company targets 100M MAU by year-end with Spaces product.',
    date: '2026-02-05',
    confidence: 97,
  },
  {
    id: 'sig-011',
    title: 'Anthropic Constitutional AI v3 published',
    category: 'research',
    entityId: 'anthropic',
    entityName: 'Anthropic',
    summary:
      'New RLHF variant uses model-written critiques with provable safety bounds; Claude 4 will ship with it.',
    date: '2026-01-30',
    confidence: 90,
  },
  {
    id: 'sig-012',
    title: 'NVIDIA Blackwell Ultra supply constraint eases',
    category: 'product',
    entityId: 'nvidia',
    entityName: 'NVIDIA',
    summary:
      'TSMC ramp unlocks 30% more B300 wafers per month; hyperscaler allocation resumes normal lead times.',
    date: '2026-01-28',
    confidence: 85,
  },
];

export function getSignalById(id: string): Signal | undefined {
  return MOCK_SIGNALS.find((s) => s.id === id);
}

export function getSignalsByEntity(entityId: string): Signal[] {
  return MOCK_SIGNALS.filter((s) => s.entityId === entityId);
}

export function getSignalsByCategory(category: SignalCategory): Signal[] {
  return MOCK_SIGNALS.filter((s) => s.category === category);
}

export default MOCK_SIGNALS;
