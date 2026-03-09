import { NormalizedSignal } from '@/harvester/types';
import { SignalCategory, ExtractedEntity, IntelligenceResult } from './types';

// ── Category classification ───────────────────────────────────────────────────

const CATEGORY_RULES: Array<{ pattern: RegExp; category: SignalCategory }> = [
  { pattern: /\b(funding|raised|series [abcde]|seed round|investment|venture|vc|backed)\b/i, category: 'funding' },
  { pattern: /\b(model|llm|gpt|gemini|claude|mistral|release|launched|fine.?tun|weights|benchmark)\b/i, category: 'ai_model_release' },
  { pattern: /\b(tool|platform|sdk|api|plugin|extension|app|product)\b/i, category: 'tool_launch' },
  { pattern: /\b(startup|founded|company|inc\.|corp\.|co\.|team|hire|acqui)\b/i, category: 'ai_startup' },
  { pattern: /\b(research|paper|arxiv|study|findings|dataset|benchmark|experiment)\b/i, category: 'research' },
];

function classifyCategory(text: string): { category: SignalCategory; confidence: number } {
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(text)) {
      return { category: rule.category, confidence: 65 };
    }
  }
  return { category: 'other', confidence: 50 };
}

// ── Entity extraction ─────────────────────────────────────────────────────────

// Matches sequences of capitalized words (2–4 words), skipping common sentence starters.
const CAPITALIZED_PHRASE = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/g;
const STOP_WORDS = new Set(['The', 'A', 'An', 'This', 'That', 'These', 'Those', 'In', 'On', 'At', 'To', 'By', 'For', 'Of', 'And', 'Or', 'But']);

function extractEntities(text: string): ExtractedEntity[] {
  const seen = new Set<string>();
  const entities: ExtractedEntity[] = [];

  let match: RegExpExecArray | null;
  CAPITALIZED_PHRASE.lastIndex = 0;

  while ((match = CAPITALIZED_PHRASE.exec(text)) !== null) {
    const name = match[1].trim();
    if (STOP_WORDS.has(name) || seen.has(name)) continue;
    seen.add(name);
    entities.push({ type: 'mention', name });
  }

  return entities.slice(0, 10); // cap at 10 entities per signal
}

// ── Summary generation ────────────────────────────────────────────────────────

function extractSummary(content: string): string {
  if (!content) return '';
  // Take up to the first two sentences (split on '. ' or '.\n').
  const sentences = content.split(/\.(?:\s|\n)/).filter(Boolean);
  return sentences.slice(0, 2).join('. ').trim().slice(0, 300);
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function processSignal(signal: NormalizedSignal): Promise<IntelligenceResult> {
  const text = `${signal.title} ${signal.description}`;

  const { category, confidence } = classifyCategory(text);
  const entities = extractEntities(text);
  const summary = extractSummary(signal.description) || signal.title;

  return { category, entities, summary, confidence };
}
