/**
 * Omterminal — Entity Extractor (LLM + canonical linking)
 *
 * Extracts entities from signal/article text using LLM (primary) or
 * fallback regex, then links extracted names to canonical internal
 * entities via the centralized entityResolver.
 *
 * This ensures that LLM-extracted names like "Open AI" or "GPT4" are
 * resolved to their canonical forms ("OpenAI", "GPT-4") before storage,
 * preventing entity fragmentation.
 *
 * Pipeline:
 *   1. LLM extraction (or regex fallback) → raw entity names
 *   2. Canonical linking via entityResolver → normalized names + IDs
 *   3. Merge registry-detected entities with LLM-extracted ones
 */

import { getProvider } from '@/lib/ai';
import {
  canonicalizeEntityName,
  resolveEntityMentions,
  type ResolvedEntity,
} from '@/lib/entityResolver';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ExtractedEntity {
  /** Canonical entity name (resolved to registry if possible) */
  name: string;
  /** Entity type: company, person, model, technology, regulation, fund */
  type: string;
  /** Internal registry ID if linked to a canonical entity, null otherwise */
  registryId: string | null;
  /** How the entity was identified */
  extractionMethod: 'llm' | 'registry' | 'fallback';
}

export interface EntityExtractionResult {
  entities: ExtractedEntity[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const VALID_TYPES = new Set(['company', 'person', 'model', 'technology', 'regulation', 'fund']);

/** Map resolver categories to entity types for consistency */
const CATEGORY_TO_TYPE: Record<string, string> = {
  company: 'company',
  model: 'model',
  investor: 'fund',
};

// ─────────────────────────────────────────────────────────────────────────────
// Primary extraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts entities from text using LLM + canonical linking.
 *
 * Strategy:
 *   1. Run registry-based detection (fast, deterministic)
 *   2. Run LLM extraction (broader coverage for non-registry entities)
 *   3. Merge results, preferring registry-linked canonical names
 *   4. Deduplicate by canonical name
 *
 * @param text  Signal or article text to extract from.
 * @returns     Deduplicated array of extracted entities with canonical names.
 */
export async function extractEntities(text: string): Promise<EntityExtractionResult> {
  const seenNames = new Set<string>();
  const results: ExtractedEntity[] = [];

  // ── Step 1: Registry-based detection (always runs, no LLM dependency) ─────
  // Use first sentence as rough title proxy when called with combined text
  const titleEnd = text.indexOf('. ');
  const roughTitle = titleEnd > 0 ? text.slice(0, titleEnd) : text.slice(0, 200);
  const roughContent = titleEnd > 0 ? text.slice(titleEnd + 2) : '';

  const registryMatches = resolveEntityMentions(roughTitle, roughContent);
  for (const match of registryMatches) {
    const key = match.canonicalName.toLowerCase();
    if (!seenNames.has(key)) {
      seenNames.add(key);
      results.push({
        name: match.canonicalName,
        type: CATEGORY_TO_TYPE[match.category] ?? 'technology',
        registryId: match.id,
        extractionMethod: 'registry',
      });
    }
  }

  // ── Step 2: LLM extraction (broader coverage) ────────────────────────────
  try {
    const llmEntities = await llmExtract(text);

    for (const entity of llmEntities) {
      // Try to canonicalize the LLM-extracted name against registry
      const { canonicalName, id, category } = canonicalizeEntityName(entity.name);
      const key = canonicalName.toLowerCase();

      if (seenNames.has(key)) continue; // already found via registry
      seenNames.add(key);

      results.push({
        name: canonicalName,
        type: id && category ? (CATEGORY_TO_TYPE[category] ?? entity.type) : entity.type,
        registryId: id,
        extractionMethod: 'llm',
      });
    }
  } catch {
    // LLM unavailable — registry results + fallback
    const fallback = fallbackExtract(text);
    for (const entity of fallback) {
      const { canonicalName, id, category } = canonicalizeEntityName(entity.name);
      const key = canonicalName.toLowerCase();
      if (seenNames.has(key)) continue;
      seenNames.add(key);

      results.push({
        name: canonicalName,
        type: id && category ? (CATEGORY_TO_TYPE[category] ?? 'technology') : 'technology',
        registryId: id,
        extractionMethod: 'fallback',
      });
    }
  }

  return { entities: results.slice(0, 10) };
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM extraction
// ─────────────────────────────────────────────────────────────────────────────

interface RawEntity {
  name: string;
  type: string;
}

async function llmExtract(text: string): Promise<RawEntity[]> {
  const prompt =
    `Extract named entities from the following text.\n` +
    `For each entity identify its type from: company, person, model, technology, regulation, fund.\n` +
    `Return ONLY valid JSON in this exact shape: {"entities":[{"name":"string","type":"string"}]}\n` +
    `Limit to the 8 most relevant entities. Use "technology" as the default type if unsure.\n\n` +
    `TEXT:\n${text.slice(0, 1500)}`;

  const provider = await getProvider();
  const raw = await provider.classify(prompt);
  const match = raw.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(match ? match[0] : raw) as { entities: RawEntity[] };
  if (!Array.isArray(parsed.entities)) throw new Error('Invalid entity response shape');

  return parsed.entities
    .filter((e) => typeof e.name === 'string' && e.name.trim())
    .map((e) => ({
      name: e.name.trim(),
      type: VALID_TYPES.has(e.type) ? e.type : 'technology',
    }))
    .slice(0, 8);
}

// ─────────────────────────────────────────────────────────────────────────────
// Regex fallback
// ─────────────────────────────────────────────────────────────────────────────

function fallbackExtract(text: string): RawEntity[] {
  const pattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g;
  const stopWords = new Set([
    'The', 'A', 'An', 'This', 'That', 'These', 'Those',
    'In', 'On', 'At', 'To', 'By', 'For', 'With', 'From',
    'And', 'But', 'Not', 'Are', 'Was', 'Were', 'Has', 'Have',
    'Its', 'Our', 'New', 'All', 'May', 'Can', 'Will', 'How',
  ]);
  const seen = new Set<string>();
  const entities: RawEntity[] = [];

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
