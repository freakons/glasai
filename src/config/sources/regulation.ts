/**
 * Regulation Sources
 *
 * Government bodies, regulatory agencies, and international standards
 * organisations publishing AI policy, guidance, and compliance frameworks.
 *
 * Reliability guide:
 *    9 — Official government or intergovernmental body
 */

import type { SourceDefinition } from '@/types/sources';

export const regulationSources: SourceDefinition[] = [

  // ── Government & regulatory bodies (5) ───────────────────────────────────

  {
    id: 'eu_ai_office',
    name: 'EU AI Office',
    type: 'regulation',
    category: 'policy',
    url: 'https://digital-strategy.ec.europa.eu/en/policies/artificial-intelligence/rss',
    reliability: 9,
    enabled: true,
  },
  {
    id: 'whitehouse_ostp',
    name: 'White House OSTP AI Policy',
    type: 'regulation',
    category: 'policy',
    url: 'https://www.whitehouse.gov/ostp/news-updates/feed/',
    reliability: 9,
    enabled: true,
  },
  {
    id: 'uk_ai_safety_institute',
    name: 'UK AI Safety Institute',
    type: 'regulation',
    category: 'policy',
    url: 'https://www.gov.uk/government/organisations/ai-safety-institute.atom',
    reliability: 9,
    enabled: true,
  },
  {
    id: 'oecd_ai_policy',
    name: 'OECD AI Policy Observatory',
    type: 'regulation',
    category: 'policy',
    url: 'https://oecd.ai/en/feed',
    reliability: 9,
    enabled: true,
  },
  {
    id: 'nist_ai',
    name: 'NIST AI Program',
    type: 'regulation',
    category: 'policy',
    url: 'https://www.nist.gov/blogs/taking-measure/rss.xml',
    reliability: 9,
    enabled: true,
  },
];
