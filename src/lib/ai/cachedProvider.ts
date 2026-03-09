/**
 * Omterminal — Cached AI Provider Wrapper
 *
 * Wraps any AIProvider with Redis-backed response caching to prevent
 * repeated expensive LLM calls.
 *
 * Cache key format: llm:{provider}:{hash(prompt)}
 * TTL: 300 seconds (5 minutes)
 */

import type { AIProvider } from './provider';
import { getCache, setCache, TTL } from '@/lib/cache/redis';

/**
 * Simple hash for cache keys — deterministic, fast, no crypto needed.
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

export class CachedAIProvider implements AIProvider {
  private readonly inner: AIProvider;
  private readonly providerName: string;

  constructor(inner: AIProvider, providerName: string) {
    this.inner = inner;
    this.providerName = providerName;
  }

  private cacheKey(method: string, input: string): string {
    return `llm:${this.providerName}:${method}:${simpleHash(input)}`;
  }

  async generate(prompt: string): Promise<string> {
    const key = this.cacheKey('generate', prompt);
    const cached = await getCache<string>(key);
    if (cached !== null) {
      console.log(`[ai/cache] llm_cache_hit key=${key}`);
      return cached;
    }
    console.log(`[ai/cache] llm_cache_miss key=${key}`);
    const result = await this.inner.generate(prompt);
    await setCache(key, result, TTL.LLM);
    return result;
  }

  async classify(text: string): Promise<string> {
    const key = this.cacheKey('classify', text);
    const cached = await getCache<string>(key);
    if (cached !== null) {
      console.log(`[ai/cache] llm_cache_hit key=${key}`);
      return cached;
    }
    console.log(`[ai/cache] llm_cache_miss key=${key}`);
    const result = await this.inner.classify(text);
    await setCache(key, result, TTL.LLM);
    return result;
  }

  async summarize(text: string): Promise<string> {
    const key = this.cacheKey('summarize', text);
    const cached = await getCache<string>(key);
    if (cached !== null) {
      console.log(`[ai/cache] llm_cache_hit key=${key}`);
      return cached;
    }
    console.log(`[ai/cache] llm_cache_miss key=${key}`);
    const result = await this.inner.summarize(text);
    await setCache(key, result, TTL.LLM);
    return result;
  }

  async embed(text: string): Promise<number[]> {
    const key = this.cacheKey('embed', text);
    const cached = await getCache<number[]>(key);
    if (cached !== null) {
      console.log(`[ai/cache] llm_cache_hit key=${key}`);
      return cached;
    }
    console.log(`[ai/cache] llm_cache_miss key=${key}`);
    const result = await this.inner.embed(text);
    await setCache(key, result, TTL.LLM);
    return result;
  }
}
