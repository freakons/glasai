/**
 * Omterminal — Signal Context Generator
 *
 * Generates structured AI intelligence context for signals during the
 * write-side pipeline.  Context is persisted to signal_contexts; public
 * pages never call this module.
 *
 * Pipeline position:
 *   signal store → contextGenerator (mark pending → generate → persist)
 *
 * Exports:
 *   CONTEXT_PROMPT_VERSION     — semver constant for the current prompt template
 *   generateContextsForSignals — pipeline stage runner; processes eligible signals
 */

import type { Signal, Event, SignalContextEntity } from '@/types/intelligence';
import { getProvider, getActiveProviderName } from '@/lib/ai';
import { tableExists } from '@/db/client';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Semver of the current context generation prompt.
 * Increment this when the prompt structure changes to enable targeted
 * regeneration of contexts generated with earlier prompts.
 */
export const CONTEXT_PROMPT_VERSION = '1.0.0';

/** Known default model names per provider for metadata capture. */
const PROVIDER_DEFAULT_MODELS: Record<string, string> = {
  groq:   'llama-3.3-70b-versatile',
  openai: 'gpt-4o',
  grok:   'grok-beta',
  ollama: 'llama3',
};

// ─────────────────────────────────────────────────────────────────────────────
// Public pipeline stage runner
// ─────────────────────────────────────────────────────────────────────────────

/** Counts returned to the pipeline for reporting. */
export interface ContextGenerationCounts {
  attempted: number;
  generated: number;
  failed:    number;
}

/**
 * Pipeline stage: generate intelligence context for a batch of signals.
 *
 * Processing flow per signal:
 *   1. Attempt to mark the signal_contexts row as 'pending'.
 *      Signals already at 'ready' are skipped (non-destructive).
 *   2. For signals that became pending, assemble compact prompt input from
 *      available events.
 *   3. Call the active AI provider and validate the JSON output.
 *   4. Upsert status='ready' on success, or status='failed' on error.
 *
 * A per-signal failure does NOT abort the batch or the parent pipeline run.
 * If no AI provider is configured the stage exits cleanly with zero counts.
 *
 * @param signals  Signals detected in the current pipeline run.
 * @param events   Recent events available as supporting evidence.
 * @returns        Counts for pipeline reporting.
 */
