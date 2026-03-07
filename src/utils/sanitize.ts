/**
 * Security utilities for content sanitization.
 * Critical for preventing XSS in user-facing content.
 */

/** Escape HTML entities to prevent XSS */
export function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Validate URLs — only allow https, http, and hash links */
export function safeUrl(url: string): string {
  if (!url) return '#';
  const trimmed = url.trim();
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://') || trimmed.startsWith('#')) {
    return trimmed;
  }
  return '#';
}

/** Generate URL-safe slug from a title */
export function slugify(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

/** Truncate text to a max length with ellipsis */
export function truncate(str: string, maxLen: number): string {
  if (!str || str.length <= maxLen) return str || '';
  return str.slice(0, maxLen - 1) + '…';
}

/** Detect article category from text content */
export function detectCategory(text: string): string {
  if (/fund|billion|invest|rais/i.test(text)) return 'funding';
  if (/regulat|law|bill|govern|policy|act\b/i.test(text)) return 'regulation';
  if (/agent|autonom|workflow/i.test(text)) return 'agents';
  if (/model|gpt|claude|gemini|llm|mistral/i.test(text)) return 'models';
  if (/research|paper|benchmark|study/i.test(text)) return 'research';
  return 'product';
}
