import type { NextRequest } from 'next/server';

export function createRequestId() {
  return crypto.randomUUID()
}

/**
 * Extract the request ID from the incoming `x-request-id` header, or
 * generate a fresh UUID when none is provided.  This allows callers to
 * propagate a correlation ID across service boundaries.
 */
export function getOrCreateRequestId(req: NextRequest): string {
  return req.headers.get('x-request-id') ?? createRequestId();
}

export function logWithRequestId(
  id: string,
  scope: string,
  message: string
) {
  console.log(`[${scope}] id=${id} ${message}`)
}
