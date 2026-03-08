import { GlassCard } from '../components/GlassCard';
import { Badge } from '../components/Badge';
import { StatusIndicator } from '../components/StatusIndicator';
import MOCK_SIGNALS from '@/data/mockSignals';

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

/**
 * ContextPanel — right-side panel showing live signal intelligence summary.
 */
export function ContextPanel() {
  // Top 5 most recent signals
  const recentSignals = MOCK_SIGNALS.slice(0, 5);

  // Category breakdown for summary row
  const catCounts = MOCK_SIGNALS.reduce<Record<string, number>>((acc, s) => {
    acc[s.category] = (acc[s.category] ?? 0) + 1;
    return acc;
  }, {});

  const summaryRows: Array<{ category: BadgeCategory; label: string; state: 'live' | 'pending' | 'passed'; count: number }> = [
    { category: 'models',     label: 'Models',     state: 'pending', count: catCounts.models     ?? 0 },
    { category: 'funding',    label: 'Funding',    state: 'live',    count: catCounts.funding    ?? 0 },
    { category: 'regulation', label: 'Regulation', state: 'live',    count: catCounts.regulation ?? 0 },
    { category: 'research',   label: 'Research',   state: 'pending', count: catCounts.research   ?? 0 },
  ];

  const avgConf = Math.round(
    MOCK_SIGNALS.reduce((sum, s) => sum + s.confidence, 0) / MOCK_SIGNALS.length,
  );

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
              {MOCK_SIGNALS.length}
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
        </div>
      </GlassCard>

      {/* Category breakdown */}
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
            {summaryRows.map(({ category, label, state, count }) => (
              <div key={category} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Badge category={category} label={`${label} (${count})`} />
                <StatusIndicator state={state} />
              </div>
            ))}
          </div>
        </div>
      </GlassCard>

      {/* Recent signals */}
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
                    ? signal.title.slice(0, 51) + '…'
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
    </aside>
  );
}
