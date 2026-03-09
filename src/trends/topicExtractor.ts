import { getProvider } from '@/lib/ai';

function fallbackTopics(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .split(' ');

  const counts: Record<string, number> = {};
  for (const w of words) {
    if (w.length < 4) continue;
    counts[w] = (counts[w] || 0) + 1;
  }

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map((e) => e[0]);
}

export async function extractTopics(text: string): Promise<string[]> {
  const prompt = `Extract 3-5 concise technology topics from the following content.
Return them as a JSON array of short phrases.
CONTENT:
${text.slice(0, 2000)}`;

  try {
    const provider = await getProvider();
    const raw = await provider.classify(prompt);
    // Extract JSON array from response (handles providers that wrap output in prose)
    const match = raw.match(/\[[\s\S]*?\]/);
    return JSON.parse(match ? match[0] : raw) as string[];
  } catch {
    return fallbackTopics(text);
  }
}
