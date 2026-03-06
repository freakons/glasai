export interface TickerItem {
  tag: string;
  text: string;
}

export const TICKERS: TickerItem[] = [
  { tag: 'BREAKING', text: 'OpenAI closes $40B round at $340B valuation — largest private tech raise ever' },
  { tag: 'MODELS', text: 'Anthropic ships Claude Opus 4 with extended thinking and agentic capabilities' },
  { tag: 'FUNDING', text: 'xAI raises $6B Series C led by Andreessen Horowitz for Grok infrastructure' },
  { tag: 'REGULATION', text: 'EU AI Act enters full enforcement — high-risk systems must comply now' },
  { tag: 'AGENTS', text: 'Google DeepMind open-sources Gemini Agent Framework for autonomous task completion' },
  { tag: 'RESEARCH', text: 'Stanford HAI: Enterprise AI adoption hits 78% globally, GenAI in production at 45%' },
  { tag: 'WARNING', text: 'US Senate passes AI Transparency Act — content labeling required at scale' },
  { tag: 'PRODUCT', text: 'Meta releases Llama 4 Maverick open-weight model rivaling proprietary alternatives' },
  { tag: 'MODELS', text: 'DeepSeek V3 scores within 2% of GPT-4o on MMLU at 1/10th the inference cost' },
  { tag: 'FUNDING', text: 'Mistral AI raises €600M Series B at €6B valuation for European AI sovereignty' },
];
