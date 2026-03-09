import type { AIProvider } from './provider';

export class OpenAIProvider implements AIProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model = 'gpt-4o-mini') {
    this.apiKey = apiKey;
    this.model = model;
  }

  private async chat(messages: { role: string; content: string }[], maxTokens = 500): Promise<string> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, messages, max_tokens: maxTokens }),
    });
    if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
    const data = await res.json() as { choices: { message: { content: string } }[] };
    return data.choices[0]?.message?.content?.trim() ?? '';
  }

  generate(prompt: string): Promise<string> {
    return this.chat([{ role: 'user', content: prompt }]);
  }

  classify(text: string): Promise<string> {
    return this.chat([
      { role: 'system', content: 'You are a classifier. Return a single category label.' },
      { role: 'user', content: text },
    ]);
  }

  summarize(text: string): Promise<string> {
    return this.chat([
      { role: 'system', content: 'You are a summarizer. Return a concise summary.' },
      { role: 'user', content: text },
    ]);
  }

  async embed(text: string): Promise<number[]> {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
    });
    if (!res.ok) throw new Error(`OpenAI embeddings error: ${res.status}`);
    const data = await res.json() as { data: { embedding: number[] }[] };
    return data.data[0].embedding;
  }
}
