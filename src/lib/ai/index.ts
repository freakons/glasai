import type { AIProvider } from './provider';
import { OpenAIProvider } from './openai';
import { OllamaProvider } from './ollama';
import { GrokProvider } from './grok';

export type { AIProvider } from './provider';
export { GrokProvider } from './grok';

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

  if (env === 'grok') {
    if (!process.env.GROK_API_KEY) throw new Error('GROK_API_KEY is required when AI_PROVIDER=grok');
    _provider = new GrokProvider(process.env.GROK_API_KEY);
    return _provider;
  }

  // Default probe order: Ollama (local) → Grok → OpenAI
  if (await OllamaProvider.isAvailable()) {
    console.log('[ai/index] provider=ollama (auto-detected)');
    _provider = new OllamaProvider();
    return _provider;
  }

  if (process.env.GROK_API_KEY) {
    console.log('[ai/index] provider=grok (auto-detected)');
    _provider = new GrokProvider(process.env.GROK_API_KEY);
    return _provider;
  }

  if (process.env.OPENAI_API_KEY) {
    console.log('[ai/index] provider=openai (auto-detected)');
    _provider = new OpenAIProvider(process.env.OPENAI_API_KEY);
    return _provider;
  }

  throw new Error(
    'No AI provider available. Run Ollama locally, set GROK_API_KEY, or set OPENAI_API_KEY.',
  );
}
