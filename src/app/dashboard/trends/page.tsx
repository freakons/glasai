import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Trends — Omterminal Intelligence',
};

export const revalidate = 60;

interface Trend {
  topic: string;
  category: string;
  signal_count: number;
  confidence: number;
  entities?: string[];
  summary?: string;
}

function confidenceColor(confidence: number): string {
  if (confidence >= 0.75) return '#34d399'; // emerald
  if (confidence >= 0.5)  return '#fbbf24'; // amber
  return '#fb7185';                          // rose
}

export default async function TrendsPage() {
  let trends: Trend[] = [];

  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'}/api/intelligence/trends`, {
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      trends = (data.trends ?? []).sort(
        (a: Trend, b: Trend) => b.confidence - a.confidence
      );
    }
  } catch {
    // Render empty state if API is unavailable
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <span style={{ fontSize: 13, color: 'var(--text2)' }}>
          {trends.length} trend{trends.length !== 1 ? 's' : ''} · sorted by confidence
        </span>
      </div>

      {trends.length === 0 ? (
        <p style={{ color: 'var(--text2)', fontSize: 14 }}>No trends available.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {trends.map((trend, i) => {
            const pct = Math.round(trend.confidence * 100);
            const barColor = confidenceColor(trend.confidence);

            return (
              <li
                key={`${trend.topic}-${i}`}
                style={{
                  background: 'var(--glass)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-surface-sm)',
                  padding: '14px 18px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <p style={{
                      margin: 0,
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--text)',
                      lineHeight: 1.4,
                    }}>
                      {trend.topic}
                    </p>
                    <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        color: '#a78bfa',
                        background: 'rgba(124,58,237,0.12)',
                        padding: '2px 7px',
                        borderRadius: 4,
                      }}>
                        {trend.category}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                        {trend.signal_count} signal{trend.signal_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', minWidth: 64 }}>
                    <span style={{
                      fontSize: 18,
                      fontWeight: 700,
                      color: barColor,
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {pct}%
                    </span>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text2)' }}>confidence</p>
                  </div>
                </div>

                {/* Confidence bar */}
                <div style={{
                  marginTop: 12,
                  height: 3,
                  background: 'var(--border)',
                  borderRadius: 2,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${pct}%`,
                    height: '100%',
                    background: barColor,
                    borderRadius: 2,
                    transition: 'width 0.3s ease',
                  }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
