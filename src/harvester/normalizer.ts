import { RawSignal, NormalizedSignal } from './types';

export function normalizeSignal(raw: RawSignal): NormalizedSignal {
  return {
    title: (raw.title ?? '').trim() || 'Untitled Signal',
    description: (raw.content ?? '').trim(),
    source: raw.source,
    url: raw.url,
    published_at: raw.published_at,
    ai_model: 'harvester',
  };
}
