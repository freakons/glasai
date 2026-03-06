export interface Regulation {
  id: string;
  title: string;
  type: 'law' | 'bill' | 'exec' | 'policy' | 'report';
  country: string;
  flag: string;
  status: 'active' | 'pending' | 'passed';
  summary: string;
  date: string;
  impact: string;
}

export const REGULATIONS: Regulation[] = [
  {
    id: 'eu-ai-act', title: 'EU AI Act', type: 'law', country: 'European Union', flag: '🇪🇺',
    status: 'active', date: 'Aug 2024 → Feb 2026',
    summary: 'Comprehensive risk-based framework for AI systems in EU markets. Bans social scoring, mandates transparency for high-risk systems, requires conformity assessments.',
    impact: 'Any AI deployed in the EU must classify risk level and comply. Non-compliance penalties up to 7% of global revenue.',
  },
  {
    id: 'us-exec-order', title: 'US Executive Order on AI Safety', type: 'exec', country: 'United States', flag: '🇺🇸',
    status: 'active', date: 'Oct 2023 → Present',
    summary: 'Requires AI safety testing, red-teaming of frontier models, and reporting of dual-use foundation models to the government.',
    impact: 'Frontier AI labs must share safety test results with the government before public release.',
  },
  {
    id: 'china-cac', title: 'China CAC Generative AI Rules', type: 'policy', country: 'China', flag: '🇨🇳',
    status: 'active', date: 'Aug 2023 → Present',
    summary: 'Requires government approval before launching generative AI services. Content must align with "core socialist values."',
    impact: 'All generative AI products in China need pre-launch government review and ongoing content compliance.',
  },
  {
    id: 'uk-ai-bill', title: 'UK AI Safety Bill', type: 'bill', country: 'United Kingdom', flag: '🇬🇧',
    status: 'pending', date: 'Nov 2024 → Pending',
    summary: 'Proposed legislation establishing the AI Safety Institute as a statutory body with powers to audit frontier AI systems.',
    impact: 'Would give UK regulators power to inspect and audit AI models before deployment.',
  },
  {
    id: 'us-state-bills', title: 'US State AI Bills (SB 1047+)', type: 'bill', country: 'United States', flag: '🇺🇸',
    status: 'pending', date: '2024 → Ongoing',
    summary: 'Multiple US states pursuing AI regulation, including California SB 1047 requiring safety testing for large AI models.',
    impact: 'Patchwork state regulation may force companies to comply with the strictest state\'s rules.',
  },
  {
    id: 'india-dpdp', title: 'India Digital Personal Data Protection Act', type: 'law', country: 'India', flag: '🇮🇳',
    status: 'passed', date: 'Aug 2023 → 2025 Enforcement',
    summary: 'India\'s data protection law governing collection and processing of personal data, including AI training data.',
    impact: 'AI systems using Indian user data must comply with consent requirements and data localization rules.',
  },
  {
    id: 'g7-hiroshima', title: 'G7 Hiroshima AI Process', type: 'report', country: 'G7', flag: '🌍',
    status: 'active', date: 'Dec 2023 → Ongoing',
    summary: 'Voluntary code of conduct for advanced AI systems. Guiding principles adopted by major AI developers.',
    impact: 'Sets international norms for AI governance. Voluntary but increasingly referenced in national policies.',
  },
];

export function getRegulationsByType(type: string): Regulation[] {
  if (type === 'all') return REGULATIONS;
  return REGULATIONS.filter(r => r.type === type);
}
