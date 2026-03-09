import { NormalizedSignal } from '@/harvester/types';
import { SignalCategory, ExtractedEntity, IntelligenceResult } from './types';
import { extractTopics } from '@/trends/topicExtractor';
import { getProvider } from '@/lib/ai';

// ── Category classification (rule-based fallback) ─────────────────────────────

const CATEGORY_RULES: Array<{ pattern: RegExp; category: SignalCategory }> = [
  { pattern: /\b(funding|raised|series [abcde]|seed round|investment|venture|vc|backed)\b/i, category: 'funding' },
  { pattern: /\b(model|llm|gpt|gemini|claude|mistral|release|launched|fine.?tun|weights|benchmark)\b/i, category: 'ai_model_release' },
  { pattern: /\b(tool|platform|sdk|api|plugin|extension|app|product)\b/i, category: 'tool_launch' },
  { pattern: /\b(startup|founded|company|inc\.|corp\.|co\.|team|hire|acqui)\b/i, category: 'ai_startup' },
  { pattern: /\b(research|paper|arxiv|study|findings|dataset|benchmark|experiment)\b/i, category: 'research' },
];

const VALID_CATEGORIES = new Set<SignalCategory>([
  'funding', 'ai_model_release', 'tool_launch', 'ai_startup', 'research', 'other',
]);

function ruleBasedClassify(text: string): { category: SignalCategory; confidence: number } {
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(text)) {
      return { category: rule.category, confidence: 65 };
    }
  }
  return { category: 'other', confidence: 50 };
}

// ── Entity extraction ─────────────────────────────────────────────────────────

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

  return entities.slice(0, 10);
}

// ── Summary generation (static fallback) ─────────────────────────────────────

function extractSummary(content: string): string {
  if (!content) return '';
  const sentences = content.split(/\.(?:\s|\n)/).filter(Boolean);
  return sentences.slice(0, 2).join('. ').trim().slice(0, 300);
}

// ── AI-enhanced processing ────────────────────────────────────────────────────

async function aiClassify(text: string): Promise<SignalCategory | null> {
  try {
    const provider = await getProvider();
    const raw = await provider.classify(text);
    const label = raw.trim().toLowerCase() as SignalCategory;
    return VALID_CATEGORIES.has(label) ? label : null;
  } catch (err) {
    console.warn('[intelligence/processor] AI classify failed, using rule-based fallback:', err instanceof Error ? err.message : err);
    return null;
  }
}

async function aiSummarize(text: string): Promise<string | null> {
  try {
    const provider = await getProvider();
    return await provider.summarize(text);
  } catch (err) {
    console.warn('[intelligence/processor] AI summarize failed, using static fallback:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function processSignal(signal: NormalizedSignal): Promise<IntelligenceResult> {
  const text = `${signal.title} ${signal.description}`;

  // Attempt AI-enhanced classification and summarization; fall back gracefully.
  const [aiCategory, aiSummary, topics] = await Promise.all([
    aiClassify(text),
    aiSummarize(signal.description || signal.title),
    extractTopics(signal.title + ' ' + signal.description),
  ]);

  const { category: ruleCategory, confidence: ruleConfidence } = ruleBasedClassify(text);
  const category = aiCategory ?? ruleCategory;
  // Bump confidence when AI classification agrees with or overrides rules.
  const confidence = aiCategory ? Math.min(ruleConfidence + 15, 95) : ruleConfidence;

  const entities: ExtractedEntity[] = topics.map((name) => ({ type: 'mention', name }));
  const summary = aiSummary || extractSummary(signal.description) || signal.title;

  return { category, entities, summary, confidence };
}
