export interface FundingRound {
  id: string;
  company: string;
  icon: string;
  amount: string;
  valuation: string;
  round: string;
  date: string;
  investors: string[];
  summary: string;
}

export const FUNDING_ROUNDS: FundingRound[] = [
  {
    id: 'openai-40b', company: 'OpenAI', icon: '🟢',
    amount: '$40B', valuation: '$340B', round: 'Late Stage',
    date: 'Mar 2026', investors: ['SoftBank', 'Microsoft', 'Thrive Capital'],
    summary: 'Largest private tech raise in history. Positions OpenAI for AGI research and massive compute buildout.',
  },
  {
    id: 'anthropic-8b', company: 'Anthropic', icon: '🟣',
    amount: '$8B', valuation: '$61B', round: 'Series E',
    date: 'Jan 2026', investors: ['Google', 'Spark Capital', 'Salesforce Ventures'],
    summary: 'Major fundraise to scale Claude model training and expand enterprise AI safety platform.',
  },
  {
    id: 'xai-6b', company: 'xAI', icon: '⚡',
    amount: '$6B', valuation: '$50B', round: 'Series C',
    date: 'Feb 2026', investors: ['Andreessen Horowitz', 'Sequoia Capital', 'Fidelity'],
    summary: 'Funds expansion of Grok training cluster and enterprise product development.',
  },
  {
    id: 'mistral-600m', company: 'Mistral AI', icon: '🔷',
    amount: '€600M', valuation: '€6B', round: 'Series B',
    date: 'Jan 2026', investors: ['Andreessen Horowitz', 'Lightspeed', 'General Catalyst'],
    summary: 'Positions Mistral as Europe\'s leading AI company with sovereign AI focus.',
  },
  {
    id: 'perplexity-500m', company: 'Perplexity', icon: '🔍',
    amount: '$500M', valuation: '$9B', round: 'Series C',
    date: 'Dec 2025', investors: ['IVP', 'NEA', 'Databricks Ventures'],
    summary: 'AI-powered search company scales to challenge Google with answer-first search paradigm.',
  },
  {
    id: 'cohere-450m', company: 'Cohere', icon: '🟤',
    amount: '$450M', valuation: '$5.5B', round: 'Series D',
    date: 'Nov 2025', investors: ['PSP Investments', 'Cisco', 'Fujitsu'],
    summary: 'Enterprise-focused AI platform secures capital for global expansion and on-premises deployments.',
  },
];
