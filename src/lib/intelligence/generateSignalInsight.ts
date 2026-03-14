/**
 * Omterminal — Signal Intelligence Generator ("Why This Matters")
 *
 * Generates structured intelligence insights for signals by calling the
 * configured LLM provider.  Produces:
 *   - why_this_matters   — plain-language significance
 *   - strategic_impact   — strategic implications for decision-makers
 *   - who_should_care    — target roles / audiences
 *   - prediction         — optional forward-looking assessment
 *
 * Design:
 *   - Safe fallbacks on LLM failure (returns null fields)
 *   - Hard timeout to avoid blocking the pipeline
 *   - All errors are logged but never thrown to callers
 *   - Non-blocking: designed to run after signal persistence
 */

import { getProvider, getActiveProviderName } from '@/lib/ai';
import { withTimeout } from '@/lib/withTimeout';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SignalInsight {
  why_this_matters: string | null;
  strategic_impact: string | null;
  who_should_care: string | null;
  prediction: string | null;
}

export interface SignalInsightInput {
  title: string;
  summary: string;
  entities: string[];
  signalType?: string;
  direction?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum time to wait for LLM generation (ms). */
const GENERATION_TIMEOUT_MS = parseInt(
  process.env.INSIGHT_GENERATION_TIMEOUT_MS ?? '15000',
  10,
);

// ─────────────────────────────────────────────────────────────────────────────
// Prompt
// ─────────────────────────────────────────────────────────────────────────────

function buildInsightPrompt(input: SignalInsightInput): string {
  const entitiesLine = input.entities.length > 0
    ? input.entities.join(', ')
    : 'Not specified';

  return `You are an AI intelligence analyst writing for senior decision-makers.

SIGNAL:
Title: ${input.title}
Summary: ${input.summary.slice(0, 500)}
${input.signalType ? `Type: ${input.signalType}` : ''}
${input.direction ? `Direction: ${input.direction}` : ''}
Entities: ${entitiesLine}

Generate a concise intelligence assessment. Output ONLY a valid JSON object — no markdown, no explanation, no code blocks. Use this exact schema:
{
  "why_this_matters": "1-2 sentences explaining why this signal is significant for AI industry decision-makers",
  "strategic_impact": "1-2 sentences on the strategic implications — what this means for competitive positioning, investment, or policy",
  "who_should_care": "Brief list of roles/stakeholders most affected (e.g. 'CTOs, AI product managers, investors in foundation model companies')",
  "prediction": "1 sentence forward-looking assessment of where this trend leads (or null if uncertain)"
}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsing
// ─────────────────────────────────────────────────────────────────────────────

function parseInsightResponse(raw: string): SignalInsight {
  let parsed: Record<string, unknown>;

  // Attempt 1: direct parse
  try {
    parsed = JSON.parse(raw.trim()) as Record<string, unknown>;
  } catch {
    // Attempt 2: extract from markdown code fence
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenceMatch) {
      try {
        parsed = JSON.parse(fenceMatch[1]) as Record<string, unknown>;
      } catch {
        parsed = {};
      }
    } else {
      // Attempt 3: extract first { … } block
      const braceMatch = raw.match(/\{[\s\S]*\}/);
      if (!braceMatch) {
        throw new Error(`No JSON found in insight response: ${raw.slice(0, 200)}`);
      }
      try {
        parsed = JSON.parse(braceMatch[0]) as Record<string, unknown>;
      } catch {
        throw new Error(`Failed to parse insight JSON: ${raw.slice(0, 200)}`);
      }
    }
  }

  return {
    why_this_matters: trimStr(parsed.why_this_matters, 500),
    strategic_impact: trimStr(parsed.strategic_impact, 500),
    who_should_care: trimStr(parsed.who_should_care, 300),
    prediction: trimStr(parsed.prediction, 300),
  };
}

function trimStr(value: unknown, maxLen: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLen) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate intelligence insight for a single signal.
 *
 * Returns a structured SignalInsight on success, or an object with all null
 * fields on failure. Never throws.
 */
export async function generateSignalInsight(
  input: SignalInsightInput,
): Promise<SignalInsight> {
  const empty: SignalInsight = {
    why_this_matters: null,
    strategic_impact: null,
    who_should_care: null,
    prediction: null,
  };

  try {
    const provider = await getProvider();
    const prompt = buildInsightPrompt(input);

    const raw = await withTimeout(
      provider.generate(prompt),
      GENERATION_TIMEOUT_MS,
      'signal-insight',
    );

    const insight = parseInsightResponse(raw);

    console.log(
      `[generateSignalInsight] provider=${getActiveProviderName() ?? 'unknown'}` +
      ` title="${input.title.slice(0, 60)}" success=true`,
    );

    return insight;
  } catch (err) {
    console.error(
      `[generateSignalInsight] generation failed for "${input.title.slice(0, 60)}":`,
      err instanceof Error ? err.message : String(err),
    );
    return empty;
  }
}

/**
 * Generate insights for a batch of signals. Non-blocking; failures are
 * isolated per signal and logged.
 *
 * Returns a Map of signal ID → SignalInsight.
 */
export async function generateInsightsForBatch(
  signals: Array<{
    id: string;
    title: string;
    description: string;
    affectedEntities?: string[];
    type?: string;
    direction?: string;
  }>,
): Promise<Map<string, SignalInsight>> {
  const results = new Map<string, SignalInsight>();

  for (const signal of signals) {
    const insight = await generateSignalInsight({
      title: signal.title,
      summary: signal.description,
      entities: signal.affectedEntities ?? [],
      signalType: signal.type,
      direction: signal.direction,
    });
    results.set(signal.id, insight);
  }

  return results;
}
