/**
 * Mock entity intelligence profiles — enriched snapshots of AI ecosystem actors.
 * Combines static company data with live-ish intelligence metrics (signal counts,
 * risk levels, etc.) for use in entity queries and comparison views.
 */

export type RiskLevel = 'low' | 'medium' | 'high';

export interface EntityProfile {
  /** Matches the canonical company/entity id */
  id: string;
  name: string;
  sector: string;
  country: string;
  founded: number;
  website: string;
  /** Total signals attributed to this entity in the platform */
  signalCount: number;
  /** Events in the last 30 days */
  eventCount30d: number;
  /** Most recent signal title */
  latestSignal: string;
  /** Most recent event date */
  lastEventDate: string;
  /** Aggregated intelligence risk level */
  riskLevel: RiskLevel;
  /** Brief strategic intelligence summary */
  summary: string;
  /** Market position tags */
  tags: string[];
  /** Estimated ARR or funding total, human-readable */
  financialScale?: string;
}

export const MOCK_ENTITIES: EntityProfile[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    sector: 'Foundation Models',
    country: 'US',
    founded: 2015,
    website: 'https://openai.com',
    signalCount: 7,
    eventCount30d: 4,
    latestSignal: 'GPT-5 architecture leak signals imminent launch',
    lastEventDate: '2026-03-05',
    riskLevel: 'medium',
    summary:
      'Dominant in consumer AI with ChatGPT; API business under margin pressure from open-weight competitors. GPT-5 launch imminent.',
    tags: ['LLM', 'API', 'Enterprise', 'Consumer'],
    financialScale: '$5B ARR',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    sector: 'Foundation Models',
    country: 'US',
    founded: 2021,
    website: 'https://anthropic.com',
    signalCount: 5,
    eventCount30d: 3,
    latestSignal: 'Anthropic raises $3.5B Series E at $30B valuation',
    lastEventDate: '2026-03-01',
    riskLevel: 'low',
    summary:
      'Best-in-class safety posture and enterprise traction. Constitutional AI v3 differentiates on compliance. Well-funded through 2027.',
    tags: ['LLM', 'Safety', 'Enterprise', 'Research'],
    financialScale: '$1.3B ARR',
  },
  {
    id: 'google_deepmind',
    name: 'Google DeepMind',
    sector: 'Foundation Models',
    country: 'GB',
    founded: 2023,
    website: 'https://deepmind.google',
    signalCount: 6,
    eventCount30d: 3,
    latestSignal: 'EU AI Office opens Gemini compliance review',
    lastEventDate: '2026-02-28',
    riskLevel: 'medium',
    summary:
      'Regulatory headwinds in EU from Gemini compliance review. Gemini 2.0 gaining enterprise share; AlphaFold 3 breakthrough in life sciences.',
    tags: ['LLM', 'Research', 'Multimodal', 'Life Sciences'],
    financialScale: 'Alphabet subsidiary',
  },
  {
    id: 'meta_ai',
    name: 'Meta AI',
    sector: 'Foundation Models',
    country: 'US',
    founded: 2023,
    website: 'https://ai.meta.com',
    signalCount: 4,
    eventCount30d: 2,
    latestSignal: 'Meta AI releases Llama 4 under open-weights licence',
    lastEventDate: '2026-02-25',
    riskLevel: 'low',
    summary:
      'Open-weights strategy with Llama 4 is commoditising model access; Agents SDK traction signals platform ambitions.',
    tags: ['Open Weights', 'LLM', 'Agents', 'Developer'],
    financialScale: 'Meta P&L (~$170B revenue)',
  },
  {
    id: 'mistral_ai',
    name: 'Mistral AI',
    sector: 'Foundation Models',
    country: 'FR',
    founded: 2023,
    website: 'https://mistral.ai',
    signalCount: 4,
    eventCount30d: 2,
    latestSignal: 'Mistral AI acquires inference startup Nector for €180M',
    lastEventDate: '2026-02-20',
    riskLevel: 'low',
    summary:
      'European sovereign AI champion. Nector acquisition locks in EU inference capacity ahead of AI Act requirements. Mistral Large 3 competitive on coding.',
    tags: ['LLM', 'Sovereign', 'European', 'Open Weights'],
    financialScale: '€1B+ raised',
  },
  {
    id: 'xai',
    name: 'xAI',
    sector: 'Foundation Models',
    country: 'US',
    founded: 2023,
    website: 'https://x.ai',
    signalCount: 3,
    eventCount30d: 1,
    latestSignal: 'xAI Grok-3 beats o3 on ARC-AGI benchmark',
    lastEventDate: '2026-02-18',
    riskLevel: 'medium',
    summary:
      'Grok-3 ARC-AGI result marks inflection point. X platform distribution is unique moat; governance concerns persist.',
    tags: ['LLM', 'Research', 'Social', 'Reasoning'],
    financialScale: '$6B raised',
  },
  {
    id: 'perplexity',
    name: 'Perplexity AI',
    sector: 'Applied AI',
    country: 'US',
    founded: 2022,
    website: 'https://perplexity.ai',
    signalCount: 2,
    eventCount30d: 1,
    latestSignal: 'Perplexity AI secures $500M at $8B valuation',
    lastEventDate: '2026-02-05',
    riskLevel: 'medium',
    summary:
      'Answer-engine with strong user growth; $500M round extends runway. Valuation rich relative to revenue; depends on search UX moat.',
    tags: ['Search', 'Consumer', 'Answer Engine'],
    financialScale: '$500M raised to date',
  },
  {
    id: 'nvidia',
    name: 'NVIDIA',
    sector: 'Semiconductors',
    country: 'US',
    founded: 1993,
    website: 'https://nvidia.com',
    signalCount: 2,
    eventCount30d: 1,
    latestSignal: 'NVIDIA Blackwell Ultra supply constraint eases',
    lastEventDate: '2026-01-28',
    riskLevel: 'low',
    summary:
      'GPU monopoly intact; Blackwell ramp normalising. Customers hedging with AMD MI300X but CUDA moat is durable.',
    tags: ['Semiconductors', 'GPU', 'Infrastructure', 'CUDA'],
    financialScale: '$130B revenue (FY2026E)',
  },
  {
    id: 'cohere',
    name: 'Cohere',
    sector: 'Foundation Models',
    country: 'CA',
    founded: 2019,
    website: 'https://cohere.com',
    signalCount: 1,
    eventCount30d: 1,
    latestSignal: 'Cohere Series D — $500M',
    lastEventDate: '2026-01-15',
    riskLevel: 'low',
    summary:
      'Enterprise NLP specialist with strong search and retrieval product. $500M round funds APAC expansion; B2B focus insulates from consumer volatility.',
    tags: ['Enterprise', 'NLP', 'Retrieval', 'B2B'],
    financialScale: '$270M ARR',
  },
  {
    id: 'microsoft',
    name: 'Microsoft',
    sector: 'Enterprise Software',
    country: 'US',
    founded: 1975,
    website: 'https://microsoft.com',
    signalCount: 0,
    eventCount30d: 0,
    latestSignal: '—',
    lastEventDate: '—',
    riskLevel: 'low',
    summary:
      'Copilot integration across Microsoft 365 is the highest-distribution AI product on earth. OpenAI partnership provides frontier model access.',
    tags: ['Enterprise', 'Copilot', 'Cloud', 'Azure'],
    financialScale: '$245B revenue (FY2026E)',
  },
];

export function getEntityById(id: string): EntityProfile | undefined {
  return MOCK_ENTITIES.find((e) => e.id === id);
}

/**
 * Fuzzy-resolve an entity by name or id.
 * Checks id, name (case-insensitive), and simple partial match.
 */
export function resolveEntity(query: string): EntityProfile | undefined {
  const q = query.toLowerCase().trim();
  return MOCK_ENTITIES.find(
    (e) =>
      e.id === q ||
      e.name.toLowerCase() === q ||
      e.name.toLowerCase().includes(q) ||
      e.id.includes(q)
  );
}

export function getTopEntities(n = 5): EntityProfile[] {
  return [...MOCK_ENTITIES].sort((a, b) => b.signalCount - a.signalCount).slice(0, n);
}

export default MOCK_ENTITIES;
