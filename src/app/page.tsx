import Link from 'next/link';
import { siteConfig } from '@/config/site';
import { getSiteStats } from '@/db/queries';
import RequestAccessButton from '@/components/RequestAccessButton';
import { TrendRadar } from '@/components/TrendRadar';

/** ISR: revalidate every hour */
export const revalidate = 3600;

export default async function HomePage() {
  // Compute live stats from DB — show real numbers only, never hardcoded fallbacks
  const fallbackStats = { signals: 0, companies: 0, regulations: 0, sources: 0, fundingRounds: 0, models: 0, totalFundingUsdM: 0 };
  const live = await getSiteStats().catch(() => fallbackStats);
  const signals     = live.signals;
  const companies   = live.companies;
  const regulations = live.regulations;

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
          {signals > 0 && <div className="hm"><div className="hm-n">{signals}</div><div className="hm-l">Signals tracked</div></div>}
          {companies > 0 && <div className="hm"><div className="hm-n">{companies}</div><div className="hm-l">Companies tracked</div></div>}
          {regulations > 0 && <div className="hm"><div className="hm-n">{regulations}</div><div className="hm-l">Active regulations</div></div>}
          {signals === 0 && companies === 0 && regulations === 0 && (
            <div className="hm"><div className="hm-n">Live</div><div className="hm-l">Intelligence platform</div></div>
          )}
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
