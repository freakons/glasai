import { RawSignal, NormalizedSignal } from './types';
import {
  cleanText,
  canonicalizeUrl,
  normalizeSourceName,
  normalizeTimestamp,
} from '@/services/normalization/helpers';

export function normalizeSignal(raw: RawSignal, aiProvider = 'harvester'): NormalizedSignal {
  return {
    title: cleanText(raw.title) || 'Untitled Signal',
    description: cleanText(raw.content),
    source: normalizeSourceName(raw.source),
    url: raw.url ? canonicalizeUrl(raw.url) : raw.url,
    published_at: normalizeTimestamp(raw.published_at),
    ai_model: aiProvider,
  };
}
