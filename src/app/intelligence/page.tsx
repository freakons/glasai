import { fetchArticles, fetchFeaturedArticle } from '@/lib/dataService';
import { getSignals, getSiteStats } from '@/db/queries';
import { siteConfig } from '@/config/site';
import { MODELS } from '@/lib/data/models';
import { FUNDING_ROUNDS } from '@/lib/data/funding';
import { sumFundingRounds, formatFundingTotal } from '@/lib/parseFundingAmount';
import { NewsCard } from '@/components/cards/NewsCard';
import { FeaturedCard } from '@/components/cards/FeaturedCard';
import { SignalCard } from '@/components/cards/SignalCard';
import { StatCard } from '@/components/ui/StatCard';
import { IntelligenceFilters } from './filters';
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

  // Core counts — live from DB, fallback to siteConfig / static array lengths
  const signals     = live.signals     > 0 ? String(live.signals)     : String(siteConfig.stats.signals);
  const regulations = live.regulations > 0 ? String(live.regulations) : String(siteConfig.stats.regulations);
  const sources     = live.sources     > 0 ? String(live.sources)     : String(siteConfig.stats.sources);

  // Model releases — live count; fallback to static MODELS array length
  const modelCount  = live.models > 0 ? live.models : MODELS.length;

  // Funding total — live DB aggregate if available; else compute from static data
  const fundingLabel = live.totalFundingUsdM > 0
    ? formatFundingTotal(live.totalFundingUsdM)
    : formatFundingTotal(sumFundingRounds(FUNDING_ROUNDS) ?? 0) + '+';

  return (
    <>
      <div className="stats-row">
        <StatCard value={signals} label="Signals This Week" delta="↑ vs last week" color="var(--indigo-l)" glowColor="rgba(79,70,229,0.4)" />
        <StatCard value={String(modelCount)} label="Models Tracked" delta="Frontier releases" color="var(--cyan-l)" glowColor="rgba(6,182,212,0.4)" />
        <StatCard value={fundingLabel} label="Total AI Funding" delta="Tracked rounds" color="var(--amber-l)" glowColor="rgba(217,119,6,0.4)" />
        <StatCard value={regulations} label="Active Regulations" delta="↑ vs last quarter" color="var(--rose-l)" glowColor="rgba(225,29,72,0.4)" />
        <StatCard value={sources} label="Verified Sources" delta="All active" color="var(--emerald-l)" glowColor="rgba(5,150,105,0.4)" />
      </div>

      {featured && <FeaturedCard article={featured} />}

      <IntelligenceFilters />

      {/* Signal-based intelligence feed (ranked, deduplicated, diversity-enforced) */}
      {composedSignals.length > 0 && (
        <div className="news-grid">
          {composedSignals.map((signal) => (
            <SignalCard key={signal.id} signal={signal} />
          ))}
        </div>
      )}

      {/* Article-based news grid (fallback when no signals available) */}
      {composedSignals.length === 0 && (
        <div className="news-grid">
          {articles.filter(a => !a.featured).map((article) => (
            <NewsCard key={article.id} article={article} />
          ))}
        </div>
      )}

      <CommandBar />
    </>
  );
}
