'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { NotificationPanel } from './NotificationPanel';
import type { AlertRecord } from '@/db/queries';

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  // ── Fetch alerts ──────────────────────────────────────────────────────────

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/alerts');
      if (!res.ok) return;
      const data = await res.json();
      setAlerts(data.alerts ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      // Silent fail — notifications are non-critical
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60_000); // Poll every 60s
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  // ── Close on outside click ────────────────────────────────────────────────

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [open]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleAlertClick = async (alert: AlertRecord) => {
    if (!alert.read) {
      await fetch('/api/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: alert.id }),
      });
      setAlerts((prev) =>
        prev.map((a) => (a.id === alert.id ? { ...a, read: true } : a)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    }

    // Navigate if there's a link
    if (alert.signalId) {
      window.location.href = `/signals/${alert.signalId}`;
    }
    setOpen(false);
  };

  const handleMarkAllRead = async () => {
    await fetch('/api/alerts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    });
    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
    setUnreadCount(0);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="notif-bell-wrap" ref={ref}>
      <button
        className="tb-btn notif-bell-btn"
        onClick={() => setOpen(!open)}
        aria-label="Notifications"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <NotificationPanel
          alerts={alerts}
          onAlertClick={handleAlertClick}
          onMarkAllRead={handleMarkAllRead}
        />
      )}
    </div>
  );
}
