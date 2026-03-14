import Link from 'next/link';
import type { Metadata } from 'next';
import { getEntityComparison } from '@/db/queries';
import type { EntityComparisonEntry } from '@/db/queries';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

const SECTION_HEADER: React.CSSProperties = {
  fontFamily: 'var(--fm)', fontSize: 9, letterSpacing: '0.12em',
  textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 12,
};

const GLASS_CARD: React.CSSProperties = {
  padding: '20px 24px', borderRadius: 'var(--r)',
  background: 'var(--glass)', border: '1px solid var(--border)',
};

const BREADCRUMB: React.CSSProperties = {
  fontFamily: 'var(--fm)', fontSize: 10, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'var(--text3)', textDecoration: 'none',
};

const EMPTY_TEXT: React.CSSProperties = {
  fontSize: 13, color: 'var(--text3)', lineHeight: 1.7,
};

// ─────────────────────────────────────────────────────────────────────────────
// Metadata
// ─────────────────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: 'Entity Compare — Intelligence Comparison',
  description: 'Compare intelligence activity, signals, and events across multiple entities side-by-side.',
};

export const revalidate = 300;

// ─────────────────────────────────────────────────────────────────────────────
// Metric row helper
// ─────────────────────────────────────────────────────────────────────────────

function MetricRow({ label, values, color, highlight }: {
  label: string;
  values: (string | number)[];
  color?: string;
  highlight?: 'max' | 'min';
}) {
  const numericValues = values.map((v) => (typeof v === 'number' ? v : parseFloat(String(v)) || 0));
  const targetVal = highlight === 'max'
    ? Math.max(...numericValues)
    : highlight === 'min'
      ? Math.min(...numericValues)
      : null;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `140px repeat(${values.length}, 1fr)`,
      gap: 12,
      padding: '8px 0',
      borderBottom: '1px solid var(--border)',
      alignItems: 'center',
    }}>
      <span style={{ fontFamily: 'var(--fm)', fontSize: 10, color: 'var(--text3)', letterSpacing: '0.06em' }}>
        {label}
      </span>
      {values.map((v, i) => {
        const isTarget = targetVal !== null && numericValues[i] === targetVal && numericValues.filter((n) => n === targetVal).length === 1;
        return (
          <span key={i} style={{
            fontFamily: 'var(--fm)', fontSize: 13, textAlign: 'center',
            color: isTarget ? (color ?? 'var(--cyan-l)') : 'var(--text)',
            fontWeight: isTarget ? 600 : 400,
          }}>
            {v}
          </span>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Entity column component
// ─────────────────────────────────────────────────────────────────────────────

function EntityColumn({ entry }: { entry: EntityComparisonEntry }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      {/* Entity header */}
      <div style={{ ...GLASS_CARD, marginBottom: 12 }}>
        <Link
          href={`/entity/${entry.slug}`}
          style={{ textDecoration: 'none' }}
        >
          <h2 style={{
            fontFamily: 'var(--fd)', fontSize: 22, fontStyle: 'italic',
            color: 'var(--text)', letterSpacing: '-0.02em', margin: '0 0 6px',
          }}>
            {entry.name}
          </h2>
        </Link>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {entry.sector && (
            <span style={{
              fontFamily: 'var(--fm)', fontSize: 9, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--text3)',
              padding: '2px 8px', borderRadius: 10,
              border: '1px solid var(--border2)',
            }}>
              {entry.sector}
            </span>
          )}
          {entry.country && (
            <span style={{
              fontFamily: 'var(--fm)', fontSize: 9, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--text3)',
              padding: '2px 8px', borderRadius: 10,
              border: '1px solid var(--border2)',
            }}>
              {entry.country}
            </span>
          )}
        </div>
      </div>

      {/* Recent signals */}
      <div style={{ ...GLASS_CARD, marginBottom: 12 }}>
        <div style={SECTION_HEADER}>Recent Signals</div>
        {entry.recentSignals.length === 0 ? (
          <p style={EMPTY_TEXT}>No recent signals</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {entry.recentSignals.map((sig) => (
              <Link
                key={sig.id}
                href={`/signals/${sig.id}`}
                style={{
                  display: 'block',
                  padding: '10px 0 10px 10px',
                  borderBottom: '1px solid var(--border)',
                  borderLeft: '2px solid var(--cyan-l)',
                  textDecoration: 'none',
                }}
              >
                <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5, marginBottom: 4 }}>
                  {sig.title}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{
                    fontFamily: 'var(--fm)', fontSize: 8, letterSpacing: '0.1em',
                    textTransform: 'uppercase', color: 'var(--text3)',
                    padding: '1px 6px', borderRadius: 8,
                    border: '1px solid var(--border2)',
                  }}>
                    {sig.category}
                  </span>
                  <span style={{ fontFamily: 'var(--fm)', fontSize: 9, color: 'var(--text3)' }}>
                    {formatDate(sig.date)}
                  </span>
                  {sig.confidence >= 80 && (
                    <span style={{ fontFamily: 'var(--fm)', fontSize: 9, color: 'var(--emerald-l)' }}>
                      {sig.confidence}%
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Recent events */}
      <div style={GLASS_CARD}>
        <div style={SECTION_HEADER}>Recent Events</div>
        {entry.recentEvents.length === 0 ? (
          <p style={EMPTY_TEXT}>No recent events</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {entry.recentEvents.map((evt) => (
              <Link
                key={evt.id}
                href={`/events/${evt.id}`}
                style={{
                  display: 'block',
                  padding: '10px 0 10px 10px',
                  borderBottom: '1px solid var(--border)',
                  borderLeft: '2px solid var(--amber-l)',
                  textDecoration: 'none',
                }}
              >
                <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5, marginBottom: 4 }}>
                  {evt.title}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{
                    fontFamily: 'var(--fm)', fontSize: 8, letterSpacing: '0.1em',
                    textTransform: 'uppercase', color: 'var(--text3)',
                    padding: '1px 6px', borderRadius: 8,
                    border: '1px solid var(--border2)',
                  }}>
                    {evt.type}
                  </span>
                  <span style={{ fontFamily: 'var(--fm)', fontSize: 9, color: 'var(--text3)' }}>
                    {formatDate(evt.date)}
                  </span>
                  {evt.amount && (
                    <span style={{ fontFamily: 'var(--fm)', fontSize: 9, color: 'var(--amber-l)' }}>
                      {evt.amount}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default async function ComparePage(
  { searchParams }: { searchParams: Promise<{ entities?: string }> },
) {
  const { entities: entitiesParam } = await searchParams;

  // Parse entity slugs from query param
  const slugs = (entitiesParam ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  // ── Empty state: no entities selected ──────────────────────────────────────
  if (slugs.length === 0) {
    return (
      <div className="page-enter">
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
          <Link href="/" style={BREADCRUMB}>← Home</Link>
          <span style={{ color: 'var(--border)', fontSize: 10 }}>·</span>
          <span style={{ ...BREADCRUMB, color: 'var(--text)' }}>Compare</span>
        </div>

        <div className="hero" style={{ padding: '40px', textAlign: 'center' }}>
          <h1 style={{
            fontFamily: 'var(--fd)', fontSize: 30, fontStyle: 'italic',
            color: 'var(--text)', letterSpacing: '-0.02em', margin: '0 0 12px',
          }}>
            Entity Compare
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7, maxWidth: 520, margin: '0 auto 24px' }}>
            Compare intelligence activity across 2–4 entities side-by-side.
            Pass entity slugs in the URL to get started.
          </p>
          <div style={{ ...GLASS_CARD, maxWidth: 480, margin: '0 auto', textAlign: 'left' }}>
            <div style={SECTION_HEADER}>Usage</div>
            <code style={{
              fontFamily: 'var(--fm)', fontSize: 12, color: 'var(--cyan-l)',
              display: 'block', padding: '12px 16px',
              background: 'var(--glass2)', borderRadius: 8,
              overflowX: 'auto',
            }}>
              /compare?entities=openai,anthropic,deepseek
            </code>
            <p style={{ ...EMPTY_TEXT, marginTop: 12 }}>
              Use comma-separated entity slugs. Supports 2–4 entities.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Empty state: only one entity ───────────────────────────────────────────
  if (slugs.length === 1) {
    return (
      <div className="page-enter">
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
          <Link href="/" style={BREADCRUMB}>← Home</Link>
          <span style={{ color: 'var(--border)', fontSize: 10 }}>·</span>
          <span style={{ ...BREADCRUMB, color: 'var(--text)' }}>Compare</span>
        </div>

        <div className="hero" style={{ padding: '40px', textAlign: 'center' }}>
          <h1 style={{
            fontFamily: 'var(--fd)', fontSize: 30, fontStyle: 'italic',
            color: 'var(--text)', letterSpacing: '-0.02em', margin: '0 0 12px',
          }}>
            Need at least 2 entities
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7, maxWidth: 520, margin: '0 auto 24px' }}>
            You selected only <strong style={{ color: 'var(--text)' }}>{slugs[0]}</strong>.
            Add at least one more entity to compare.
          </p>
          <p style={EMPTY_TEXT}>
            Try: <Link href={`/compare?entities=${slugs[0]},anthropic`} style={{ color: 'var(--cyan-l)', textDecoration: 'none' }}>
              /compare?entities={slugs[0]},anthropic
            </Link>
          </p>
        </div>
      </div>
    );
  }

  // ── Fetch comparison data ──────────────────────────────────────────────────
  const entries = await getEntityComparison(slugs);

  // ── Empty state: no known entities ─────────────────────────────────────────
  if (entries.length === 0) {
    return (
      <div className="page-enter">
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
          <Link href="/" style={BREADCRUMB}>← Home</Link>
          <span style={{ color: 'var(--border)', fontSize: 10 }}>·</span>
          <span style={{ ...BREADCRUMB, color: 'var(--text)' }}>Compare</span>
        </div>

        <div className="hero" style={{ padding: '40px', textAlign: 'center' }}>
          <h1 style={{
            fontFamily: 'var(--fd)', fontSize: 30, fontStyle: 'italic',
            color: 'var(--text)', letterSpacing: '-0.02em', margin: '0 0 12px',
          }}>
            No entities found
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7, maxWidth: 520, margin: '0 auto' }}>
            None of the requested entities were recognized: <strong style={{ color: 'var(--text)' }}>{slugs.join(', ')}</strong>.
            Check your entity slugs and try again.
          </p>
        </div>
      </div>
    );
  }

  // ── Warning if some entities not found ─────────────────────────────────────
  const foundSlugs = new Set(entries.map((e) => e.slug));
  const missingSlugs = slugs.filter((s) => !foundSlugs.has(s));

  return (
    <div className="page-enter">

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
        <Link href="/" style={BREADCRUMB}>← Home</Link>
        <span style={{ color: 'var(--border)', fontSize: 10 }}>·</span>
        <Link href="/intelligence" style={BREADCRUMB}>Intelligence</Link>
        <span style={{ color: 'var(--border)', fontSize: 10 }}>·</span>
        <span style={{ ...BREADCRUMB, color: 'var(--text)' }}>Compare</span>
      </div>

      {/* Page header */}
      <div className="hero" style={{ padding: '32px 40px', marginBottom: 20 }}>
        <div style={{ marginBottom: 6 }}>
          <span style={{
            fontFamily: 'var(--fm)', fontSize: 9, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'var(--text3)',
          }}>
            COMPARING {entries.length} ENTITIES
          </span>
        </div>
        <h1 style={{
          fontFamily: 'var(--fd)', fontSize: 30, fontStyle: 'italic',
          color: 'var(--text)', letterSpacing: '-0.02em', margin: '0 0 10px',
        }}>
          {entries.map((e) => e.name).join(' vs ')}
        </h1>

        {missingSlugs.length > 0 && (
          <p style={{ fontSize: 12, color: 'var(--amber-l)', marginBottom: 12 }}>
            Not found: {missingSlugs.join(', ')}
          </p>
        )}
      </div>

      {/* Metrics comparison table */}
      <div style={{ ...GLASS_CARD, marginBottom: 20 }}>
        <div style={SECTION_HEADER}>Intelligence Metrics</div>

        {/* Header row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: `140px repeat(${entries.length}, 1fr)`,
          gap: 12,
          padding: '8px 0 12px',
          borderBottom: '2px solid var(--border2)',
        }}>
          <span style={{ fontFamily: 'var(--fm)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text3)' }}>
            Metric
          </span>
          {entries.map((e) => (
            <Link
              key={e.slug}
              href={`/entity/${e.slug}`}
              style={{
                fontFamily: 'var(--fd)', fontSize: 15, fontStyle: 'italic',
                color: 'var(--text)', textAlign: 'center', textDecoration: 'none',
              }}
            >
              {e.name}
            </Link>
          ))}
        </div>

        <MetricRow
          label="Signals · 24h"
          values={entries.map((e) => e.signals24h)}
          color="var(--cyan-l)"
          highlight="max"
        />
        <MetricRow
          label="Signals · 7d"
          values={entries.map((e) => e.signals7d)}
          color="var(--indigo-l)"
          highlight="max"
        />
        <MetricRow
          label="Signals · 30d"
          values={entries.map((e) => e.signals30d)}
          color="var(--indigo-l)"
          highlight="max"
        />
        <MetricRow
          label="Total Signals"
          values={entries.map((e) => e.signalsTotal)}
          color="var(--emerald-l)"
          highlight="max"
        />
        <MetricRow
          label="Total Events"
          values={entries.map((e) => e.eventsTotal)}
          color="var(--amber-l)"
          highlight="max"
        />
        <MetricRow
          label="Avg Confidence"
          values={entries.map((e) => e.avgConfidence > 0 ? `${e.avgConfidence.toFixed(0)}%` : '—')}
          color="var(--emerald-l)"
        />
        <MetricRow
          label="Last Activity"
          values={entries.map((e) => e.lastActivity ? formatDate(e.lastActivity) : '—')}
        />
      </div>

      {/* Side-by-side entity columns */}
      <div
        className="compare-grid"
        style={{ gridTemplateColumns: `repeat(${entries.length}, 1fr)` }}
      >
        {entries.map((entry) => (
          <EntityColumn key={entry.slug} entry={entry} />
        ))}
      </div>
    </div>
  );
}
