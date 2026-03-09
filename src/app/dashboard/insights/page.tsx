import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Insights — Omterminal Intelligence',
};

export const revalidate = 60;

interface Insight {
  title: string;
  summary: string;
  category?: string;
  confidence: number;
  topics?: string[];
  created_at?: string;
}

function confidenceBadgeStyle(confidence: number): React.CSSProperties {
  if (confidence >= 0.75) {
    return { color: '#34d399', background: 'rgba(5,150,105,0.12)' };
  }
  if (confidence >= 0.5) {
    return { color: '#fbbf24', background: 'rgba(217,119,6,0.12)' };
  }
  return { color: '#fb7185', background: 'rgba(225,29,72,0.12)' };
}

export default async function InsightsPage() {
  let insights: Insight[] = [];

  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'}/api/intelligence/insights`, {
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      insights = data.insights ?? [];
    }
  } catch {
    // Render empty state if API is unavailable
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <span style={{ fontSize: 13, color: 'var(--text2)' }}>
          {insights.length} insight{insights.length !== 1 ? 's' : ''}
        </span>
      </div>

      {insights.length === 0 ? (
        <p style={{ color: 'var(--text2)', fontSize: 14 }}>No insights available.</p>
      ) : (
        <ul style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 14,
        }}>
          {insights.map((insight, i) => {
            const pct = Math.round(insight.confidence * 100);
            const badgeStyle = confidenceBadgeStyle(insight.confidence);

            return (
              <li
                key={`${insight.title}-${i}`}
                style={{
                  background: 'var(--glass)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-surface)',
                  padding: '18px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <h3 style={{
                    margin: 0,
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'var(--text)',
                    lineHeight: 1.4,
                    flex: 1,
                  }}>
                    {insight.title}
                  </h3>
                  <span style={{
                    flexShrink: 0,
                    fontSize: 12,
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: 5,
                    fontVariantNumeric: 'tabular-nums',
                    ...badgeStyle,
                  }}>
                    {pct}%
                  </span>
                </div>

                {/* Summary */}
                <p style={{
                  margin: 0,
                  fontSize: 13,
                  color: 'var(--text2)',
                  lineHeight: 1.55,
                  flexGrow: 1,
                }}>
                  {insight.summary}
                </p>

                {/* Footer */}
                {insight.category && (
                  <span style={{
                    alignSelf: 'flex-start',
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    color: '#67e8f9',
                    background: 'rgba(6,182,212,0.1)',
                    padding: '2px 7px',
                    borderRadius: 4,
                  }}>
                    {insight.category}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
