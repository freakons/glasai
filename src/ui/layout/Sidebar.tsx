'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { label: 'Feed',       href: '/',           icon: 'feed'       },
  { label: 'Signals',    href: '/signals',    icon: 'signals'    },
  { label: 'Models',     href: '/models',     icon: 'models'     },
  { label: 'Companies',  href: '/companies',  icon: 'companies'  },
  { label: 'Funding',    href: '/funding',    icon: 'funding'    },
  { label: 'Regulation', href: '/regulation', icon: 'regulation' },
  { label: 'Snapshots',  href: '/snapshots',  icon: 'snapshots'  },
] as const;

const ICONS: Record<string, React.ReactNode> = {
  feed: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/>
    </svg>
  ),
  signals: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
  models: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/>
      <path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/>
      <path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/>
    </svg>
  ),
  companies: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  ),
  funding: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
      <polyline points="16 7 22 7 22 13"/>
    </svg>
  ),
  regulation: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/>
      <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/>
      <path d="M7 21h10"/><path d="M12 3v18"/>
      <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>
    </svg>
  ),
  snapshots: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/>
      <circle cx="12" cy="13" r="3"/>
    </svg>
  ),
};

/**
 * Sidebar — left navigation panel for the three-panel intelligence layout.
 * Renders navigation links: Feed, Signals, Models, Companies, Funding, Regulation, Snapshots.
 */
export function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <aside className="il-sb" id="il-sb">
      <div className="il-sb-logo">
        <div className="logo-row">
          <div className="logo-gem">Om</div>
          <div className="logo-name">Omterminal</div>
        </div>
        <div className="logo-tag">AI INTELLIGENCE TERMINAL</div>
      </div>

      <nav className="il-sb-nav">
        <div className="il-sb-section">Intelligence</div>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item${isActive(item.href) ? ' active' : ''}`}
          >
            <div className="nav-icon">{ICONS[item.icon]}</div>
            <div className="nav-label">{item.label}</div>
          </Link>
        ))}
      </nav>

      <div className="il-sb-foot">
        <div className="sb-brand">
          <span className="sb-dot" />
          LIVE INTELLIGENCE &middot; OMTERMINAL
        </div>
      </div>
    </aside>
  );
}
