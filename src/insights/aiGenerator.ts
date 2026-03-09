import type { TrendResult } from '@/trends/types';
import { getProvider } from '@/lib/ai';

const insightCache = new Map<string, string>();

export async function generateAIInsight(trend: TrendResult): Promise<string> {
  const topic = trend.topic.toLowerCase();

  if (insightCache.has(topic)) {
    return insightCache.get(topic)!;
  }

  const prompt =
    `Analyze this AI ecosystem trend and produce a short insight summary:\n` +
    `Topic: ${trend.topic} ` +
    `Category: ${trend.category} ` +
    `Signals: ${trend.signal_count} ` +
    `Entities: ${trend.entities.join(', ')}`;

  let insight: string;
  try {
    const provider = await getProvider();
    insight = await provider.generate(prompt);
    if (!insight) throw new Error('Empty response from AI provider');
  } catch {
    insight = `Multiple signals indicate increased activity around ${topic}.`;
  }

  insightCache.set(topic, insight);
  console.log(`AI insight generated for topic: ${topic}`);
  return insight;
}
