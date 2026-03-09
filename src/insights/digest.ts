import { Insight } from './types';

export function generateDigest(insights: Insight[]): string {
  const sorted = insights
    .slice()
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10);

  const lines = sorted.map((i) => `• ${i.title} — ${i.summary}`);

  return `Daily AI Trend Digest\n\n${lines.join('\n')}`;
}
