import { fetchArticles, fetchFeaturedArticle } from '@/services/data';
import { NewsCard } from '@/components/cards/NewsCard';
import { FeaturedCard } from '@/components/cards/FeaturedCard';
import { StatCard } from '@/components/ui/StatCard';
import { IntelligenceFilters } from './filters';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Intelligence Feed',
  description: 'Real-time AI intelligence — model releases, funding, regulation, research, and product launches.',
};

/** ISR: revalidate every 5 minutes for fresh intelligence */
export const revalidate = 300;

export default async function IntelligencePage() {
  const [articles, featured] = await Promise.all([
    fetchArticles(),
    fetchFeaturedArticle(),
  ]);

  return (
    <>
      <div className="stats-row">
        <StatCard value="47" label="Signals This Week" delta="↑ +12 vs last week" color="var(--indigo-l)" glowColor="rgba(79,70,229,0.4)" />
        <StatCard value="8" label="Model Releases" delta="↑ +3 this month" color="var(--cyan-l)" glowColor="rgba(6,182,212,0.4)" />
        <StatCard value="$120B" label="Funding This Month" delta="↑ Record high" color="var(--amber-l)" glowColor="rgba(217,119,6,0.4)" />
        <StatCard value="7" label="Active Regulations" delta="↑ +3 this quarter" color="var(--rose-l)" glowColor="rgba(225,29,72,0.4)" />
        <StatCard value="24" label="Verified Sources" delta="All active" color="var(--emerald-l)" glowColor="rgba(5,150,105,0.4)" />
      </div>

      {featured && <FeaturedCard article={featured} />}

      <IntelligenceFilters />

      <div className="news-grid">
        {articles.filter(a => !a.featured).map((article) => (
          <NewsCard key={article.id} article={article} />
        ))}
      </div>
    </>
  );
}
