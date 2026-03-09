import type { AIProvider } from './provider';

const OLLAMA_BASE = 'http://localhost:11434';

export class OllamaProvider implements AIProvider {
  private readonly model: string;

  constructor(model = 'deepseek-r1') {
    this.model = model;
  }

  private async call(prompt: string): Promise<string> {
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, prompt, stream: false }),
    });
    if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
    const data = await res.json() as { response: string };
    return data.response?.trim() ?? '';
  }

  generate(prompt: string): Promise<string> {
    return this.call(prompt);
  }

  classify(text: string): Promise<string> {
    return this.call(`Classify the following text into a single category label:\n\n${text}`);
  }

  summarize(text: string): Promise<string> {
    return this.call(`Summarize the following text concisely:\n\n${text}`);
  }

  async embed(text: string): Promise<number[]> {
    const res = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, prompt: text }),
    });
    if (!res.ok) throw new Error(`Ollama embeddings error: ${res.status}`);
    const data = await res.json() as { embedding: number[] };
    return data.embedding ?? [];
  }

  static async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
        signal: AbortSignal.timeout(2000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