export async function generateContextsForSignals(
  signals: Signal[],
  events:  Event[],
): Promise<ContextGenerationCounts> {
  if (signals.length === 0) {
    return { attempted: 0, generated: 0, failed: 0 };
  }

  // Guard: skip silently if migration 006 has not been applied.
  if (!(await tableExists('signal_contexts'))) {
    console.log('[contextGenerator] signal_contexts table not found — skipping context generation');
    return { attempted: 0, generated: 0, failed: 0 };
  }

  // Resolve the AI provider once for the whole batch.
  let provider: Awaited<ReturnType<typeof getProvider>>;
  try {
    provider = await getProvider();
  } catch (err) {
    console.warn(
      '[contextGenerator] No AI provider available — skipping context generation:',
      err instanceof Error ? err.message : String(err),
    );
    return { attempted: 0, generated: 0, failed: 0 };
  }

  const providerName = getActiveProviderName() ?? 'unknown';
  const modelName    = PROVIDER_DEFAULT_MODELS[providerName] ?? providerName;

  const {
    markSignalContextPending,
    upsertReadySignalContext,
    recordFailedSignalContext,
  } = await import('@/services/storage/signalContextStore');

  // Build an event index for O(1) lookup by ID.
  const eventIndex = new Map(events.map(e => [e.id, e]));

  // Mark all signals as pending (idempotent; 'ready' rows are untouched).
  const markResults = await Promise.allSettled(
    signals.map(async (s) => {
      const marked = await markSignalContextPending(s.id, CONTEXT_PROMPT_VERSION);
      return { signal: s, marked };
    }),
  );

  // Collect only the signals that were actually set to pending.
  const toProcess: Signal[] = [];
  for (const result of markResults) {
    if (result.status === 'fulfilled' && result.value.marked) {
      toProcess.push(result.value.signal);
    }
  }

  if (toProcess.length === 0) {
    return { attempted: 0, generated: 0, failed: 0 };
  }

  let generated = 0;
  let failed    = 0;

  for (const signal of toProcess) {
    // Resolve up to 6 supporting events — enough for meaningful context
    // without bloating the prompt.
    const supportingEvents = signal.supportingEvents
      .map(id => eventIndex.get(id))
      .filter((e): e is Event => e != null)
      .slice(0, 6);

    try {
      const contextData = await generateSignalContext(signal, supportingEvents, provider);
      await upsertReadySignalContext(signal.id, {
        ...contextData,
        modelProvider: providerName,
        modelName,
        promptVersion: CONTEXT_PROMPT_VERSION,
      });
      generated++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(
        `[contextGenerator] context generation failed for signal ${signal.id}:`,
        errorMsg,
      );
      await recordFailedSignalContext(signal.id, errorMsg, {
        modelProvider: providerName,
        modelName,
        promptVersion: CONTEXT_PROMPT_VERSION,
      }).catch((e: unknown) => {
        // Recording the failure itself must not throw.
        console.error('[contextGenerator] could not record failure:', e);
      });
      failed++;
    }
  }

  return { attempted: toProcess.length, generated, failed };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────────────────────────────────────────

interface ContextInput {
  signalType:       string;
  title:            string;
  description:      string;
  direction:        string;
  confidenceScore:  number;
  affectedEntities: string[];
  supportingEvents: {
    type:        string;
    company:     string;
    title:       string;
    description: string;
  }[];
}

interface GeneratedContextFields {
  summary:               string;
  whyItMatters:          string;
  affectedEntities:      SignalContextEntity[];
  implications:          string[];
  confidenceExplanation: string;
  sourceBasis:           string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Generation helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assemble compact, deterministic prompt input from pipeline-available data.
 * Descriptions are capped to prevent bloated prompts.
 */
function buildContextInput(signal: Signal, events: Event[]): ContextInput {
  return {
    signalType:       signal.type ?? 'UNKNOWN',
    title:            signal.title,
    description:      signal.description.slice(0, 500),
    direction:        signal.direction ?? 'neutral',
    confidenceScore:  signal.confidenceScore,
    affectedEntities: signal.affectedEntities ?? [],
    supportingEvents: events.map(e => ({
      type:        e.type,
      company:     e.company,
      title:       e.title,
      description: e.description.slice(0, 200),
    })),
  };
}

/**
 * Build the LLM prompt from a ContextInput.
 *
 * The prompt explicitly defines the target JSON schema so the model knows
 * the exact output format required.  "Output ONLY a valid JSON object"
 * discourages markdown wrapping, which parseAndValidate handles anyway.
 */
function buildPrompt(input: ContextInput): string {
  const confidencePct = Math.round(input.confidenceScore * 100);
  const entitiesLine  = input.affectedEntities.length > 0
    ? input.affectedEntities.join(', ')
    : 'Not specified';
  const eventLines    = input.supportingEvents.length > 0
    ? input.supportingEvents
        .map(e => `- [${e.type}] ${e.company}: ${e.title}`)
        .join('\n')
    : '- No specific events available';

  return `You are an AI intelligence analyst generating context for professional decision-makers.

SIGNAL:
Type: ${input.signalType}
Title: ${input.title}
Direction: ${input.direction}
Confidence: ${confidencePct}%
Description: ${input.description}
Affected entities: ${entitiesLine}

SUPPORTING EVENTS:
${eventLines}

Output ONLY a valid JSON object — no markdown, no explanation, no code blocks.
Use this exact schema:
{
  "summary": "One-sentence headline capturing the core development (max 120 chars)",
  "why_it_matters": "2-3 sentence paragraph explaining significance for AI decision-makers",
  "affected_entities": [{"name": "EntityName", "type": "company|regulator|fund|researcher|other", "role": "brief role in this signal"}],
  "implications": ["Forward-looking implication 1", "Implication 2", "Implication 3"],
  "confidence_explanation": "Why this signal has ${confidencePct}% confidence (1-2 sentences)",
  "source_basis": "Brief citation of the key events and sources this analysis draws from (1 sentence)"
}`;
}

/**
 * Call the AI provider and return validated, normalised context fields.
 * Throws if the output cannot be parsed into a usable context.
 */
async function generateSignalContext(
  signal:          Signal,
  supportingEvents: Event[],
  provider:         Awaited<ReturnType<typeof getProvider>>,
): Promise<GeneratedContextFields> {
  const input  = buildContextInput(signal, supportingEvents);
  const prompt = buildPrompt(input);
  const raw    = await provider.generate(prompt);
  return parseAndValidate(raw, input);
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsing and validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse and normalise raw LLM output into validated context fields.
 *
 * Parsing strategy (attempted in order):
 *   1. Direct JSON.parse of the trimmed response.
 *   2. Extract from a markdown ```json ... ``` fence.
 *   3. Extract the first { … } block from the response.
 *
 * Normalisation strategy:
 *   - String fields are trimmed and capped at a safe length.
 *   - Missing optional fields fall back to signal-derived defaults.
 *   - Arrays are sanitised (type-checked, length-capped).
 *   - Throws only if no JSON can be found at all.
 */
function parseAndValidate(raw: string, input: ContextInput): GeneratedContextFields {
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
        throw new Error(
          `No JSON found in provider output (first 200 chars): ${raw.slice(0, 200)}`,
        );
      }
      try {
        parsed = JSON.parse(braceMatch[0]) as Record<string, unknown>;
      } catch {
        throw new Error(
          `Failed to parse JSON from provider output: ${raw.slice(0, 200)}`,
        );
      }
    }
  }

  // ── Normalise string fields ──────────────────────────────────────────────

  const summary = trimStr(parsed.summary, 500)
    ?? `${input.signalType.replace(/_/g, ' ')}: ${input.title}`.slice(0, 200);

  const whyItMatters = trimStr(parsed.why_it_matters, 1_000)
    ?? input.description.slice(0, 500);

  const confidenceExplanation = trimStr(parsed.confidence_explanation, 500)
    ?? `Confidence of ${Math.round(input.confidenceScore * 100)}% based on ${input.supportingEvents.length} supporting events.`;

  const sourceBasis = trimStr(parsed.source_basis, 500)
    ?? (input.supportingEvents.length > 0
        ? input.supportingEvents
            .slice(0, 3)
            .map(e => `${e.company} (${e.type})`)
            .join(', ')
        : 'Based on signal metadata.');

  // ── Normalise structured fields ──────────────────────────────────────────

  const affectedEntities = normaliseEntities(parsed.affected_entities, input.affectedEntities);
  const implications     = normaliseImplications(parsed.implications);

  return {
    summary,
    whyItMatters,
    affectedEntities,
    implications,
    confidenceExplanation,
    sourceBasis,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalisation utilities
// ─────────────────────────────────────────────────────────────────────────────

/** Trim and cap a string value; returns null for non-strings or empty values. */
function trimStr(value: unknown, maxLen: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLen) : null;
}

/** Normalise the affected_entities array, falling back to signal entity names. */
function normaliseEntities(
  raw:           unknown,
  fallbackNames: string[],
): SignalContextEntity[] {
  if (Array.isArray(raw)) {
    const entities: SignalContextEntity[] = raw
      .filter((item): item is Record<string, unknown> =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as Record<string, unknown>).name === 'string',
      )
      .map(item => ({
        name: String(item.name).trim().slice(0, 100),
        type: typeof item.type === 'string' ? item.type.trim().slice(0, 50) : undefined,
        role: typeof item.role === 'string' ? item.role.trim().slice(0, 100) : undefined,
      }))
      .slice(0, 10);

    if (entities.length > 0) return entities;
  }

  // Fallback: derive entities from signal's affectedEntities list.
  return fallbackNames.slice(0, 10).map(name => ({ name }));
}

/** Normalise the implications array — max 5 strings, each capped at 300 chars. */
function normaliseImplications(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map(item => item.trim().slice(0, 300))
    .slice(0, 5);
}
