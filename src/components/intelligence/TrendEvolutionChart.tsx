/**
 * TrendEvolutionChart — 7-day mini bar chart showing daily signal activity
 * within a trend cluster, plus growth rate, velocity, and status metrics.
 *
 * Pure CSS bars (no charting library required). Follows the existing
 * glassmorphic design system with inline CSSProperties.
 */

import type { TrendEvolution, TrendStatus } from '@/lib/trends/trendEvolution';

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const CONTAINER: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};

const CHART_ROW: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  gap: 4,
  height: 56,
};

const BAR_WRAPPER: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
  height: '100%',
  justifyContent: 'flex-end',
};

const BAR_LABEL: React.CSSProperties = {
  fontSize: 9,
  fontFamily: 'var(--fm)',
  color: 'var(--text3)',
  letterSpacing: '0.04em',
};

const METRICS_ROW: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  flexWrap: 'wrap',
};

const METRIC_CARD: React.CSSProperties = {
  flex: '1 1 0',
  minWidth: 90,
  padding: '10px 12px',
  borderRadius: 8,
  background: 'var(--glass2)',
  border: '1px solid var(--border)',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};

const METRIC_LABEL: React.CSSProperties = {
  fontFamily: 'var(--fm)',
  fontSize: 9,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--text3)',
};

const METRIC_VALUE: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--text)',
};

// ─────────────────────────────────────────────────────────────────────────────
// Status config
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<TrendStatus, { label: string; symbol: string; color: string; bg: string }> = {
  rising: {
    label: 'Rising',
    symbol: '↑',
    color: 'var(--emerald-l, #34d399)',
    bg: 'rgba(5,150,105,0.15)',
  },
  stable: {
    label: 'Stable',
    symbol: '→',
    color: 'var(--text2)',
    bg: 'rgba(255,255,255,0.05)',
  },
  cooling: {
    label: 'Cooling',
    symbol: '↓',
    color: 'var(--sky-l, #38bdf8)',
    bg: 'rgba(14,165,233,0.15)',
  },
};

const BAR_COLORS: Record<TrendStatus, string> = {
  rising: 'var(--emerald-l, #34d399)',
  stable: 'var(--indigo-l, #818cf8)',
  cooling: 'var(--sky-l, #38bdf8)',
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2);
}

function formatGrowth(rate: number): string {
  const sign = rate >= 0 ? '+' : '';
  return `${sign}${Math.round(rate * 100)}%`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface TrendEvolutionChartProps {
  evolution: TrendEvolution;
}

/**
 * TrendEvolutionChart — displays a 7-day mini bar chart of daily signal
 * counts alongside key trend metrics (growth rate, velocity, status).
 */
export function TrendEvolutionChart({ evolution }: TrendEvolutionChartProps) {
  const { dailyCounts, growthRate, recentTotal, status } = evolution;

  const maxCount = Math.max(...dailyCounts.map((d) => d.count), 1);
  const barColor = BAR_COLORS[status];
  const statusCfg = STATUS_CONFIG[status];

  // Signal velocity = average signals per day in the recent window
  const recentDays = dailyCounts.length - 3; // last 4 days
  const velocity = recentDays > 0 ? (recentTotal / recentDays).toFixed(1) : '0';

  return (
    <div style={CONTAINER}>
      {/* Bar chart */}
      <div style={CHART_ROW}>
        {dailyCounts.map((day) => {
          const heightPct = maxCount > 0 ? (day.count / maxCount) * 100 : 0;
          return (
            <div key={day.date} style={BAR_WRAPPER}>
              <div
                style={{
                  width: '100%',
                  maxWidth: 28,
                  height: `${Math.max(heightPct, 4)}%`,
                  borderRadius: '4px 4px 2px 2px',
                  background: barColor,
                  opacity: day.count > 0 ? 0.85 : 0.2,
                  transition: 'height 0.3s ease',
                }}
                title={`${day.date}: ${day.count} signal${day.count !== 1 ? 's' : ''}`}
              />
              <span style={BAR_LABEL}>{formatDayLabel(day.date)}</span>
            </div>
          );
        })}
      </div>

      {/* Metrics row */}
      <div style={METRICS_ROW}>
        {/* Growth rate */}
        <div style={METRIC_CARD}>
          <span style={METRIC_LABEL}>Growth</span>
          <span
            style={{
              ...METRIC_VALUE,
              color: growthRate > 0
                ? 'var(--emerald-l, #34d399)'
                : growthRate < 0
                  ? 'var(--sky-l, #38bdf8)'
                  : 'var(--text)',
            }}
          >
            {formatGrowth(growthRate)}
          </span>
        </div>

        {/* Signal velocity */}
        <div style={METRIC_CARD}>
          <span style={METRIC_LABEL}>Velocity</span>
          <span style={METRIC_VALUE}>
            {velocity}<span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text3)', marginLeft: 2 }}>/day</span>
          </span>
        </div>

        {/* Trend status */}
        <div style={METRIC_CARD}>
          <span style={METRIC_LABEL}>Status</span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: statusCfg.color,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {statusCfg.symbol} {statusCfg.label}
          </span>
        </div>
      </div>
    </div>
  );
}
