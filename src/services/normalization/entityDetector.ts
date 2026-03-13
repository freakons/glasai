/**
 * Omterminal — Entity Detector
 *
 * Scans article text for known companies, AI models, and investors by
 * matching against canonical aliases in the entity registries.
 *
 * Now delegates to the centralized entityResolver for consistent matching
 * across all extraction paths. Title-first weighting and ambiguous-token
 * safety are handled by the resolver.
 *
 * Architecture:
 *   Article text → detectEntities() → resolved & linked entities
 *   (internally uses resolveEntityMentions from lib/entityResolver)
 */

import { COMPANIES, type CompanyEntity } from '../../data/entities/companies';
import { MODELS, type ModelEntity } from '../../data/entities/models';
import { INVESTORS, type InvestorEntity } from '../../data/entities/investors';
import {
  resolveEntityMentions,
  type ResolvedEntity,
} from '../../lib/entityResolver';

// ─────────────────────────────────────────────────────────────────────────────
// Company detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scans `text` for known company names and aliases.
 * Returns an array of resolved CompanyEntity objects (deduplicated by id).
 *
 * @param text  Combined article text to scan (title + content). For better
 *              accuracy, use detectEntities(title, content) instead.
 * @returns     Array of matched CompanyEntity objects.
 */
export function detectCompanies(text: string): CompanyEntity[] {
  // Legacy API: text is a combined string; split on first sentence as rough title proxy
  const resolved = resolveEntityMentions(text, '');
  return resolvedToCompanies(resolved);
}

// ─────────────────────────────────────────────────────────────────────────────
// Model detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scans `text` for known AI model names and aliases.
 * Returns an array of resolved ModelEntity objects (deduplicated by id).
 */
export function detectModels(text: string): ModelEntity[] {
  const resolved = resolveEntityMentions(text, '');
  return resolvedToModels(resolved);
}

// ─────────────────────────────────────────────────────────────────────────────
// Investor detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scans `text` for known investor names and aliases.
 * Returns an array of resolved InvestorEntity objects (deduplicated by id).
 */
export function detectInvestors(text: string): InvestorEntity[] {
  const resolved = resolveEntityMentions(text, '');
  return resolvedToInvestors(resolved);
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience wrapper — primary API for article normalization
// ─────────────────────────────────────────────────────────────────────────────

export interface DetectedEntities {
  companies: CompanyEntity[];
  models: ModelEntity[];
  investors: InvestorEntity[];
  /** Full resolution details for all matched entities */
  resolved: ResolvedEntity[];
}

/**
 * Runs entity detection against `title` and `content` separately.
 * This is the preferred API: separating title and content enables
 * title-first weighting and ambiguous-token safety.
 *
 * @param title    Article headline.
 * @param content  Article body text.
 * @returns        Object containing detected companies, models, investors,
 *                 and full resolution details.
 */
export function detectEntities(title: string, content: string): DetectedEntities {
  const resolved = resolveEntityMentions(title, content);
  return {
    companies: resolvedToCompanies(resolved),
    models: resolvedToModels(resolved),
    investors: resolvedToInvestors(resolved),
    resolved,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers: map ResolvedEntity back to registry objects
// ─────────────────────────────────────────────────────────────────────────────

function resolvedToCompanies(resolved: ResolvedEntity[]): CompanyEntity[] {
  const companyIds = new Set(
    resolved.filter((r) => r.category === 'company').map((r) => r.id)
  );
  return COMPANIES.filter((c) => companyIds.has(c.id));
}

function resolvedToModels(resolved: ResolvedEntity[]): ModelEntity[] {
  const modelIds = new Set(
    resolved.filter((r) => r.category === 'model').map((r) => r.id)
  );
  return MODELS.filter((m) => modelIds.has(m.id));
}

function resolvedToInvestors(resolved: ResolvedEntity[]): InvestorEntity[] {
  const investorIds = new Set(
    resolved.filter((r) => r.category === 'investor').map((r) => r.id)
  );
  return INVESTORS.filter((i) => investorIds.has(i.id));
}
