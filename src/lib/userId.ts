/**
 * Omterminal — Anonymous User Identity
 *
 * Provides a persistent anonymous user ID via a cookie (`omterminal_uid`).
 * This is the smallest practical identity mechanism: a UUID stored in a
 * long-lived cookie that survives across sessions and browser restarts.
 *
 * When a full authentication system is added, this can be replaced by
 * reading the authenticated user's ID from the session. The cookie-based
 * approach ensures watchlist persistence works immediately without requiring
 * user registration.
 *
 * Client-side: getUserId() reads/writes the cookie directly.
 * Server-side: getUserIdFromRequest() reads from the request cookies.
 */

const COOKIE_NAME = 'omterminal_uid';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 2; // 2 years

// ─────────────────────────────────────────────────────────────────────────────
// Client-side
// ─────────────────────────────────────────────────────────────────────────────

/** Read or create the anonymous user ID cookie (client-side only). */
export function getUserId(): string | null {
  if (typeof document === 'undefined') return null;

  // Try to read existing cookie
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (match) return match[1];

  // Generate and persist a new UUID
  const uid = crypto.randomUUID();
  document.cookie =
    `${COOKIE_NAME}=${uid}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
  return uid;
}

/** Check whether a user ID exists (client-side). */
export function hasUserId(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.includes(`${COOKIE_NAME}=`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Server-side
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract the user ID from a Next.js request's cookies.
 * Returns null if the cookie is not present.
 */
export function getUserIdFromRequest(req: { cookies: { get: (name: string) => { value: string } | undefined } }): string | null {
  const cookie = req.cookies.get(COOKIE_NAME);
  return cookie?.value ?? null;
}

export { COOKIE_NAME, COOKIE_MAX_AGE };
