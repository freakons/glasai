/**
 * parseFundingAmount.ts
 *
 * Normalises human-readable funding amounts into a numeric value in
 * approximate USD millions for aggregation and comparison.
 *
 * Supported input formats:
 *   "$40B"  "$2.4B"  "$500M"  "$450M"
 *   "€600M"  "£1.2B"  "¥300B"
 *   "Undisclosed"  "N/A"  ""
 *
 * Currency handling:
 *   Non-USD currencies (€, £, ¥) are stored as nominal millions without
 *   FX conversion.  This keeps aggregates stable and avoids rate-data
 *   dependencies.  Aggregated totals should be labelled "approx." in UI.
 *
 * Returns null for unrecognisable or undisclosed amounts.
 */

const UNDISCLOSED_TOKENS = new Set([
  'UNDISCLOSED', 'UNKNOWN', 'N/A', 'NA', '-', '', 'TBD', 'CONFIDENTIAL',
]);

/**
 * Parse a funding amount string into approximate USD millions.
 *
 * @param raw  Human-readable amount string, e.g. "$40B", "€600M".
 * @returns    Numeric value in millions, or null if unparseable / undisclosed.
 */
export function parseFundingAmountUsdM(raw: string): number | null {
  if (!raw) return null;

  const upper = raw.trim().toUpperCase();
  if (UNDISCLOSED_TOKENS.has(upper)) return null;

  // Strip leading currency symbols and whitespace
  const stripped = upper.replace(/^[\s$€£¥₹₩₣₤฿]+/, '').trim();

  // Match: optional digits, optional decimal, optional suffix
  const match = stripped.match(/^(\d+(?:\.\d+)?)\s*([BMKT]?)$/);
  if (!match) return null;

  const value = parseFloat(match[1]);
  if (isNaN(value) || value < 0) return null;

  switch (match[2]) {
    case 'B': return value * 1_000;    // billions  → millions
    case 'M': return value;             // millions  → as-is
    case 'K': return value / 1_000;    // thousands → millions
    case 'T': return value * 1_000_000; // trillions → millions (edge case)
    default:   return value;            // no suffix → treat as millions
  }
}

/**
 * Format a USD-million total for display in stats cards.
 *
 * Examples:
 *   55_500 → "$55.5B"
 *   120_000 → "$120B"
 *   750     → "$750M"
 */
export function formatFundingTotal(totalUsdM: number): string {
  if (totalUsdM <= 0) return '$0';
  if (totalUsdM >= 1_000) {
    const billions = totalUsdM / 1_000;
    const formatted = billions % 1 === 0
      ? billions.toFixed(0)
      : billions.toFixed(1).replace(/\.0$/, '');
    return `$${formatted}B`;
  }
  return `$${Math.round(totalUsdM)}M`;
}

/**
 * Compute total funding (in USD millions) from an array of FundingRound objects.
 * Amounts that cannot be parsed are excluded from the total.
 *
 * @param rounds  Array of objects that have an `amount` string field.
 * @returns       Total in millions, or null if no parseable amounts found.
 */
export function sumFundingRounds(
  rounds: ReadonlyArray<{ amount: string }>,
): number | null {
  let total = 0;
  let counted = 0;
  for (const r of rounds) {
    const m = parseFundingAmountUsdM(r.amount);
    if (m !== null) {
      total += m;
      counted++;
    }
  }
  return counted > 0 ? total : null;
}
