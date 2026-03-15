/**
 * Omterminal — Groq LLM provider
 *
 * Uses Groq's OpenAI-compatible API for fast inference.
 * API key env  : GROQ_API_KEY
 * Endpoint     : https://api.groq.com/openai/v1
 * Docs         : https://console.groq.com/docs/api-reference
 *
 * Rate-limit protections (Groq free-tier safe):
 *   - Max 2 concurrent LLM requests (module-level semaphore)
 *   - Exponential backoff retry: up to 3 retries for 429 / 503 / timeouts
 *   - Hard 20 s timeout per individual API call
 *
 * NOTE: Groq does not natively support embeddings. The embed() method
 * falls back to OpenAI embeddings if OPENAI_API_KEY is available,
 * otherwise returns an empty array (the pipeline handles this gracefully).
 */

import type { AIProvider } from './provider';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const DEFAULT_MODEL  = 'llama-3.3-70b-versatile';

// ── Rate-limit protection constants ──────────────────────────────────────────

/** Max simultaneous Groq API calls across all in-flight pipeline work. */
const MAX_CONCURRENT_REQUESTS = 2;

/** Hard timeout per individual Groq API call (ms). */
const CALL_TIMEOUT_MS = 20_000;

/** Max retry attempts for transient failures (429 / 503 / network timeout). */
const MAX_RETRIES = 3;

/** HTTP status codes that are safe to retry. */
const RETRYABLE_STATUS_CODES = new Set([429, 503]);

// ── Module-level concurrency semaphore ───────────────────────────────────────

let _activeRequests = 0;
const _waitQueue: Array<() => void> = [];

function acquireSemaphore(): Promise<void> {
  return new Promise(resolve => {
    if (_activeRequests < MAX_CONCURRENT_REQUESTS) {
      _activeRequests++;
      resolve();
    } else {
      _waitQueue.push(() => {
        _activeRequests++;
        resolve();
      });
    }
  });
}

function releaseSemaphore(): void {
  _activeRequests--;
  const next = _waitQueue.shift();
  if (next) next();
}

// ── Internal error type for retryable failures ────────────────────────────────

class GroqRetryableError extends Error {
  constructor(
    public readonly status: number,
    public readonly isRateLimit: boolean,
    message: string,
  ) {
    super(message);
    this.name = 'GroqRetryableError';
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class GroqProvider implements AIProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model = DEFAULT_MODEL) {
    if (!apiKey) throw new Error('[Omterminal-Groq] GROQ_API_KEY is required');
    this.apiKey = apiKey;
    this.model  = model;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Execute a single chat/completions fetch with:
   *   - AbortController-based hard timeout (CALL_TIMEOUT_MS)
   *   - GroqRetryableError for 429 / 503 / network timeouts
   *   - Descriptive logging that never exposes API key values
   */
  private async chatOnce(
    messages: { role: string; content: string }[],
    maxTokens: number,
    attempt: number,
  ): Promise<string> {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);

    try {
      const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${this.apiKey}`,
        },
        body:   JSON.stringify({ model: this.model, messages, max_tokens: maxTokens }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle retryable HTTP status codes
      if (RETRYABLE_STATUS_CODES.has(res.status)) {
        const isRateLimit = res.status === 429;
        console.warn(
          `[Omterminal-Groq] ${isRateLimit ? 'rate_limited' : 'service_unavailable'}` +
          ` provider=groq model=${this.model} status=${res.status}` +
          ` attempt=${attempt + 1}/${MAX_RETRIES + 1} rateLimited=${isRateLimit}`,
        );
        throw new GroqRetryableError(
          res.status,
          isRateLimit,
          `Groq API HTTP ${res.status} (${isRateLimit ? 'rate limited' : 'service unavailable'})`,
        );
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error(
          `[Omterminal-Groq] error provider=groq model=${this.model}` +
          ` status=${res.status} attempt=${attempt + 1}:`,
          body.slice(0, 200),
        );
        throw new Error(`Groq API error: ${res.status}`);
      }

      const data = await res.json() as { choices: { message: { content: string } }[] };
      return data.choices[0]?.message?.content?.trim() ?? '';

    } catch (err) {
      clearTimeout(timeoutId);

      // AbortController timeout
      if ((err as Error).name === 'AbortError') {
        console.warn(
          `[Omterminal-Groq] timeout provider=groq model=${this.model}` +
          ` attempt=${attempt + 1}/${MAX_RETRIES + 1} timeoutMs=${CALL_TIMEOUT_MS}`,
        );
        throw new GroqRetryableError(0, false, `Groq API call timed out after ${CALL_TIMEOUT_MS}ms`);
      }

      throw err;
    }
  }

  /**
   * Chat with automatic retry + exponential backoff + concurrency guard.
   *
   * Retry policy:
   *   - 429 (rate limit)  → retry up to MAX_RETRIES times
   *   - 503 (unavailable) → retry up to MAX_RETRIES times
   *   - call timeout      → retry up to MAX_RETRIES times
   *   - other errors      → fail immediately (no retry)
   *
   * Backoff: 1 s → 2 s → 4 s between attempts.
   */
  private async chat(
    messages: { role: string; content: string }[],
    maxTokens = 500,
  ): Promise<string> {
    console.log(
      `[Omterminal-Groq] chat provider=groq model=${this.model} messages=${messages.length}`,
    );

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // Exponential backoff before retry attempts
      if (attempt > 0) {
        const delayMs = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
        console.log(
          `[Omterminal-Groq] backoff provider=groq model=${this.model}` +
          ` attempt=${attempt + 1}/${MAX_RETRIES + 1} delayMs=${delayMs}`,
        );
        await new Promise<void>(r => setTimeout(r, delayMs));
      }

      // Acquire semaphore — blocks if MAX_CONCURRENT_REQUESTS are active
      await acquireSemaphore();
      try {
        const text = await this.chatOnce(messages, maxTokens, attempt);
        if (attempt > 0) {
          console.log(
            `[Omterminal-Groq] recovered provider=groq model=${this.model} attempts=${attempt + 1}`,
          );
        }
        return text;
      } catch (err) {
        if (err instanceof GroqRetryableError && attempt < MAX_RETRIES) {
          // Retryable — loop continues after finally releases the semaphore
          continue;
        }
        throw err;
      } finally {
        releaseSemaphore();
      }
    }

    // Should be unreachable
    throw new Error('[Omterminal-Groq] max retries exceeded');
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
    if (process.env.OPENAI_API_KEY) {
      console.log('[Omterminal-Groq] embed → fallback to OpenAI text-embedding-3-small');
      const res = await fetch('https://api.openai.com/v1/embeddings', {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${process.env.OPENAI_API_KEY}`,
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

  /** Expose protection constants for health diagnostics. */
  static readonly rateLimitProtection = {
    maxConcurrentRequests: MAX_CONCURRENT_REQUESTS,
    maxRetriesOnRateLimit: MAX_RETRIES,
    callTimeoutMs:         CALL_TIMEOUT_MS,
    retryableStatusCodes:  [...RETRYABLE_STATUS_CODES],
  } as const;
}
