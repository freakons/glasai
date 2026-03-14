'use client';

import type { AlertRecord } from '@/db/queries';

// ─────────────────────────────────────────────────────────────────────────────
// Alert type → visual config
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { label: string; color: string; personal?: boolean }> = {
  signal_high_impact:            { label: 'High Impact', color: 'var(--rose)' },
  signal_rising_momentum:        { label: 'Momentum',    color: 'var(--amber)' },
  trend_detected:                { label: 'Trend',       color: 'var(--violet)' },
  trend_rising:                  { label: 'Rising',      color: 'var(--amber)' },
  entity_watch:                  { label: 'Watchlist',   color: 'var(--cyan)', personal: true },
  trend_watch:                   { label: 'Trend Watch', color: 'var(--violet)', personal: true },
  category_watch:                { label: 'Category',    color: 'var(--cyan)', personal: true },
  watched_entity_high_impact:    { label: 'High Impact', color: 'var(--rose)', personal: true },
  watched_entity_rising:         { label: 'Momentum',    color: 'var(--amber)', personal: true },
  watched_entity_trend:          { label: 'Trend',       color: 'var(--violet)', personal: true },
};

// ─────────────────────────────────────────────────────────────────────────────
// Time formatting
// ─────────────────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface NotificationPanelProps {
  alerts: AlertRecord[];
  onAlertClick: (alert: AlertRecord) => void;
  onMarkAllRead: () => void;
}

export function NotificationPanel({ alerts, onAlertClick, onMarkAllRead }: NotificationPanelProps) {
  if (alerts.length === 0) {
    return (
      <div className="notif-panel">
        <div className="notif-header">
          <span className="notif-header-title">Notifications</span>
        </div>
        <div className="notif-empty">No notifications yet</div>
      </div>
    );
  }

  const hasUnread = alerts.some((a) => !a.read);

  return (
    <div className="notif-panel">
      <div className="notif-header">
        <span className="notif-header-title">Notifications</span>
        {hasUnread && (
          <button className="notif-mark-all" onClick={onMarkAllRead}>
            Mark all read
          </button>
        )}
      </div>
      <div className="notif-list">
        {alerts.map((alert) => {
          const config = TYPE_CONFIG[alert.type] ?? { label: alert.type, color: 'var(--text2)' };
          const href = alert.signalId
            ? `/signals/${alert.signalId}`
            : alert.trendId
              ? `/trends`
              : undefined;

          return (
            <button
              key={alert.id}
              className={`notif-item${alert.read ? '' : ' notif-unread'}`}
              onClick={() => onAlertClick(alert)}
            >
              <div className="notif-item-top">
                <span className="notif-type-badge" style={{ borderColor: config.color, color: config.color }}>
                  {config.label}
                </span>
                {(config.personal || alert.userId) && (
                  <span className="notif-personal-badge">Watching</span>
                )}
                <span className="notif-time">{timeAgo(alert.createdAt)}</span>
              </div>
              <div className="notif-title">{alert.title}</div>
              <div className="notif-message">{alert.message}</div>
              {href && (
                <span className="notif-link">View details →</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
