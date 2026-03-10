/**
 * Omterminal — Groq LLM provider
 *
 * Uses Groq's OpenAI-compatible API for fast inference.
 * API key env  : GROQ_API_KEY
 * Docs         : https://console.groq.com/docs/api-reference
 *
 * NOTE: Groq does not natively support embeddings. The embed() method
 * falls back to OpenAI embeddings if OPENAI_API_KEY is available,
 * otherwise returns an empty array (the pipeline handles this gracefully).
 */

import type { AIProvider } from './provider';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

export class GroqProvider implements AIProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model = DEFAULT_MODEL) {
    if (!apiKey) throw new Error('[Omterminal-Groq] GROQ_API_KEY is required');
    this.apiKey = apiKey;
    this.model = model;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async chat(
    messages: { role: string; content: string }[],
    maxTokens = 500,
  ): Promise<string> {
    console.log(`[Omterminal-Groq] chat → model=${this.model} messages=${messages.length}`);
    const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
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
      console.error(`[Omterminal-Groq] chat error ${res.status}:`, body);
      throw new Error(`Groq API error: ${res.status}`);
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

  /** Classify text and return a single category label. */
  classify(text: string): Promise<string> {
    return this.chat([
      {
        role: 'system',
        content:
          'You are a classifier. Return a single category label from: ' +
          'funding, ai_model_release, tool_launch, ai_startup, research, other. ' +
          'Respond with the label only, no explanation.',
      },
      { role: 'user', content: text },
    ]);
  }

  /** Summarise text concisely. */
  summarize(text: string): Promise<string> {
    return this.chat([
      { role: 'system', content: 'You are a concise summarizer. Return a single short paragraph.' },
      { role: 'user', content: text },
    ]);
  }

  /**
   * Generate a numeric embedding vector for the given text.
   *
   * Groq does not natively support embeddings. Falls back to OpenAI
   * embeddings if OPENAI_API_KEY is available, otherwise returns an
   * empty array. The pipeline's embedding consumers (cosine similarity,
   * trend clustering) already handle empty arrays gracefully.
   */
  async embed(text: string): Promise<number[]> {
    // Fallback to OpenAI embeddings if available
    if (process.env.OPENAI_API_KEY) {
      console.log('[Omterminal-Groq] embed → fallback to OpenAI text-embedding-3-small');
      const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
      });

      if (!res.ok) {
        console.error(`[Omterminal-Groq] OpenAI embed fallback error: ${res.status}`);
        return [];
      }

      const data = await res.json() as { data: { embedding: number[] }[] };
      return data.data[0]?.embedding ?? [];
    }

    console.warn('[Omterminal-Groq] embed → no embedding provider available, returning empty vector');
    return [];
  }

  // ── Static helpers ─────────────────────────────────────────────────────────

  /** Returns true when GROQ_API_KEY is present in the environment. */
  static isConfigured(): boolean {
    return Boolean(process.env.GROQ_API_KEY);
  }
}
