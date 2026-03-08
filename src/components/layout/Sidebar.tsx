'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { siteConfig } from '@/config/site';

const NAV_ICONS: Record<string, React.ReactNode> = {
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  zap: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  scale: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/></svg>,
  cpu: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg>,
  'trending-up': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>,
  info: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>,
  'share-2': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>,
};

export function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <aside className="sidebar" id="sb">
      <div className="logo-wrap">
        <div className="logo-row">
          <div className="logo-gem">OM</div>
          <div className="logo-name">{siteConfig.name}</div>
        </div>
        <div className="logo-tag">AI INTELLIGENCE TERMINAL</div>
      </div>
      <div className="live-pill">
        <div className="live-signal">
          <div className="live-dot" />
          <span className="live-txt">Live &middot; {siteConfig.stats.signals} signals</span>
        </div>
        <LiveClock />
      </div>
      <nav className="nav">
        <div className="nav-section">Platform</div>
        {siteConfig.nav.platform.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className={`nav-item${isActive(item.href) ? ' active' : ''}`}
          >
            <div className="nav-icon">{NAV_ICONS[item.icon]}</div>
            <div className="nav-label">{item.label}</div>
            {item.chip && <div className="nav-chip">{item.chip}</div>}
          </Link>
        ))}
        <div className="nav-section" style={{ marginTop: 6 }}>Info</div>
        {siteConfig.nav.info.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className={`nav-item${isActive(item.href) ? ' active' : ''}`}
          >
            <div className="nav-icon">{NAV_ICONS[item.icon]}</div>
            <div className="nav-label">{item.label}</div>
          </Link>
        ))}
      </nav>
      <div className="sb-foot">
        <div className="sb-brand">
          <span className="sb-dot" />
          DATA REFRESHED DAILY &middot; {siteConfig.name}
        </div>
      </div>
    </aside>
  );
}

function LiveClock() {
  return <span className="live-time" suppressHydrationWarning>{new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>;
}
