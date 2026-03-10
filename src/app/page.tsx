import Link from 'next/link';
import { siteConfig } from '@/config/site';
import { getSiteStats } from '@/db/queries';
import RequestAccessButton from '@/components/RequestAccessButton';
import { TrendRadar } from '@/components/TrendRadar';

/** ISR: revalidate every hour */
export const revalidate = 3600;

export default async function HomePage() {
  // Compute live stats; gracefully fall back to siteConfig hardcoded values on any error
  const fallbackStats = { signals: 0, companies: 0, regulations: 0, sources: 0, fundingRounds: 0, models: 0, totalFundingUsdM: 0 };
  const live = await getSiteStats().catch(() => fallbackStats);
  const signals     = live.signals     > 0 ? live.signals     : siteConfig.stats.signals;
  const companies   = live.companies   > 0 ? live.companies   : siteConfig.stats.companies;
  const regulations = live.regulations > 0 ? live.regulations : siteConfig.stats.regulations;

  return (
    <>
      {/* Hero */}
      <div className="hero">
        <div className="hero-eyebrow">PROFESSIONAL AI INTELLIGENCE PLATFORM</div>
        <h1 className="hero-h1">
          Stop reading AI news.<br />
          Start <em>seeing the board.</em>
        </h1>
        <p className="hero-sub">
          Regulation, model releases, funding, and global policy — structured, verified, and
          curated for decision-makers. Not a feed. An intelligence terminal.
        </p>
        <div className="hero-ctas">
          <RequestAccessButton />
          <Link href="/intelligence" className="cta-secondary">
            Browse Intelligence
          </Link>
        </div>
        <div className="hero-metrics">
          <div className="hm"><div className="hm-n">{signals}</div><div className="hm-l">Signals this week</div></div>
          <div className="hm"><div className="hm-n">{companies}</div><div className="hm-l">Companies tracked</div></div>
          <div className="hm"><div className="hm-n">{regulations}</div><div className="hm-l">Active regulations</div></div>
          <div className="hm"><div className="hm-n">{siteConfig.stats.markets}</div><div className="hm-l">Global markets</div></div>
          <div className="hm"><div className="hm-n">2.4K</div><div className="hm-l">Professionals tracking AI</div></div>
        </div>
      </div>

      {/* Trend Radar */}
      <div style={{ marginBottom: 32 }}>
        <TrendRadar />
      </div>

      {/* Features */}
      <div style={{ fontFamily: 'var(--fm)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--text3)', marginBottom: 12 }}>
        WHAT&apos;S INSIDE
      </div>
      <div className="feature-grid">
        {siteConfig.features.map((feat) => (
          <div key={feat.title} className="feat-card">
            <div className="feat-icon">{feat.icon}</div>
            <div className="feat-title">{feat.title}</div>
            <div className="feat-body">{feat.body}</div>
          </div>
        ))}
      </div>
    </>
  );
}
