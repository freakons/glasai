/**
 * Omterminal — Investor Entity Registry
 *
 * Canonical list of investors tracked by the intelligence platform.
 * Used to normalise investor names in funding round events and to
 * enable tracking of investment thesis and portfolio activity.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Type definition
// ─────────────────────────────────────────────────────────────────────────────

export type InvestorType =
  | 'venture_capital'
  | 'corporate_vc'
  | 'private_equity'
  | 'sovereign_wealth'
  | 'angel'
  | 'family_office'
  | 'accelerator'
  | 'strategic';

export interface InvestorEntity {
  /** Stable machine-friendly identifier */
  id: string;
  /** Canonical investor name */
  name: string;
  /** Type of investor */
  type: InvestorType;
  /** Primary website */
  website: string;
  /** Headquarters country (ISO 3166-1 alpha-2) */
  country?: string;
  /** Known aliases used in news coverage (for entity resolution) */
  aliases?: string[];
  /** Approximate AUM or fund size in USD billions, if publicly known */
  aumBillionsUSD?: number;
  /** Whether this investor is known to focus heavily on AI */
  aiSpecialist?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Investor Registry
// ─────────────────────────────────────────────────────────────────────────────

export const INVESTORS: InvestorEntity[] = [
  {
    id: 'sequoia',
    name: 'Sequoia Capital',
    type: 'venture_capital',
    website: 'https://sequoiacap.com',
    country: 'US',
    aliases: ['Sequoia', 'Sequoia Capital AI'],
    aumBillionsUSD: 85,
    aiSpecialist: true,
  },
  {
    id: 'a16z',
    name: 'Andreessen Horowitz',
    type: 'venture_capital',
    website: 'https://a16z.com',
    country: 'US',
    aliases: ['a16z', 'A16Z'],
    aumBillionsUSD: 42,
    aiSpecialist: true,
  },
  {
    id: 'lightspeed',
    name: 'Lightspeed Venture Partners',
    type: 'venture_capital',
    website: 'https://lsvp.com',
    country: 'US',
    aliases: ['Lightspeed', 'LSVP'],
    aumBillionsUSD: 25,
    aiSpecialist: false,
  },
  {
    id: 'general_catalyst',
    name: 'General Catalyst',
    type: 'venture_capital',
    website: 'https://generalcatalyst.com',
    country: 'US',
    aliases: ['GC', 'General Catalyst Group'],
    aumBillionsUSD: 20,
    aiSpecialist: false,
  },
  {
    id: 'accel',
    name: 'Accel',
    type: 'venture_capital',
    website: 'https://accel.com',
    country: 'US',
    aliases: ['Accel Partners'],
    aumBillionsUSD: 20,
    aiSpecialist: false,
  },
  {
    id: 'khosla_ventures',
    name: 'Khosla Ventures',
    type: 'venture_capital',
    website: 'https://khoslaventures.com',
    country: 'US',
    aliases: ['Khosla'],
    aumBillionsUSD: 15,
    aiSpecialist: true,
  },
  {
    id: 'tiger_global',
    name: 'Tiger Global Management',
    type: 'private_equity',
    website: 'https://tigerglobal.com',
    country: 'US',
    aliases: ['Tiger Global'],
    aumBillionsUSD: 50,
    aiSpecialist: false,
  },
  {
    id: 'spark_capital',
    name: 'Spark Capital',
    type: 'venture_capital',
    website: 'https://sparkcapital.com',
    country: 'US',
    aliases: ['Spark'],
    aumBillionsUSD: 5,
    aiSpecialist: false,
  },
  {
    id: 'yc',
    name: 'Y Combinator',
    type: 'accelerator',
    website: 'https://ycombinator.com',
    country: 'US',
    aliases: ['YC', 'Y-Combinator'],
    aiSpecialist: false,
  },
  {
    id: 'softbank',
    name: 'SoftBank Vision Fund',
    type: 'venture_capital',
    website: 'https://softbank.com',
    country: 'JP',
    aliases: ['SoftBank', 'SBG', 'Vision Fund'],
    aumBillionsUSD: 100,
    aiSpecialist: true,
  },
  {
    id: 'microsoft_ventures',
    name: 'Microsoft',
    type: 'strategic',
    website: 'https://microsoft.com',
    country: 'US',
    aliases: ['Microsoft Ventures', 'MSFT'],
    aiSpecialist: true,
  },
  {
    id: 'google_ventures',
    name: 'Google Ventures',
    type: 'corporate_vc',
    website: 'https://gv.com',
    country: 'US',
    aliases: ['GV', 'Google'],
    aumBillionsUSD: 8,
    aiSpecialist: true,
  },
  {
    id: 'insight_partners',
    name: 'Insight Partners',
    type: 'private_equity',
    website: 'https://insightpartners.com',
    country: 'US',
    aliases: ['Insight'],
    aumBillionsUSD: 90,
    aiSpecialist: false,
  },
  {
    id: 'coatue',
    name: 'Coatue Management',
    type: 'venture_capital',
    website: 'https://coatue.com',
    country: 'US',
    aliases: ['Coatue'],
    aumBillionsUSD: 50,
    aiSpecialist: true,
  },
  {
    id: 'founders_fund',
    name: 'Founders Fund',
    type: 'venture_capital',
    website: 'https://foundersfund.com',
    country: 'US',
    aliases: ["Peter Thiel's fund"],
    aumBillionsUSD: 11,
    aiSpecialist: true,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Look up an investor by its stable id */
export function getInvestorById(id: string): InvestorEntity | undefined {
  return INVESTORS.find((i) => i.id === id);
}

/**
 * Resolve a free-text investor name to the canonical InvestorEntity by
 * matching against id, name, and known aliases.
 */
export function resolveInvestor(nameOrAlias: string): InvestorEntity | undefined {
  const normalised = nameOrAlias.toLowerCase().trim();
  return INVESTORS.find(
    (i) =>
      i.id === normalised ||
      i.name.toLowerCase() === normalised ||
      i.aliases?.some((a) => a.toLowerCase() === normalised)
  );
}

/** Returns all investors flagged as AI specialists */
export function getAISpecialistInvestors(): InvestorEntity[] {
  return INVESTORS.filter((i) => i.aiSpecialist === true);
}

export default INVESTORS;
