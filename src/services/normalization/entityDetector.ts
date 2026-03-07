/**
 * Omterminal — Entity Detector
 *
 * Scans article text for known companies, AI models, and investors by
 * matching against canonical aliases in the entity registries.
 *
 * Uses simple case-insensitive string matching. A future step can replace
 * this with NLP-based named-entity recognition without changing the interface.
 *
 * Architecture:
 *   Article text → detectCompanies / detectModels / detectInvestors → resolved entities
 */

import { COMPANIES, type CompanyEntity } from '../../data/entities/companies';
import { MODELS, type ModelEntity } from '../../data/entities/models';
import { INVESTORS, type InvestorEntity } from '../../data/entities/investors';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if `term` appears as a whole-word match inside `text`.
 * Whole-word matching avoids false positives like "Meta" inside "Metadata".
 */
function containsWholeWord(text: string, term: string): boolean {
  // Escape regex special characters in the term
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?<![a-zA-Z0-9])${escaped}(?![a-zA-Z0-9])`, 'i');
  return pattern.test(text);
}

/**
 * Builds a lower-cased combined search string from relevant article fields.
 * Searching title + content gives broader coverage than either field alone.
 */
function buildSearchText(title: string, content: string): string {
  return `${title} ${content}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Company detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scans `text` for known company names and aliases.
 * Returns an array of resolved CompanyEntity objects (deduplicated by id).
 *
 * @param text  Combined article text to scan (title + content recommended).
 * @returns     Array of matched CompanyEntity objects.
 */
export function detectCompanies(text: string): CompanyEntity[] {
  const seen = new Set<string>();
  const results: CompanyEntity[] = [];

  for (const company of COMPANIES) {
    // Check canonical name
    const candidates = [company.name, ...(company.aliases ?? [])];

    for (const term of candidates) {
      if (containsWholeWord(text, term)) {
        if (!seen.has(company.id)) {
          seen.add(company.id);
          results.push(company);
        }
        break; // One match per company is enough
      }
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Model detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scans `text` for known AI model names and aliases.
 * Returns an array of resolved ModelEntity objects (deduplicated by id).
 *
 * @param text  Combined article text to scan.
 * @returns     Array of matched ModelEntity objects.
 */
export function detectModels(text: string): ModelEntity[] {
  const seen = new Set<string>();
  const results: ModelEntity[] = [];

  for (const model of MODELS) {
    const candidates = [model.name, ...(model.aliases ?? [])];

    for (const term of candidates) {
      if (containsWholeWord(text, term)) {
        if (!seen.has(model.id)) {
          seen.add(model.id);
          results.push(model);
        }
        break;
      }
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Investor detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scans `text` for known investor names and aliases.
 * Returns an array of resolved InvestorEntity objects (deduplicated by id).
 *
 * @param text  Combined article text to scan.
 * @returns     Array of matched InvestorEntity objects.
 */
export function detectInvestors(text: string): InvestorEntity[] {
  const seen = new Set<string>();
  const results: InvestorEntity[] = [];

  for (const investor of INVESTORS) {
    const candidates = [investor.name, ...(investor.aliases ?? [])];

    for (const term of candidates) {
      if (containsWholeWord(text, term)) {
        if (!seen.has(investor.id)) {
          seen.add(investor.id);
          results.push(investor);
        }
        break;
      }
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience wrapper
// ─────────────────────────────────────────────────────────────────────────────

export interface DetectedEntities {
  companies: CompanyEntity[];
  models: ModelEntity[];
  investors: InvestorEntity[];
}

/**
 * Runs all three detectors against `title` + `content` in a single pass.
 * The search string is constructed once and reused for all three detectors.
 *
 * @param title    Article headline.
 * @param content  Article body text.
 * @returns        Object containing detected companies, models, and investors.
 */
export function detectEntities(title: string, content: string): DetectedEntities {
  const text = buildSearchText(title, content);
  return {
    companies: detectCompanies(text),
    models: detectModels(text),
    investors: detectInvestors(text),
  };
}
