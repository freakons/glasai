import type { Signal } from '@/data/mockSignals';

// ─────────────────────────────────────────────────────────────────────────────
// Style constants
// ─────────────────────────────────────────────────────────────────────────────

const SECTION_HEADER: React.CSSProperties = {
  fontFamily: 'var(--fm)', fontSize: 9, letterSpacing: '0.12em',
  textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 16,
};

const GLASS_CARD: React.CSSProperties = {
  padding: '20px 24px', borderRadius: 'var(--r)',
  background: 'var(--glass)', border: '1px solid var(--border)',
};

const FACTOR_ROW: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '8px 0',
  borderBottom: '1px solid var(--border2)',
};

const FACTOR_LABEL: React.CSSProperties = {
  fontFamily: 'var(--fm)', fontSize: 10, letterSpacing: '0.06em',
  color: 'var(--text3)', textTransform: 'uppercase',
};

const FACTOR_VALUE: React.CSSProperties = {
  fontFamily: 'var(--fm)', fontSize: 12,
};

const MINI_BADGE: React.CSSProperties = {
  fontFamily: 'var(--fm)', fontSize: 8, letterSpacing: '0.1em',
  textTransform: 'uppercase', padding: '2px 8px', borderRadius: 10,
  display: 'inline-flex', alignItems: 'center',
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function confidenceColor(score: number): string {
  if (score >= 90) return 'var(--emerald-l)';
  if (score >= 75) return 'var(--amber-l)';
  return 'var(--text3)';
}

function significanceLabel(score: number): string {
  if (score >= 85) return 'Critical';
  if (score >= 65) return 'High';
  if (score >= 40) return 'Standard';
  return 'Low';
}

function recencyLabel(dateStr: string): string {
  const days = Math.round(
    (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24),
  );
  if (days <= 1) return 'Today';
  if (days <= 3) return 'Very recent';
  if (days <= 7) return 'This week';
  if (days <= 14) return 'Recent';
  if (days <= 30) return 'This month';
  return 'Older';
}

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface ConfidenceBreakdownProps {
  signal: Signal;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function ConfidenceBreakdown({ signal }: ConfidenceBreakdownProps) {
  const ctx = signal.context;
  const sourceCount = signal.sourceSupportCount ?? 0;
  const significance = signal.significanceScore;
  const recency = recencyLabel(signal.date);

  const hasExplanation = !!ctx?.confidenceExplanation;
  const hasFactors = sourceCount > 0 || significance != null;

  if (!hasExplanation && !hasFactors) return null;

  return (
    <div style={GLASS_CARD}>
      <div style={SECTION_HEADER}>Confidence Breakdown</div>

      {/* Factors grid */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>

        {/* Confidence score */}
        <div style={FACTOR_ROW}>
          <span style={FACTOR_LABEL}>Confidence</span>
          <span style={{ ...FACTOR_VALUE, color: confidenceColor(signal.confidence) }}>
            {signal.confidence}/100
          </span>
        </div>

        {/* Source support */}
        {sourceCount > 0 && (
          <div style={FACTOR_ROW}>
            <span style={FACTOR_LABEL}>Source support</span>
            <span style={FACTOR_VALUE}>
              <span style={{
                ...MINI_BADGE,
                color: sourceCount >= 3 ? 'var(--emerald-l)' : 'var(--amber-l)',
                border: `1px solid ${sourceCount >= 3 ? 'rgba(5,150,105,0.3)' : 'rgba(217,119,6,0.3)'}`,
              }}>
                {sourceCount} {sourceCount === 1 ? 'source' : 'sources'}
              </span>
            </span>
          </div>
        )}

        {/* Significance */}
        {significance != null && (
          <div style={FACTOR_ROW}>
            <span style={FACTOR_LABEL}>Significance</span>
            <span style={FACTOR_VALUE}>
              <span style={{
                ...MINI_BADGE,
                color: significance >= 65 ? 'var(--amber-l)' : 'var(--text3)',
                border: `1px solid ${significance >= 65 ? 'rgba(217,119,6,0.3)' : 'var(--border2)'}`,
              }}>
                {significanceLabel(significance)} ({significance})
              </span>
            </span>
          </div>
        )}

        {/* Recency */}
        <div style={{ ...FACTOR_ROW, borderBottom: 'none' }}>
          <span style={FACTOR_LABEL}>Recency</span>
          <span style={FACTOR_VALUE}>
            <span style={{
              ...MINI_BADGE,
              color: 'var(--text3)',
              border: '1px solid var(--border2)',
            }}>
              {recency}
            </span>
          </span>
        </div>
      </div>

      {/* Explanation text */}
      {hasExplanation && (
        <p style={{
          fontSize: 13, color: 'var(--text2)', lineHeight: 1.7,
          marginTop: 16, paddingTop: 12,
          borderTop: '1px solid var(--border2)',
        }}>
          {ctx!.confidenceExplanation}
        </p>
      )}
    </div>
  );
}
