/**
 * Omterminal — Source Validation Helper
 *
 * Validates the source registry for common configuration errors.
 * The pipeline calls this at startup and logs warnings for any issues found,
 * but continues running — validation failures are non-fatal.
 *
 * Checks:
 *   1. Duplicate source IDs
 *   2. Missing url or query (at least one required for non-social sources)
 *   3. Reliability score out of bounds (must be 1–10)
 */

import type { SourceDefinition } from '@/types/sources';

export interface ValidationWarning {
  sourceId: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  warnings: ValidationWarning[];
}

/**
 * Validate a list of source definitions and return any warnings found.
 * Always returns a result — never throws.
 */
export function validateSources(sources: SourceDefinition[]): ValidationResult {
  const warnings: ValidationWarning[] = [];

  // ── 1. Duplicate IDs ──────────────────────────────────────────────────────
  const seenIds = new Set<string>();
  for (const source of sources) {
    if (seenIds.has(source.id)) {
      warnings.push({
        sourceId: source.id,
        message: `Duplicate source id "${source.id}" — each source must have a unique id`,
      });
    } else {
      seenIds.add(source.id);
    }
  }

  // ── 2. Missing url / query ────────────────────────────────────────────────
  for (const source of sources) {
    // Social sources may rely on entity field; others need url or query
    if (source.type !== 'social' && !source.url && !source.query) {
      warnings.push({
        sourceId: source.id,
        message: `Source "${source.id}" (type="${source.type}") has no url or query — it will not be fetched`,
      });
    }
  }

  // ── 3. Reliability score bounds ───────────────────────────────────────────
  for (const source of sources) {
    if (source.reliability < 1 || source.reliability > 10) {
      warnings.push({
        sourceId: source.id,
        message: `Source "${source.id}" has reliability=${source.reliability} — must be between 1 and 10`,
      });
    }
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}

/**
 * Run validation against the provided sources and log any warnings.
 * Intended to be called once at pipeline startup.
 */
export function runSourceValidation(sources: SourceDefinition[]): void {
  const result = validateSources(sources);
  if (result.valid) {
    console.log(`[sourceValidation] All ${sources.length} sources passed validation`);
    return;
  }

  console.warn(
    `[sourceValidation] ${result.warnings.length} warning(s) found in source registry — pipeline will continue`
  );
  for (const warning of result.warnings) {
    console.warn(`[sourceValidation]   ⚠ ${warning.message}`);
  }
}
