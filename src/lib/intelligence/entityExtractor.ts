import { getProvider } from '@/lib/ai';

export interface ExtractedEntity {
  name: string;
  type: string;
}

export interface EntityExtractionResult {
  entities: ExtractedEntity[];
}

const VALID_TYPES = new Set(['company', 'person', 'model', 'technology', 'regulation', 'fund']);

export async function extractEntities(text: string): Promise<EntityExtractionResult> {
  const prompt =
    `Extract named entities from the following text.\n` +
    `For each entity identify its type from: company, person, model, technology, regulation, fund.\n` +
    `Return ONLY valid JSON in this exact shape: {"entities":[{"name":"string","type":"string"}]}\n` +
    `Limit to the 8 most relevant entities. Use "technology" as the default type if unsure.\n\n` +
    `TEXT:\n${text.slice(0, 1500)}`;

  try {
    const provider = await getProvider();
    const raw = await provider.classify(prompt);
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : raw) as EntityExtractionResult;
    if (!Array.isArray(parsed.entities)) throw new Error('Invalid entity response shape');
    return {
      entities: parsed.entities
        .filter((e) => typeof e.name === 'string' && e.name.trim())
        .map((e) => ({
          name: e.name.trim(),
          type: VALID_TYPES.has(e.type) ? e.type : 'technology',
        }))
        .slice(0, 8),
    };
  } catch {
    return { entities: fallbackExtract(text) };
  }
}

function fallbackExtract(text: string): ExtractedEntity[] {
  const pattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g;
  const stopWords = new Set(['The', 'A', 'An', 'This', 'That', 'These', 'Those', 'In', 'On', 'At', 'To', 'By', 'For']);
  const seen = new Set<string>();
  const entities: ExtractedEntity[] = [];

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const name = match[1].trim();
    if (stopWords.has(name) || seen.has(name)) continue;
    seen.add(name);
    entities.push({ name, type: 'technology' });
    if (entities.length >= 8) break;
  }

  return entities;
}
