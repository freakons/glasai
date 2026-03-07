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
    aliases: ['o1-preview', 'o1-mini', 'OpenAI o3'],
    description: 'OpenAI\'s chain-of-thought reasoning model series.',
  },
  {
    id: 'claude3_5_sonnet',
    name: 'Claude 3.5 Sonnet',
    company: 'anthropic',
    type: 'large_language_model',
    releaseYear: 2024,
    isOpenWeights: false,
    aliases: ['Claude 3.5', 'claude-3-5-sonnet'],
    description: 'Anthropic\'s balanced model combining speed and capability.',
  },
  {
    id: 'claude3_opus',
    name: 'Claude 3 Opus',
    company: 'anthropic',
    type: 'large_language_model',
    releaseYear: 2024,
    isOpenWeights: false,
    aliases: ['Claude Opus', 'claude-3-opus'],
    description: 'Anthropic\'s most capable model in the Claude 3 family.',
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
 */
export function resolveModel(nameOrAlias: string): ModelEntity | undefined {
  const normalised = nameOrAlias.toLowerCase().trim();
  return MODELS.find(
    (m) =>
      m.id === normalised ||
      m.name.toLowerCase() === normalised ||
      m.aliases?.some((a) => a.toLowerCase() === normalised)
  );
}

/** Returns all models for a given company id */
export function getModelsByCompany(companyId: string): ModelEntity[] {
  return MODELS.filter((m) => m.company === companyId);
}

export default MODELS;
