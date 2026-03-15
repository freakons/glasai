/**
 * Omterminal — Background Pipeline Trigger
 *
 * Fires the ingestion → signal-generation pipeline once in the background
 * when the database is found empty, so the platform self-heals on first
 * deploy without operator intervention.
 *
 * Cooldown
 * ────────
 * A module-level timestamp prevents more than one trigger per
 * COOLDOWN_MS window within the same serverless function instance.
 * On Vercel, a warm instance handles several requests before being
 * recycled, so the cooldown is effective against the tight polling
 * loops that OpportunityFeed and MarketPulse create (5 s / 10 s).
 *
 * Usage
 * ─────
 *   import { triggerPipelineOnce } from '@/lib/pipelineTrigger';
 *   triggerPipelineOnce(); // fire-and-forget, safe to call on every request
 */

import { enqueue } from '@/lib/queue';
import { acquirePipelineLock, releasePipelineLock } from '@/lib/pipeline/lock';

// Heavy service modules are imported dynamically inside runPipeline() so they
// are excluded from the bundle of any route that imports this module at the
// top level (e.g. /api/opportunities).  The import() calls resolve instantly
// from the module cache on subsequent invocations within the same instance.

// ─────────────────────────────────────────────────────────────────────────────
// Cooldown state
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum gap between pipeline triggers within one function instance. */
const COOLDOWN_MS = 5 * 60 * 1_000; // 5 minutes

/** Epoch-ms of the last trigger dispatch. 0 = never triggered. */
let lastTriggeredAt = 0;

/** True while a pipeline execution is in progress. */
let pipelineRunning = false;

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dispatch a background pipeline run if the cooldown has elapsed.
 *
 * - **Non-blocking**: starts an async task but does not await it, so the
 *   caller's response is sent immediately.
 * - **Idempotent within cooldown window**: repeated calls within
 *   COOLDOWN_MS are silently ignored, preventing feedback loops.
 * - **Errors are swallowed**: failures are logged but never propagate to
 *   the caller — the trigger is best-effort.
 */
export function triggerPipelineOnce(): void {
  const now = Date.now();

  if (now - lastTriggeredAt < COOLDOWN_MS) {
    console.log('[pipeline] self-heal skipped — cooldown active');
    return;
  }

  // Claim the slot immediately so concurrent requests in the same instance
  // see the updated timestamp before the async work begins.
  lastTriggeredAt = now;

  void enqueue(async () => {
    await runPipelineSafe();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal
// ─────────────────────────────────────────────────────────────────────────────

export async function runPipelineSafe(): Promise<void> {
  if (pipelineRunning) {
    console.log('[pipeline] already running in this instance, skipping');
    return;
  }

  // Acquire the distributed lock to prevent overlap across serverless instances
  const lockResult = await acquirePipelineLock('self-heal');
  if (!lockResult.acquired) {
    console.log(`[pipeline] self-heal skipped — distributed lock held (${lockResult.reason})`);
    return;
  }

  pipelineRunning = true;
  try {
    await runPipeline();
  } finally {
    pipelineRunning = false;
    await releasePipelineLock(lockResult.lockId);
    console.log('[pipeline] self-heal lock released');
  }
}

async function runPipeline(): Promise<void> {
  try {
    // Dynamic imports keep these heavy modules out of the /api/opportunities
    // bundle — they are only loaded when this function actually executes.
    const { ingestRss }                 = await import('@/services/ingestion/rssIngester');
    const { ingestGNews }               = await import('@/services/ingestion/gnewsFetcher');
    const { getRecentEvents }           = await import('@/services/storage/eventStore');
    const { generateSignalsFromEvents } = await import('@/services/signals/signalEngine');
    const { saveSignals }               = await import('@/services/storage/signalStore');
    const { recordPipelineRun }         = await import('@/lib/pipelineHealth');

    // RSS (primary — no quota limits)
    let rssArticlesNew = 0;
    try {
      const rssResult = await ingestRss();
      rssArticlesNew = rssResult.articlesNew;
    } catch (rssErr) {
      console.error('[pipeline] self-heal RSS error:', rssErr instanceof Error ? rssErr.message : String(rssErr));
    }

    // GNews (secondary — quota-aware, reduced queries via GNEWS_MAX_QUERIES)
    const { ingested }  = await ingestGNews();

    const events        = await getRecentEvents(500);
    const signals       = generateSignalsFromEvents(events);
    const signalsResult = await saveSignals(signals);

    recordPipelineRun(signalsResult.inserted);
    console.log(
      `[pipeline] self-heal complete — rssArticles=${rssArticlesNew} gnewsIngested=${ingested} events=${events.length} signalsDetected=${signalsResult.detected} signalsInserted=${signalsResult.inserted} signalsSkipped=${signalsResult.skipped}`,
    );

    // ── Context generation stage ───────────────────────────────────────────
    // Runs after signal persistence.  Failures are non-fatal: a per-signal
    // error is recorded in signal_contexts.generation_error and the pipeline
    // continues normally.
    //
    // Version-aware regeneration: markSignalContextPending resets 'ready'
    // contexts whose prompt_version != CONTEXT_PROMPT_VERSION, ensuring that
    // incrementing the constant automatically triggers regeneration for signals
    // processed in this run.  For a full database-wide reset of all stale
    // contexts, call resetOutdatedContexts(CONTEXT_PROMPT_VERSION) from an
    // admin endpoint or maintenance script.
    try {
      const { generateContextsForSignals, CONTEXT_PROMPT_VERSION } =
        await import('@/services/intelligence/contextGenerator');
      const ctx = await generateContextsForSignals(signals, events);

      if (ctx.attempted === 0) {
        console.log(`[pipeline] context stage — no contexts to generate (prompt_version=${CONTEXT_PROMPT_VERSION})`);
      } else {
        console.log(
          `[pipeline] context stage — attempted=${ctx.attempted} generated=${ctx.generated} failed=${ctx.failed} prompt_version=${CONTEXT_PROMPT_VERSION}`,
        );
      }

      if (ctx.failed > 0) {
        console.warn(
          `[pipeline] context stage — ${ctx.failed} context(s) failed; see signal_contexts.generation_error for details`,
        );
      }
    } catch (ctxErr) {
      console.error(
        '[pipeline] context generation stage error:',
        ctxErr instanceof Error ? ctxErr.message : String(ctxErr),
      );
    }
  } catch (err) {
    console.error(
      '[pipeline] self-heal failed:',
      err instanceof Error ? err.message : String(err),
    );
  }
}
