/**
 * Performance Monitoring Hook — Placeholder for Core Web Vitals tracking.
 *
 * Next.js has built-in reporting via next/web-vitals.
 * This hook provides a manual interface for custom metrics.
 *
 * Recommended integrations:
 * 1. Vercel Analytics (built-in with Vercel deployment)
 * 2. PostHog — can receive web vitals data
 * 3. Custom endpoint for internal dashboards
 */

export function usePerformance() {
  const measureTiming = (label: string, startTime: number) => {
    const duration = performance.now() - startTime;
    // Future: send to analytics endpoint
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[perf] ${label}: ${duration.toFixed(2)}ms`);
    }
  };

  return { measureTiming };
}
