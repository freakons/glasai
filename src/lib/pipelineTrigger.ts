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

  void runPipeline();
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal
// ─────────────────────────────────────────────────────────────────────────────

async function runPipeline(): Promise<void> {
  try {
    // Dynamic imports keep these heavy modules out of the /api/opportunities
    // bundle — they are only loaded when this function actually executes.
    const { ingestGNews }              = await import('@/services/ingestion/gnewsFetcher');
    const { getRecentEvents }          = await import('@/services/storage/eventStore');
    const { generateSignalsFromEvents } = await import('@/services/signals/signalEngine');
    const { saveSignals }              = await import('@/services/storage/signalStore');

    const { ingested }     = await ingestGNews();
    const events           = await getRecentEvents(500);
    const signals          = generateSignalsFromEvents(events);
    const signalsSaved     = await saveSignals(signals);

    console.log(
      `[pipeline] self-heal complete — ingested=${ingested} events=${events.length} signals=${signalsSaved}`,
    );
  } catch (err) {
    console.error(
      '[pipeline] self-heal failed:',
      err instanceof Error ? err.message : String(err),
    );
  }
}
