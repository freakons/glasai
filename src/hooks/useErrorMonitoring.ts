/**
 * Error Monitoring Hook — Placeholder for future Sentry integration.
 *
 * Implementation:
 * npm install @sentry/nextjs
 * Run: npx @sentry/wizard@latest -i nextjs
 */

export function useErrorMonitoring() {
  const captureError = (error: Error, context?: Record<string, unknown>) => {
    // Future: Sentry.captureException(error, { extra: context });
    console.error('[error-monitor]', error.message, context);
  };

  const captureMessage = (message: string, level: 'info' | 'warning' | 'error' = 'info') => {
    // Future: Sentry.captureMessage(message, level);
    console.log(`[error-monitor:${level}]`, message);
  };

  return { captureError, captureMessage };
}
