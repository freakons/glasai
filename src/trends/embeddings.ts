import { getProvider } from '@/lib/ai';

export async function embedText(text: string): Promise<number[]> {
  try {
    const provider = await getProvider();
    return await provider.embed(text);
  } catch {
    return [];
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
