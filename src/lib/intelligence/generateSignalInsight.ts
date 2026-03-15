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
 *   - Dedup: checks for reusable intelligence before calling LLM
 *   - Constrained: output is truncated to keep insights concise
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

/** Result metadata returned alongside insight for operational tracking. */
export interface SignalInsightResult {
  insight: SignalInsight;
  /** Whether the insight was reused from a similar signal (no LLM call). */
  reused: boolean;
  /** Error message if generation failed (sanitized, no stack traces). */
  error?: string;
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
// Output length constraints
// ─────────────────────────────────────────────────────────────────────────────

/** Max character lengths for each insight field. Keeps outputs concise. */
const MAX_LEN = {
  why_this_matters: 200,
  strategic_impact: 200,
  who_should_care:  150,
  prediction:       150,
} as const;

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

Generate a concise intelligence assessment. Be extremely brief — each field must be 1–2 short sentences MAX. No filler, no hedging, no preamble. Write in a direct analytical tone.

Output ONLY a valid JSON object — no markdown, no explanation, no code blocks. Use this exact schema:
{
  "why_this_matters": "1–2 short sentences on why this signal is significant. Max 200 chars.",
  "strategic_impact": "1–2 short sentences on strategic implications. Max 200 chars.",
  "who_should_care": "Concise comma-separated list of affected roles (e.g. 'CTOs, AI PMs, investors'). Max 150 chars.",
  "prediction": "1 short sentence on where this leads, or null if uncertain. Max 150 chars."
}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsing & post-processing
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

  return constrainInsight({
    why_this_matters: trimStr(parsed.why_this_matters),
    strategic_impact: trimStr(parsed.strategic_impact),
    who_should_care: trimStr(parsed.who_should_care),
    prediction: trimStr(parsed.prediction),
  });
}

function trimStr(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Apply hard length constraints and clean up output.
 * Truncates at the last sentence boundary within the limit when possible.
 */
function constrainInsight(insight: SignalInsight): SignalInsight {
  return {
    why_this_matters: truncateField(insight.why_this_matters, MAX_LEN.why_this_matters),
    strategic_impact: truncateField(insight.strategic_impact, MAX_LEN.strategic_impact),
    who_should_care:  truncateField(insight.who_should_care, MAX_LEN.who_should_care),
    prediction:       truncateField(insight.prediction, MAX_LEN.prediction),
  };
}

function truncateField(value: string | null, maxLen: number): string | null {
  if (!value) return null;
  if (value.length <= maxLen) return value;
  // Try to cut at the last sentence boundary
  const truncated = value.slice(0, maxLen);
  const lastPeriod = truncated.lastIndexOf('.');
  if (lastPeriod > maxLen * 0.5) {
    return truncated.slice(0, lastPeriod + 1);
  }
  return truncated.slice(0, maxLen - 1) + '…';
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty insight constant
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_INSIGHT: SignalInsight = {
  why_this_matters: null,
  strategic_impact: null,
  who_should_care: null,
  prediction: null,
};

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
  const result = await generateSignalInsightWithMeta(input);
  return result.insight;
}

/**
 * Generate intelligence insight with operational metadata.
 *
 * Returns both the insight and metadata (reused flag, error info).
 * Never throws.
 */
export async function generateSignalInsightWithMeta(
  input: SignalInsightInput,
): Promise<SignalInsightResult> {
  try {
    // Attempt dedup/reuse before calling LLM
    const { findReusableInsight } = await import('@/services/storage/signalStore');
    const reusable = await findReusableInsight({
      title: input.title,
      entities: input.entities,
      signalType: input.signalType,
    });

    if (reusable) {
      console.log(
        `[generateSignalInsight] reused existing insight` +
        ` title="${input.title.slice(0, 60)}"`,
      );
      return { insight: constrainInsight(reusable), reused: true };
    }
  } catch {
    // Dedup lookup failure is non-fatal — fall through to LLM generation
  }

  try {
    const provider = await getProvider();
    const providerName = getActiveProviderName() ?? 'unknown';
    const prompt = buildInsightPrompt(input);

    const raw = await withTimeout(
      provider.generate(prompt),
      GENERATION_TIMEOUT_MS,
      'signal-insight',
    );

    const insight = parseInsightResponse(raw);

    console.log(
      `[generateSignalInsight] provider=${providerName}` +
      ` title="${input.title.slice(0, 60)}" success=true`,
    );

    return { insight, reused: false };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    // Distinguish provider availability errors from generation errors
    const isProviderMissing = errorMsg.includes('No AI provider available')
      || errorMsg.includes('API_KEY is required');
    const logLevel = isProviderMissing ? 'warn' : 'error';
    const hint = isProviderMissing
      ? ' — set GROQ_API_KEY (or GROK_API_KEY / OPENAI_API_KEY) in env'
      : '';
    console[logLevel](
      `[generateSignalInsight] failed for "${input.title.slice(0, 60)}": ${errorMsg}${hint}`,
    );
    return { insight: { ...EMPTY_INSIGHT }, reused: false, error: errorMsg };
  }
}

/**
 * Generate insights for a batch of signals. Non-blocking; failures are
 * isolated per signal and logged.
 *
 * Returns a Map of signal ID → SignalInsightResult (with reuse/error metadata).
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
): Promise<Map<string, SignalInsightResult>> {
  const results = new Map<string, SignalInsightResult>();

  for (const signal of signals) {
    const result = await generateSignalInsightWithMeta({
      title: signal.title,
      summary: signal.description,
      entities: signal.affectedEntities ?? [],
      signalType: signal.type,
      direction: signal.direction,
    });
    results.set(signal.id, result);
  }

  return results;
}
