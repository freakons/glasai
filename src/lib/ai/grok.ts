/**
 * Omterminal-Grok — xAI Grok LLM provider
 *
 * Display Name : Omterminal-Grok
 * API key env  : GROK_API_KEY  (rotate quarterly, 90-day expiry)
 * Docs         : https://docs.x.ai/api
 */

import type { AIProvider } from './provider';

const GROK_BASE_URL = 'https://api.x.ai/v1';
const DEFAULT_MODEL = 'grok-3-mini';
const EMBED_MODEL = 'grok-embed';

export class GrokProvider implements AIProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model = DEFAULT_MODEL) {
    if (!apiKey) throw new Error('[Omterminal-Grok] GROK_API_KEY is required');
    this.apiKey = apiKey;
    this.model = model;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async chat(
    messages: { role: string; content: string }[],
    maxTokens = 500,
  ): Promise<string> {
    console.log(`[Omterminal-Grok] chat → model=${this.model} messages=${messages.length}`);
    const res = await fetch(`${GROK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: maxTokens,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[Omterminal-Grok] chat error ${res.status}:`, body);
      throw new Error(`Grok API error: ${res.status}`);
    }

    const data = await res.json() as {
      choices: { message: { content: string } }[];
    };
    return data.choices[0]?.message?.content?.trim() ?? '';
  }

  // ── AIProvider interface ───────────────────────────────────────────────────

  /** Free-form text generation. */
  generate(prompt: string): Promise<string> {
    return this.chat([{ role: 'user', content: prompt }]);
  }

  /**
   * Classify text and return the primary category label (implements AIProvider).
   * For multi-label output use {@link classifyMultiple}.
   */
  async classify(text: string): Promise<string> {
    const labels = await this.classifyMultiple(text);
    return labels[0] ?? 'other';
  }

  /** Summarise text concisely. */
  summarize(text: string): Promise<string> {
    return this.chat([
      { role: 'system', content: 'You are a concise summarizer. Return a single short paragraph.' },
      { role: 'user', content: text },
    ]);
  }

  /** Generate a numeric embedding vector for the given text. */
  async embed(text: string): Promise<number[]> {
    console.log(`[Omterminal-Grok] embed → model=${EMBED_MODEL}`);
    const res = await fetch(`${GROK_BASE_URL}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: EMBED_MODEL, input: text }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[Omterminal-Grok] embed error ${res.status}:`, body);
      throw new Error(`Grok embeddings error: ${res.status}`);
    }

    const data = await res.json() as { data: { embedding: number[] }[] };
    return data.data[0]?.embedding ?? [];
  }

  // ── Grok-specific extensions ───────────────────────────────────────────────

  /**
   * Classify text and return up to 3 ranked category labels.
   * Useful when a signal spans multiple categories.
   */
  async classifyMultiple(text: string): Promise<string[]> {
    const raw = await this.chat([
      {
        role: 'system',
        content:
          'You are a classifier. Return 1–3 category labels from: ' +
          'funding, ai_model_release, tool_launch, ai_startup, research, other. ' +
          'Respond with a comma-separated list only, no explanation.',
      },
      { role: 'user', content: text },
    ]);

    return raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 3);
  }

  // ── Static helpers ─────────────────────────────────────────────────────────

  /** Returns true when GROK_API_KEY is present in the environment. */
  static isConfigured(): boolean {
    return Boolean(process.env.GROK_API_KEY);
  }
}
