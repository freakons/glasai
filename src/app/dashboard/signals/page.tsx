import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Signals — Omterminal Intelligence',
};

export const revalidate = 60;

interface Signal {
  id: string;
  title: string;
  source?: string | null;
  category?: string | null;
  signal_type?: string | null;
  published_at?: string | null;
  created_at?: string;
  date?: string | null;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return value;
  }
}

export default async function SignalsPage() {
  let signals: Signal[] = [];

  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'}/api/intelligence/signals`, {
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      signals = (data.signals ?? []).slice(0, 50);
    }
  } catch {
    // Render empty state if API is unavailable
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <span style={{ fontSize: 13, color: 'var(--text2)' }}>
          {signals.length} signal{signals.length !== 1 ? 's' : ''} · latest first
        </span>
      </div>

      {signals.length === 0 ? (
        <p style={{ color: 'var(--text2)', fontSize: 14 }}>No signals available.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {signals.map((signal) => {
            const category = signal.category ?? signal.signal_type ?? 'unknown';
            const date = formatDate(signal.published_at ?? signal.date ?? signal.created_at);

            return (
              <li
                key={signal.id}
                style={{
                  background: 'var(--glass)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-surface-sm)',
                  padding: '14px 18px',
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: '6px 16px',
                  alignItems: 'start',
                }}
              >
                <div>
                  <p style={{
                    margin: 0,
                    fontSize: 14,
                    fontWeight: 500,
                    color: 'var(--text)',
                    lineHeight: 1.4,
                  }}>
                    {signal.title}
                  </p>
                  <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
                    {signal.source && (
                      <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                        {signal.source}
                      </span>
                    )}
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      color: 'var(--signal-cyan, #06b6d4)',
                      background: 'rgba(6,182,212,0.1)',
                      padding: '2px 7px',
                      borderRadius: 4,
                    }}>
                      {category}
                    </span>
                  </div>
                </div>
                <span style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap', marginTop: 2 }}>
                  {date}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
