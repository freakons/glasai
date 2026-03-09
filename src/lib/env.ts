/**
 * Omterminal — Environment Validation
 *
 * Validates that critical environment variables are present before API routes
 * execute.  In production every missing variable throws immediately so the
 * deployment fails loudly rather than silently serving stale mock data.
 * In development the check is skipped to preserve the local workflow.
 *
 * Usage
 * ─────
 *   import { validateEnvironment, warnMissingOptional } from '@/lib/env';
 *
 *   // At the top of a route handler:
 *   validateEnvironment(['DATABASE_URL', 'CRON_SECRET']);
 *
 *   // For optional-but-important vars (e.g. LLM keys):
 *   warnMissingOptional(['GROK_API_KEY', 'OPENAI_API_KEY']);
 *
 * LLM provider selection (AI_PROVIDER env var):
 *   AI_PROVIDER=grok    → requires GROK_API_KEY
 *   AI_PROVIDER=openai  → requires OPENAI_API_KEY
 *   AI_PROVIDER=ollama  → requires local Ollama at http://localhost:11434
 *   (unset)             → auto-detect: Ollama → Grok → OpenAI
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Variables that MUST be set in production for the app to function. */
export const CRITICAL_VARS = [
  'DATABASE_URL',
  'CRON_SECRET',
  'ADMIN_SECRET',
  'GNEWS_API_KEY',
] as const;

/** Variables that are optional but emit warnings when absent. */
export const OPTIONAL_VARS = [
  'GROK_API_KEY',    // LLM: Grok provider (xAI)
  'OPENAI_API_KEY',  // LLM: OpenAI provider (fallback)
  'RESEND_KEY',      // Email: digest & waitlist
] as const;

export type CriticalVar = (typeof CRITICAL_VARS)[number];
export type OptionalVar = (typeof OPTIONAL_VARS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Core
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assert that the specified environment variables are set.
 *
 * - **Production** (`NODE_ENV === 'production'`): throws an `Error` listing
 *   every missing variable so the request fails with a clear 500 rather than
 *   silently falling back to mock data.
 * - **Development / test**: no-op — allows local work without a full env file.
 *
 * @param required  Subset of critical variable names to check.
 *                  Defaults to all four critical variables when omitted.
 *
 * @example
 * validateEnvironment(['DATABASE_URL', 'CRON_SECRET']);
 *
 * @throws {Error} In production when one or more variables are missing.
 */
export function validateEnvironment(required: CriticalVar[] = [...CRITICAL_VARS]): void {
  if (process.env.NODE_ENV !== 'production') return;

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable${missing.length > 1 ? 's' : ''}: ` +
        missing.join(', ') +
        '. Configure these in your deployment environment before going live.'
    );
  }
}

/**
 * Emit console warnings for optional variables that are not configured.
 * Never throws — useful for LLM provider keys and integrations.
 *
 * @param vars  Subset of optional variable names to check.
 *              Defaults to all optional variables when omitted.
 */
export function warnMissingOptional(vars: OptionalVar[] = [...OPTIONAL_VARS]): void {
  const missing = vars.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.warn(
      `[env] Optional environment variable${missing.length > 1 ? 's' : ''} not set: ` +
        missing.join(', ') +
        '. Some features may be degraded.',
    );
  }
}

/**
 * Check whether at least one LLM provider is configured.
 * Logs a warning if no provider is available.
 *
 * Providers checked (in priority order):
 *   1. Ollama  — always available if running locally
 *   2. Grok    — requires GROK_API_KEY
 *   3. OpenAI  — requires OPENAI_API_KEY
 */
export function checkLLMProvider(): void {
  const hasGrok   = Boolean(process.env.GROK_API_KEY);
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);

  if (!hasGrok && !hasOpenAI) {
    console.warn(
      '[env] No LLM API key configured (GROK_API_KEY or OPENAI_API_KEY). ' +
        'The pipeline will attempt to use a local Ollama instance. ' +
        'Set AI_PROVIDER=grok with GROK_API_KEY for production use.',
    );
  } else {
    const active = process.env.AI_PROVIDER?.toLowerCase() ?? 'auto';
    console.log(`[env] LLM provider: ${active} (grok=${hasGrok} openai=${hasOpenAI})`);
  }
}
