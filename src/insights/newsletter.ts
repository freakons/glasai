import type { Insight } from './types';
import { getProvider } from '@/lib/ai';

export async function generateNewsletter(insights: Insight[]): Promise<string> {
  const top = insights
    .slice()
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 8);

  const topics = top
    .map((i) => `• ${i.title}: ${i.summary}`)
    .join('\n');

  const prompt = `Write a concise technology trend newsletter based on these insights.
${topics}
Structure:
Title
Short intro
Bullet list of trends
Closing summary`;

  try {
    const provider = await getProvider();
    return await provider.summarize(prompt);
  } catch {
    return `\nAI Trend Report\n${topics}\n`;
  }
}
