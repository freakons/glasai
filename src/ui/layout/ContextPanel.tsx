import { GlassCard } from '../components/GlassCard';
import { Badge } from '../components/Badge';
import { StatusIndicator } from '../components/StatusIndicator';
import type { Signal } from '@/data/mockSignals';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

type BadgeCategory = 'signals' | 'models' | 'funding' | 'regulation' | 'agents' | 'research' | 'product';

function catToBadge(cat: string): BadgeCategory {
  if (['models', 'funding', 'regulation', 'agents', 'research', 'product'].includes(cat)) {
    return cat as BadgeCategory;
  }
  return 'signals';
}

function confidenceToStatus(confidence: number): 'live' | 'pending' | 'passed' {
  if (confidence >= 90) return 'live';
  if (confidence >= 75) return 'pending';
  return 'passed';
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface ContextPanelProps {
  /** Live signals to display — when empty, shows a truthful empty state. */
  signals?: Signal[];
}

/**
 * ContextPanel — right-side panel showing live signal intelligence summary.
 * Accepts signals as props; renders a truthful empty state when no data exists.
 */
export function ContextPanel({ signals = [] }: ContextPanelProps) {
  // Top 5 most recent signals
  const recentSignals = signals.slice(0, 5);

  // Category breakdown for summary row
  const catCounts = signals.reduce<Record<string, number>>((acc, s) => {
    acc[s.category] = (acc[s.category] ?? 0) + 1;
    return acc;
  }, {});

  const summaryRows: Array<{ category: BadgeCategory; label: string; count: number }> = [
    { category: 'models',     label: 'Models',     count: catCounts.models     ?? 0 },
    { category: 'funding',    label: 'Funding',    count: catCounts.funding    ?? 0 },
    { category: 'regulation', label: 'Regulation', count: catCounts.regulation ?? 0 },
    { category: 'research',   label: 'Research',   count: catCounts.research   ?? 0 },
  ];

  const avgConf = signals.length > 0
    ? Math.round(signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length)
    : 0;

  return (
    <aside className="il-ctx">
      <div className="il-ctx-hd">
        <div className="il-ctx-hd-dot" />
        Signal Intelligence
      </div>

      {/* Live signal count */}
      <GlassCard>
        <div style={{ padding: '4px' }}>
          <div style={{
            fontFamily: 'var(--fm)',
            fontSize: '8.5px',
            letterSpacing: '0.12em',
            textTransform: 'uppercase' as const,
            color: 'var(--text3)',
            marginBottom: '10px',
          }}>
            Ecosystem Pulse
          </div>
          {signals.length > 0 ? (
            <>
              <div style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: '6px',
                marginBottom: '6px',
              }}>
                <span style={{
                  fontFamily: 'var(--fd)',
                  fontSize: '28px',
                  fontStyle: 'italic',
                  color: 'var(--indigo-l)',
                  textShadow: '0 0 20px rgba(79,70,229,0.4)',
                  lineHeight: 1,
                }}>
                  {signals.length}
                </span>
                <span style={{
                  fontFamily: 'var(--fm)',
                  fontSize: '10px',
                  color: 'var(--text3)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase' as const,
                }}>
                  signals detected
                </span>
              </div>
              <div style={{
                fontFamily: 'var(--fm)',
                fontSize: '10.5px',
                color: 'var(--text2)',
              }}>
                Avg confidence: <span style={{ color: 'var(--emerald-l)' }}>{avgConf}%</span>
              </div>
            </>
          ) : (
            <div style={{
              fontFamily: 'var(--fm)',
              fontSize: '11px',
              color: 'var(--text3)',
              lineHeight: 1.5,
            }}>
              No signals detected yet. Intelligence will appear here as the pipeline ingests data.
            </div>
          )}
        </div>
      </GlassCard>

      {/* Category breakdown — only show when data exists */}
      {signals.length > 0 && (
        <GlassCard>
          <div style={{ padding: '4px' }}>
            <div style={{
              fontFamily: 'var(--fm)',
              fontSize: '8.5px',
              letterSpacing: '0.12em',
              textTransform: 'uppercase' as const,
              color: 'var(--text3)',
              marginBottom: '12px',
            }}>
              Signal Breakdown
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {summaryRows.map(({ category, label, count }) => (
                <div key={category} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Badge category={category} label={`${label} (${count})`} />
                  <StatusIndicator state={confidenceToStatus(
                    count > 0
                      ? Math.round(signals.filter(s => s.category === category).reduce((sum, s) => sum + s.confidence, 0) / count)
                      : 0
                  )} />
                </div>
              ))}
            </div>
          </div>
        </GlassCard>
      )}

      {/* Recent signals — only show when data exists */}
      {recentSignals.length > 0 && (
        <GlassCard>
          <div style={{ padding: '4px' }}>
            <div style={{
              fontFamily: 'var(--fm)',
              fontSize: '8.5px',
              letterSpacing: '0.12em',
              textTransform: 'uppercase' as const,
              color: 'var(--text3)',
              marginBottom: '12px',
            }}>
              Recent Signals
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {recentSignals.map((signal) => (
                <div key={signal.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{
                    fontFamily: 'var(--f)',
                    fontSize: '11.5px',
                    color: 'var(--text)',
                    lineHeight: 1.4,
                  }}>
                    {signal.title.length > 52
                      ? signal.title.slice(0, 51) + '\u2026'
                      : signal.title}
                  </div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px',
                  }}>
                    <Badge category={catToBadge(signal.category)} label={signal.category} />
                    <span style={{
                      fontFamily: 'var(--fm)',
                      fontSize: '9.5px',
                      color: signal.confidence >= 90
                        ? 'var(--emerald-l)'
                        : signal.confidence >= 75
                          ? 'var(--amber-l)'
                          : 'var(--text3)',
                    }}>
                      {signal.confidence}% · {formatDate(signal.date)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </GlassCard>
      )}
    </aside>
  );
}
