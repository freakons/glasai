import { fetchArticles, fetchFeaturedArticle } from '@/lib/dataService';
import { getSignals, getSiteStats } from '@/db/queries';
import { formatFundingTotal } from '@/lib/parseFundingAmount';
import { FeaturedCard } from '@/components/cards/FeaturedCard';
import { StatCard } from '@/components/ui/StatCard';
import { IntelligenceFeed } from './IntelligenceFeed';
import { CommandBar } from '@/ui/layout/CommandBar';
import { composeFeed } from '@/lib/signals/feedComposer';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Intelligence Feed',
  description: 'Real-time AI intelligence — model releases, funding, regulation, research, and product launches.',
};

/** ISR: revalidate every 5 minutes for fresh intelligence */
export const revalidate = 300;

const STATS_FALLBACK = {
  signals: 0, companies: 0, regulations: 0, sources: 0,
  fundingRounds: 0, models: 0, totalFundingUsdM: 0,
};

export default async function IntelligencePage() {
  const [articles, featured, live, rawSignals] = await Promise.all([
    fetchArticles(),
    fetchFeaturedArticle(),
    getSiteStats().catch(() => STATS_FALLBACK),
    getSignals(50, 'standard').catch(() => []),
  ]);

  // Compose the signal feed with diversity + dedup + ranking
  const composedSignals = composeFeed(rawSignals, { minSignificance: 30 });

  // Core counts — live from DB only, no hardcoded fallbacks
  const signals     = String(live.signals);
  const regulations = String(live.regulations);
  const sources     = String(live.sources);
  const modelCount  = live.models;
  const fundingLabel = live.totalFundingUsdM > 0
    ? formatFundingTotal(live.totalFundingUsdM)
    : 'N/A';

  return (
    <>
      {/* ── Live Intelligence Header ──────────────────────────────── */}
      <div className="feed-header">
        <div className="feed-header-left">
          <h1 className="feed-title">Intelligence Feed</h1>
          <p className="feed-subtitle">Live AI signals — ranked by importance and freshness</p>
        </div>
        <div className="feed-live-indicator">
          <span className="feed-live-dot" />
          <span className="feed-live-text">Live</span>
        </div>
      </div>

      {/* ── Stats Strip ───────────────────────────────────────────── */}
      <div className="stats-row">
        <StatCard value={signals} label="Signals" delta="This week" color="var(--indigo-l)" glowColor="rgba(79,70,229,0.4)" />
        <StatCard value={String(modelCount)} label="Models" delta="Tracked" color="var(--cyan-l)" glowColor="rgba(6,182,212,0.4)" />
        <StatCard value={fundingLabel} label="Funding" delta="Total raised" color="var(--amber-l)" glowColor="rgba(217,119,6,0.4)" />
        <StatCard value={regulations} label="Regulations" delta="Active" color="var(--rose-l)" glowColor="rgba(225,29,72,0.4)" />
        <StatCard value={sources} label="Sources" delta="Verified" color="var(--emerald-l)" glowColor="rgba(5,150,105,0.4)" />
      </div>

      {featured && <FeaturedCard article={featured} />}

      <IntelligenceFeed signals={composedSignals} articles={articles} />

      <CommandBar />
    </>
  );
}
