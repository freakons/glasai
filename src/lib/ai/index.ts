import type { AIProvider } from './provider';
import { OpenAIProvider } from './openai';
import { OllamaProvider } from './ollama';
import { GrokProvider } from './grok';
import { GroqProvider } from './groq';
import { CachedAIProvider } from './cachedProvider';

export type { AIProvider } from './provider';
export { GrokProvider } from './grok';
export { GroqProvider } from './groq';

let _provider: AIProvider | null = null;

/** The name of the currently active provider (set during getProvider). */
let _activeProviderName: string | null = null;

/** Returns the name of the currently active LLM provider, or null if not yet resolved. */
export function getActiveProviderName(): string | null {
  return _activeProviderName;
}

function wrapWithCache(provider: AIProvider, name: string): AIProvider {
  _activeProviderName = name;
  return new CachedAIProvider(provider, name);
}

export async function getProvider(): Promise<AIProvider> {
  if (_provider) return _provider;

  const env = process.env.AI_PROVIDER?.toLowerCase();

  // ── Explicit provider selection via AI_PROVIDER env var ──────────────────

  if (env === 'ollama') {
    _provider = wrapWithCache(new OllamaProvider(), 'ollama');
    return _provider;
  }

  if (env === 'groq') {
    if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY is required when AI_PROVIDER=groq');
    _provider = wrapWithCache(new GroqProvider(process.env.GROQ_API_KEY), 'groq');
    return _provider;
  }

  if (env === 'grok') {
    if (!process.env.GROK_API_KEY) throw new Error('GROK_API_KEY is required when AI_PROVIDER=grok');
    _provider = wrapWithCache(new GrokProvider(process.env.GROK_API_KEY), 'grok');
    return _provider;
  }

  if (env === 'openai') {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required when AI_PROVIDER=openai');
    _provider = wrapWithCache(new OpenAIProvider(process.env.OPENAI_API_KEY), 'openai');
    return _provider;
  }

  // ── Auto-detect: Ollama (local) → Groq (production) → OpenAI (fallback) ─

  if (await OllamaProvider.isAvailable()) {
    console.log('[ai/index] provider=ollama (auto-detected)');
    _provider = wrapWithCache(new OllamaProvider(), 'ollama');
    return _provider;
  }

  if (process.env.GROQ_API_KEY) {
    console.log('[ai/index] provider=groq (auto-detected)');
    _provider = wrapWithCache(new GroqProvider(process.env.GROQ_API_KEY), 'groq');
    return _provider;
  }

  if (process.env.GROK_API_KEY) {
    console.log('[ai/index] provider=grok (auto-detected)');
    _provider = wrapWithCache(new GrokProvider(process.env.GROK_API_KEY), 'grok');
    return _provider;
  }

  if (process.env.OPENAI_API_KEY) {
    console.log('[ai/index] provider=openai (auto-detected)');
    _provider = wrapWithCache(new OpenAIProvider(process.env.OPENAI_API_KEY), 'openai');
    return _provider;
  }

  throw new Error(
    'No AI provider available. Run Ollama locally, set GROQ_API_KEY, set GROK_API_KEY, or set OPENAI_API_KEY.',
  );
}
