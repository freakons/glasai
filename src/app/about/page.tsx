import { siteConfig } from '@/config/site';
import { PageHeader } from '@/components/ui/PageHeader';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About',
  description: 'About OM Terminal — the AI Intelligence Terminal built for decision-makers.',
};

export const revalidate = 3600;

export default function AboutPage() {
  return (
    <>
      <PageHeader
        title="About"
        highlight={siteConfig.name}
        subtitle="The AI Intelligence Terminal — built for decision-makers, not doom-scrollers."
        gradient="var(--violet-l), var(--cyan-l)"
      />

      <div className="hero" style={{ padding: '32px 36px' }}>
        <div className="hero-eyebrow">OUR MISSION</div>
        <h2 style={{
          fontFamily: 'var(--fd)', fontSize: 28, fontStyle: 'italic', color: 'var(--text)',
          letterSpacing: '-0.02em', marginBottom: 16, lineHeight: 1.3,
        }}>
          Stop reading AI news. Start seeing the board.
        </h2>
        <p style={{ fontSize: 15, color: 'var(--text2)', lineHeight: 1.8, maxWidth: 600, marginBottom: 24 }}>
          {siteConfig.name} is not a news site. It&apos;s not a blog. It&apos;s not a newsletter.
          It&apos;s a professional-grade AI intelligence terminal built for decision-makers who need
          structured, verified, and analyzed intelligence — not another feed to scroll.
        </p>
        <p style={{ fontSize: 15, color: 'var(--text2)', lineHeight: 1.8, maxWidth: 600, marginBottom: 24 }}>
          We track AI regulation, model releases, funding events, and global policy across
          {siteConfig.stats.markets} major markets, {siteConfig.stats.companies} companies, and
          {' '}{siteConfig.stats.sources} verified sources. Every signal is categorized, verified, and
          accompanied by &ldquo;So What For You&rdquo; editorial analysis.
        </p>

        <div style={{
          fontFamily: 'var(--fm)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' as const,
          color: 'var(--text3)', marginBottom: 12, marginTop: 24,
        }}>
          BUILT FOR
        </div>
        <div className="feature-grid" style={{ maxWidth: 700 }}>
          {[
            { icon: '🎯', title: 'AI Founders', body: 'Track competitors, regulation, and funding in your vertical.' },
            { icon: '💼', title: 'Venture Capital', body: 'Structured deal flow intelligence and market signals.' },
            { icon: '⚖️', title: 'Policy Analysts', body: 'Global regulatory tracking with impact analysis.' },
            { icon: '🏢', title: 'Enterprise Strategy', body: 'AI adoption intelligence for strategic planning.' },
          ].map((item) => (
            <div key={item.title} className="feat-card">
              <div className="feat-icon">{item.icon}</div>
              <div className="feat-title">{item.title}</div>
              <div className="feat-body">{item.body}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        marginTop: 20, padding: '20px 24px', borderRadius: 'var(--r)',
        background: 'var(--glass)', border: '1px solid var(--border)',
      }}>
        <div style={{ fontFamily: 'var(--fm)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--text3)', marginBottom: 8 }}>
          CONTACT
        </div>
        <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7 }}>
          For partnerships, enterprise inquiries, or press: <strong style={{ color: 'var(--indigo-l)' }}>{siteConfig.email}</strong>
        </p>
        <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7, marginTop: 4 }}>
          Website: <strong style={{ color: 'var(--indigo-l)' }}>{siteConfig.domain}</strong>
        </p>
      </div>
    </>
  );
}
