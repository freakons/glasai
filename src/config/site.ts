/**
 * Site-wide configuration — single source of truth for branding, URLs, and metadata.
 */
export const siteConfig = {
  name: 'OM Terminal',
  tagline: 'Stop reading AI news. Start seeing the board.',
  description:
    'AI regulation, model releases, funding events, and global policy — structured, verified, and analyzed. One terminal. Every signal that matters.',
  url: 'https://omterminal.com',
  domain: 'omterminal.com',
  ogImage: '/og-image.png',
  creator: 'OM Terminal',
  email: 'digest@omterminal.com',

  nav: {
    platform: [
      { label: 'Dashboard', href: '/', id: 'home', icon: 'home', chip: null },
      { label: 'Intelligence Feed', href: '/intelligence', id: 'intelligence', icon: 'zap', chip: 'LIVE' },
      { label: 'Regulation', href: '/regulation', id: 'regulation', icon: 'scale', chip: '7' },
      { label: 'Models', href: '/models', id: 'models', icon: 'cpu', chip: null },
      { label: 'Funding', href: '/funding', id: 'funding', icon: 'trending-up', chip: null },
      { label: 'Ecosystem Graph', href: '/graph', id: 'graph', icon: 'share-2', chip: null },
    ],
    info: [
      { label: 'About', href: '/about', id: 'about', icon: 'info' },
    ],
  },

  features: [
    { icon: '⚖️', title: 'Regulatory Intelligence', body: 'EU AI Act. US executive orders. China\'s CAC rules. Every law that affects your AI deployment — tracked with plain-English impact analysis.' },
    { icon: '📡', title: 'Model Release Radar', body: 'Every major model launch, benchmark, and capability shift — plus our "So What For You" editorial.' },
    { icon: '💰', title: 'Funding & M&A Tracker', body: 'Who raised. Who merged. Who\'s about to. Structured data on AI funding rounds and acquisitions.' },
    { icon: '🌍', title: '8 Country Profiles', body: 'Key players, AI investment figures, regulatory posture, and local dynamics for every major AI market.' },
    { icon: '🏢', title: '18 Company Timelines', body: 'Full news history, valuations, product launches, and benchmark performance — structured and searchable.' },
    { icon: '✅', title: '24 Verified Sources', body: 'Zero aggregator fluff. Every story traced to a primary source and verified before it enters the feed.' },
  ],

  stats: {
    signals: 47,
    companies: 18,
    regulations: 7,
    markets: 8,
    sources: 24,
  },
} as const;
