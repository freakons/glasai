/**
 * Mock event dataset — discrete, timestamped events in the AI ecosystem.
 * Events are more factual / confirmed than signals; they represent things
 * that have definitively happened (a product shipped, a deal closed, etc.).
 */

export type EventType =
  | 'funding'
  | 'launch'
  | 'announcement'
  | 'regulation'
  | 'acquisition'
  | 'partnership'
  | 'research';

export interface AiEvent {
  id: string;
  type: EventType;
  /** Canonical entity ID this event is attributed to */
  entityId: string;
  entityName: string;
  title: string;
  description: string;
  /** ISO date string */
  date: string;
  /** Optional dollar/euro amount (e.g. "$3.5B", "€180M") */
  amount?: string;
  /** Related signal IDs */
  signalIds?: string[];
}

export const MOCK_EVENTS: AiEvent[] = [
  {
    id: 'evt-001',
    type: 'funding',
    entityId: 'anthropic',
    entityName: 'Anthropic',
    title: 'Anthropic Series E — $3.5B',
    description: 'Google and Spark Capital lead $3.5B round at a $30B post-money valuation.',
    date: '2026-03-01',
    amount: '$3.5B',
    signalIds: ['sig-002'],
  },
  {
    id: 'evt-002',
    type: 'launch',
    entityId: 'openai',
    entityName: 'OpenAI',
    title: 'OpenAI o3-mini general availability',
    description: 'Reasoning model released to all API tiers; 40% cheaper than o3 full.',
    date: '2026-02-15',
    signalIds: ['sig-007'],
  },
  {
    id: 'evt-003',
    type: 'regulation',
    entityId: 'google_deepmind',
    entityName: 'Google DeepMind',
    title: 'EU AI Office opens Gemini compliance review',
    description:
      'First formal enforcement action under the EU AI Act targets Gemini Ultra high-risk classification.',
    date: '2026-02-28',
    signalIds: ['sig-003'],
  },
  {
    id: 'evt-004',
    type: 'launch',
    entityId: 'meta_ai',
    entityName: 'Meta AI',
    title: 'Llama 4 open-weights release',
    description: '405B parameter model with commercial licence published on Hugging Face.',
    date: '2026-02-25',
    signalIds: ['sig-004'],
  },
  {
    id: 'evt-005',
    type: 'acquisition',
    entityId: 'mistral_ai',
    entityName: 'Mistral AI',
    title: 'Mistral acquires Nector',
    description: 'EU inference infrastructure startup acquired for €180M to secure sovereign cloud capacity.',
    date: '2026-02-20',
    amount: '€180M',
    signalIds: ['sig-005'],
  },
  {
    id: 'evt-006',
    type: 'research',
    entityId: 'xai',
    entityName: 'xAI',
    title: 'Grok-3 ARC-AGI benchmark result',
    description: 'Grok-3 achieves 94.7% on ARC-AGI; full technical paper published concurrently.',
    date: '2026-02-18',
    signalIds: ['sig-006'],
  },
  {
    id: 'evt-007',
    type: 'partnership',
    entityId: 'google_deepmind',
    entityName: 'Google DeepMind',
    title: 'DeepMind × Novartis drug-design partnership',
    description:
      'AlphaFold 3 drug-design module licenced exclusively to Novartis for oncology pipeline.',
    date: '2026-02-12',
    signalIds: ['sig-008'],
  },
  {
    id: 'evt-008',
    type: 'funding',
    entityId: 'perplexity',
    entityName: 'Perplexity AI',
    title: 'Perplexity AI Series D — $500M',
    description: 'SoftBank Vision Fund 3 leads at $8B valuation; 100M MAU target set.',
    date: '2026-02-05',
    amount: '$500M',
    signalIds: ['sig-010'],
  },
  {
    id: 'evt-009',
    type: 'announcement',
    entityId: 'meta_ai',
    entityName: 'Meta AI',
    title: 'Llama Agents SDK hits 1M developers',
    description: 'Meta reports 1M monthly active developers on its open-source agent platform.',
    date: '2026-02-08',
    signalIds: ['sig-009'],
  },
  {
    id: 'evt-010',
    type: 'research',
    entityId: 'anthropic',
    entityName: 'Anthropic',
    title: 'Constitutional AI v3 paper published',
    description:
      'Interpretability-grounded RLHF variant with provable safety bounds, targeting Claude 4.',
    date: '2026-01-30',
    signalIds: ['sig-011'],
  },
  {
    id: 'evt-011',
    type: 'announcement',
    entityId: 'nvidia',
    entityName: 'NVIDIA',
    title: 'Blackwell Ultra supply normalises',
    description: 'TSMC ramp increases B300 wafer output 30%; hyperscaler lead times return to normal.',
    date: '2026-01-28',
    signalIds: ['sig-012'],
  },
  {
    id: 'evt-012',
    type: 'launch',
    entityId: 'mistral_ai',
    entityName: 'Mistral AI',
    title: 'Mistral Large 3 released',
    description:
      'Latest flagship model matches GPT-4o on coding benchmarks; EU-hosted inference default.',
    date: '2026-01-22',
  },
  {
    id: 'evt-013',
    type: 'funding',
    entityId: 'cohere',
    entityName: 'Cohere',
    title: 'Cohere Series D — $500M',
    description: 'Enterprise AI platform raises $500M, valuation undisclosed; APAC expansion confirmed.',
    date: '2026-01-15',
    amount: '$500M',
  },
  {
    id: 'evt-014',
    type: 'launch',
    entityId: 'openai',
    entityName: 'OpenAI',
    title: 'ChatGPT Enterprise hits 2M paid seats',
    description: 'OpenAI reports 2M paid enterprise seats, double the figure reported six months prior.',
    date: '2026-01-10',
  },
  {
    id: 'evt-015',
    type: 'regulation',
    entityId: 'openai',
    entityName: 'OpenAI',
    title: 'US Senate AI Safety Act introduced',
    description:
      'Bipartisan bill proposes mandatory third-party audits for frontier AI systems; OpenAI engaged.',
    date: '2026-01-08',
  },
];

export function getEventById(id: string): AiEvent | undefined {
  return MOCK_EVENTS.find((e) => e.id === id);
}

export function getEventsByEntity(entityId: string): AiEvent[] {
  return MOCK_EVENTS.filter((e) => e.entityId === entityId);
}

export function getEventsByType(type: EventType): AiEvent[] {
  return MOCK_EVENTS.filter((e) => e.type === type);
}

/** Events in the last N days from a reference date (defaults to today) */
export function getRecentEvents(days: number, referenceDate = new Date()): AiEvent[] {
  const cutoff = new Date(referenceDate);
  cutoff.setDate(cutoff.getDate() - days);
  return MOCK_EVENTS.filter((e) => new Date(e.date) >= cutoff);
}

export default MOCK_EVENTS;
