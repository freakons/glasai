/**
 * Omterminal — AI Model Entity Registry
 *
 * Canonical list of tracked AI models.
 * Used to normalise model references across ingested articles and events.
 *
 * Each entry represents a distinct model family or specific version
 * that has been publicly announced or released.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Type definition
// ─────────────────────────────────────────────────────────────────────────────

export type ModelType =
  | 'large_language_model'
  | 'multimodal'
  | 'image_generation'
  | 'video_generation'
  | 'audio'
  | 'code'
  | 'embedding'
  | 'reasoning'
  | 'other';

export interface ModelEntity {
  /** Stable machine-friendly identifier */
  id: string;
  /** Canonical model name, e.g. "GPT-4o" */
  name: string;
  /** Canonical company id from the company registry */
  company: string;
  /** Primary model type */
  type: ModelType;
  /** Year the model was publicly released or announced */
  releaseYear: number;
  /** Whether model weights are publicly available */
  isOpenWeights?: boolean;
  /** Known aliases or version names used in news (for entity resolution) */
  aliases?: string[];
  /** Brief description of the model's key characteristics */
  description?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Model Registry
// ─────────────────────────────────────────────────────────────────────────────

export const MODELS: ModelEntity[] = [
  {
    id: 'gpt4o',
    name: 'GPT-4o',
    company: 'openai',
    type: 'multimodal',
    releaseYear: 2024,
    isOpenWeights: false,
    aliases: ['GPT-4 Omni', 'gpt-4o'],
    description: 'OpenAI\'s flagship multimodal model with text, vision, and audio capabilities.',
  },
  {
    id: 'gpt4',
    name: 'GPT-4',
    company: 'openai',
    type: 'large_language_model',
    releaseYear: 2023,
    isOpenWeights: false,
    aliases: ['GPT4', 'gpt-4'],
    description: 'OpenAI\'s high-capability language model, successor to GPT-3.5.',
  },
  {
    id: 'o1',
    name: 'OpenAI o1',
    company: 'openai',
    type: 'reasoning',
    releaseYear: 2024,
    isOpenWeights: false,
    aliases: ['o1-preview', 'o1-mini'],
    description: 'OpenAI\'s chain-of-thought reasoning model series.',
  },
  {
    id: 'o3',
    name: 'OpenAI o3',
    company: 'openai',
    type: 'reasoning',
    releaseYear: 2025,
    isOpenWeights: false,
    aliases: ['o3-mini', 'o3-mini-high'],
    description: 'OpenAI\'s advanced reasoning model, successor to o1.',
  },
  {
    id: 'claude3_5_sonnet',
    name: 'Claude 3.5 Sonnet',
    company: 'anthropic',
    type: 'large_language_model',
    releaseYear: 2024,
    isOpenWeights: false,
    aliases: ['Claude 3.5', 'claude-3-5-sonnet', 'Claude Sonnet 3.5', 'Claude 3.5 Sonnet v2'],
    description: 'Anthropic\'s balanced model combining speed and capability.',
  },
  {
    id: 'claude3_opus',
    name: 'Claude 3 Opus',
    company: 'anthropic',
    type: 'large_language_model',
    releaseYear: 2024,
    isOpenWeights: false,
    aliases: ['Claude Opus', 'claude-3-opus', 'Claude 3 Opus'],
    description: 'Anthropic\'s most capable model in the Claude 3 family.',
  },
  {
    id: 'claude_4',
    name: 'Claude 4',
    company: 'anthropic',
    type: 'large_language_model',
    releaseYear: 2025,
    isOpenWeights: false,
    aliases: ['Claude 4 Sonnet', 'Claude 4 Opus', 'Claude Sonnet 4', 'Claude Opus 4'],
    description: 'Anthropic\'s fourth-generation Claude model family.',
  },
  {
    id: 'gemini_15_pro',
    name: 'Gemini 1.5 Pro',
    company: 'google_deepmind',
    type: 'multimodal',
    releaseYear: 2024,
    isOpenWeights: false,
    aliases: ['Gemini Pro', 'gemini-1.5-pro'],
    description: 'Google DeepMind\'s long-context multimodal model with 1M token context.',
  },
  {
    id: 'gemini_ultra',
    name: 'Gemini Ultra',
    company: 'google_deepmind',
    type: 'multimodal',
    releaseYear: 2024,
    isOpenWeights: false,
    aliases: ['Gemini 1.0 Ultra'],
    description: 'Google\'s most capable Gemini model, available via Gemini Advanced.',
  },
  {
    id: 'llama3',
    name: 'Llama 3',
    company: 'meta_ai',
    type: 'large_language_model',
    releaseYear: 2024,
    isOpenWeights: true,
    aliases: ['LLaMA 3', 'Meta Llama 3', 'llama-3'],
    description: 'Meta\'s open-weights LLM family, available in 8B and 70B variants.',
  },
  {
    id: 'llama2',
    name: 'Llama 2',
    company: 'meta_ai',
    type: 'large_language_model',
    releaseYear: 2023,
    isOpenWeights: true,
    aliases: ['LLaMA 2', 'Meta Llama 2', 'llama-2'],
    description: 'Meta\'s widely adopted open-weights model that popularised open-source LLMs.',
  },
  {
    id: 'mistral_large',
    name: 'Mistral Large',
    company: 'mistral_ai',
    type: 'large_language_model',
    releaseYear: 2024,
    isOpenWeights: false,
    aliases: ['mistral-large-latest'],
    description: 'Mistral AI\'s flagship frontier model with strong reasoning and coding.',
  },
  {
    id: 'mixtral_8x7b',
    name: 'Mixtral 8x7B',
    company: 'mistral_ai',
    type: 'large_language_model',
    releaseYear: 2023,
    isOpenWeights: true,
    aliases: ['Mixtral', 'mixtral-8x7b-instruct'],
    description: 'Mistral\'s sparse mixture-of-experts open-weights model.',
  },
  {
    id: 'command_r_plus',
    name: 'Command R+',
    company: 'cohere',
    type: 'large_language_model',
    releaseYear: 2024,
    isOpenWeights: false,
    aliases: ['command-r-plus', 'Command R'],
    description: 'Cohere\'s enterprise-optimised RAG and tool-use model.',
  },
  {
    id: 'grok2',
    name: 'Grok-2',
    company: 'xai',
    type: 'large_language_model',
    releaseYear: 2024,
    isOpenWeights: false,
    aliases: ['Grok 2', 'grok-2'],
    description: 'xAI\'s second-generation model with access to real-time X data.',
  },
  {
    id: 'stable_diffusion_3',
    name: 'Stable Diffusion 3',
    company: 'stability_ai',
    type: 'image_generation',
    releaseYear: 2024,
    isOpenWeights: true,
    aliases: ['SD3', 'SD 3'],
    description: 'Stability AI\'s third-generation text-to-image model with improved text rendering.',
  },
  {
    id: 'gemini_2',
    name: 'Gemini 2.0',
    company: 'google_deepmind',
    type: 'multimodal',
    releaseYear: 2025,
    isOpenWeights: false,
    aliases: ['Gemini 2', 'Gemini 2.0 Flash', 'Gemini 2.0 Pro'],
    description: 'Google DeepMind\'s second-generation Gemini model family.',
  },
  {
    id: 'llama3_1',
    name: 'Llama 3.1',
    company: 'meta_ai',
    type: 'large_language_model',
    releaseYear: 2024,
    isOpenWeights: true,
    aliases: ['LLaMA 3.1', 'Meta Llama 3.1', 'llama-3.1', 'Llama 3.1 405B'],
    description: 'Meta\'s largest open-weights model with 405B parameters.',
  },
  {
    id: 'llama4',
    name: 'Llama 4',
    company: 'meta_ai',
    type: 'large_language_model',
    releaseYear: 2025,
    isOpenWeights: true,
    aliases: ['LLaMA 4', 'Meta Llama 4', 'llama-4', 'Llama 4 Scout', 'Llama 4 Maverick'],
    description: 'Meta\'s fourth-generation open-weights LLM family.',
  },
  {
    id: 'deepseek_v3',
    name: 'DeepSeek-V3',
    company: 'deepseek',
    type: 'large_language_model',
    releaseYear: 2024,
    isOpenWeights: true,
    aliases: ['DeepSeek V3', 'DeepSeek-V3', 'deepseek-v3'],
    description: 'DeepSeek\'s competitive open-weights model with MoE architecture.',
  },
  {
    id: 'deepseek_r1',
    name: 'DeepSeek-R1',
    company: 'deepseek',
    type: 'reasoning',
    releaseYear: 2025,
    isOpenWeights: true,
    aliases: ['DeepSeek R1', 'DeepSeek-R1', 'deepseek-r1'],
    description: 'DeepSeek\'s reasoning model with chain-of-thought capabilities.',
  },
  {
    id: 'gpt5',
    name: 'GPT-5',
    company: 'openai',
    type: 'large_language_model',
    releaseYear: 2025,
    isOpenWeights: false,
    aliases: ['GPT5', 'gpt-5'],
    description: 'OpenAI\'s next-generation flagship language model.',
  },
  {
    id: 'sora',
    name: 'Sora',
    company: 'openai',
    type: 'video_generation',
    releaseYear: 2024,
    isOpenWeights: false,
    aliases: ['OpenAI Sora'],
    description: 'OpenAI\'s text-to-video generation model.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Look up a model by its stable id */
export function getModelById(id: string): ModelEntity | undefined {
  return MODELS.find((m) => m.id === id);
}

/**
 * Resolve a free-text model name to the canonical ModelEntity by matching
 * against id, name, and known aliases.
 *
 * Uses normalized comparison to handle punctuation/casing variants:
 *   "gpt-4o" → GPT-4o, "Claude 3.5" → Claude 3.5 Sonnet, etc.
 */
export function resolveModel(nameOrAlias: string): ModelEntity | undefined {
  const normalised = normalizeForMatch(nameOrAlias);
  return MODELS.find(
    (m) =>
      m.id === normalised ||
      normalizeForMatch(m.name) === normalised ||
      m.aliases?.some((a) => normalizeForMatch(a) === normalised)
  );
}

/** Normalize a name for matching: lowercase, strip punctuation, collapse spaces. */
function normalizeForMatch(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[-_.,:;'"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Returns all models for a given company id */
export function getModelsByCompany(companyId: string): ModelEntity[] {
  return MODELS.filter((m) => m.company === companyId);
}

export default MODELS;
