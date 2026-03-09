import type { AIProvider } from './provider';
import { OpenAIProvider } from './openai';
import { OllamaProvider } from './ollama';

export type { AIProvider } from './provider';

let _provider: AIProvider | null = null;

export async function getProvider(): Promise<AIProvider> {
  if (_provider) return _provider;

  const env = process.env.AI_PROVIDER?.toLowerCase();

  if (env === 'openai') {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required when AI_PROVIDER=openai');
    _provider = new OpenAIProvider(process.env.OPENAI_API_KEY);
    return _provider;
  }

  if (env === 'ollama') {
    _provider = new OllamaProvider();
    return _provider;
  }

  // Default: prefer Ollama if available, fall back to OpenAI
  if (await OllamaProvider.isAvailable()) {
    _provider = new OllamaProvider();
    return _provider;
  }

  if (process.env.OPENAI_API_KEY) {
    _provider = new OpenAIProvider(process.env.OPENAI_API_KEY);
    return _provider;
  }

  throw new Error('No AI provider available. Run Ollama locally or set OPENAI_API_KEY.');
}
