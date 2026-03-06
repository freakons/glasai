/**
 * Analytics Hook — Placeholder for future analytics integration.
 *
 * Recommended providers (in order):
 * 1. PostHog — product analytics + session replay + feature flags
 * 2. Plausible — privacy-first web analytics (lightweight)
 *
 * Implementation:
 * npm install posthog-js
 * Initialize in layout.tsx with PostHogProvider
 */

export function useAnalytics() {
  const trackEvent = (event: string, properties?: Record<string, unknown>) => {
    // Future: posthog.capture(event, properties);
    if (process.env.NODE_ENV === 'development') {
      console.debug('[analytics]', event, properties);
    }
  };

  const trackPageView = (path: string) => {
    trackEvent('$pageview', { path });
  };

  return { trackEvent, trackPageView };
}
