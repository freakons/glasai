'use client';

import { NotificationBell } from '@/components/notifications/NotificationBell';

export function Topbar({ title, highlight }: { title: string; highlight: string }) {
  return (
    <div className="topbar">
      <button
        className="burger"
        onClick={() => document.getElementById('sb')?.classList.toggle('open')}
        aria-label="Toggle menu"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" width="16" height="16">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <div className="topbar-title">
        {title} <span>{highlight}</span>
      </div>
      <div className="search-wrap">
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input className="search-in" placeholder="Search intelligence… (press /)" />
      </div>
      <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
        <NotificationBell />
        <button className="tb-btn primary">Request Access</button>
      </div>
    </div>
  );
}
