export interface AIModel {
  id: string;
  name: string;
  company: string;
  icon: string;
  releaseDate: string;
  type: 'proprietary' | 'open-weight' | 'open-source';
  contextWindow: string;
  keyCapability: string;
  summary: string;
}

export const MODELS: AIModel[] = [
  {
    id: 'claude-opus-4', name: 'Claude Opus 4', company: 'Anthropic', icon: '🟣',
    releaseDate: 'Feb 2026', type: 'proprietary', contextWindow: '200K',
    keyCapability: 'Extended thinking, agentic coding',
    summary: 'Most capable Claude model with extended thinking for complex multi-step reasoning. #1 on SWE-bench for agentic coding tasks.',
  },
  {
    id: 'gpt-5', name: 'GPT-5', company: 'OpenAI', icon: '🟢',
    releaseDate: 'Jan 2026', type: 'proprietary', contextWindow: '128K',
    keyCapability: 'Multimodal reasoning, tool use',
    summary: 'Next-generation GPT model with improved reasoning, multimodal capabilities, and native tool use integration.',
  },
  {
    id: 'gemini-2', name: 'Gemini 2.0 Pro', company: 'Google DeepMind', icon: '🔵',
    releaseDate: 'Dec 2025', type: 'proprietary', contextWindow: '2M',
    keyCapability: '2M token context, multimodal',
    summary: 'Google\'s flagship model with the longest context window available, supporting text, images, audio, and video natively.',
  },
  {
    id: 'llama-4', name: 'Llama 4 Maverick', company: 'Meta', icon: '🟠',
    releaseDate: 'Feb 2026', type: 'open-weight', contextWindow: '128K',
    keyCapability: 'MoE architecture, open weights',
    summary: 'Meta\'s most capable open-weight model using mixture-of-experts architecture for efficient inference at scale.',
  },
  {
    id: 'deepseek-v3', name: 'DeepSeek V3', company: 'DeepSeek', icon: '⚪',
    releaseDate: 'Jan 2026', type: 'open-source', contextWindow: '128K',
    keyCapability: 'Cost-efficient, near-frontier performance',
    summary: 'Chinese open-source model scoring within 2% of GPT-4o on benchmarks at 1/10th the inference cost.',
  },
  {
    id: 'mistral-large-3', name: 'Mistral Large 3', company: 'Mistral AI', icon: '🔷',
    releaseDate: 'Jan 2026', type: 'open-weight', contextWindow: '128K',
    keyCapability: 'European AI, multilingual',
    summary: 'Mistral\'s flagship model emphasizing European data sovereignty and strong multilingual performance.',
  },
];
