import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getSignalById, getRelatedSignals } from '@/db/queries';
import { Badge } from '@/components/ui/Badge';
import { getSignificanceTier } from '@/lib/signals/feedComposer';

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
  textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 16,
};

const GLASS_CARD: React.CSSProperties = {
  padding: '20px 24px', borderRadius: 'var(--r)',
  background: 'var(--glass)', border: '1px solid var(--border)',
};

// ─────────────────────────────────────────────────────────────────────────────
// Metadata
// ─────────────────────────────────────────────────────────────────────────────

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id } = await params;
  const signal = await getSignalById(id).catch(() => null);
  return {
    title: signal ? `${signal.title} — Signal Intelligence` : 'Signal Not Found',
    description: signal?.summary ?? 'Signal detail view.',
  };
}

export const revalidate = 300;

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default async function SignalDetailPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const signal = await getSignalById(id).catch(() => null);

  if (!signal) notFound();

  const tier = getSignificanceTier(signal.significanceScore);
  const relatedSignals = await getRelatedSignals(signal.id, signal.entityName, 5).catch(() => []);

  return (
    <div className="page-enter">

      {/* Nav breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
        <Link
          href="/"
          style={{ fontFamily: 'var(--fm)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)', textDecoration: 'none' }}
        >
          ← Home
        </Link>
        <span style={{ color: 'var(--border)', fontSize: 10 }}>·</span>
        <Link
          href="/intelligence"
          style={{ fontFamily: 'var(--fm)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)', textDecoration: 'none' }}
        >
          Intelligence
        </Link>
        <span style={{ color: 'var(--border)', fontSize: 10 }}>·</span>
        <span style={{ fontFamily: 'var(--fm)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text)' }}>
          Signal
        </span>
      </div>

      {/* Signal header */}
      <div className="hero" style={{ padding: '32px 40px', marginBottom: 20 }}>
        {/* Meta row */}
        <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Badge category={signal.category} />
          {tier === 'critical' && (
            <span className="sig-badge sig-critical">Major</span>
          )}
          {tier === 'high' && (
            <span className="sig-badge sig-high">Notable</span>
          )}
          {signal.confidence >= 90 && (
            <span style={{
              fontFamily: 'var(--fm)', fontSize: 8, letterSpacing: '0.1em',
              textTransform: 'uppercase', padding: '2px 8px', borderRadius: 10,
              color: 'var(--emerald-l)', border: '1px solid rgba(5,150,105,0.4)',
            }}>
              Verified
            </span>
          )}
        </div>

        {/* Title */}
        <h1 style={{
          fontFamily: 'var(--fd)', fontSize: 28, fontStyle: 'italic',
          color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 10,
          lineHeight: 1.3,
        }}>
          {signal.title}
        </h1>

        {/* Date and entity */}
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--fm)', fontSize: 10, color: 'var(--text3)' }}>
            {formatDate(signal.date)}
          </span>
          {signal.entityName && (
            <Link
              href={`/entity/${encodeURIComponent(signal.entityName)}`}
              style={{
                fontFamily: 'var(--fm)', fontSize: 10, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: 'var(--indigo-l)', textDecoration: 'none',
              }}
            >
              {signal.entityName}
            </Link>
          )}
          {signal.sourceSupportCount != null && signal.sourceSupportCount > 1 && (
            <span style={{ fontFamily: 'var(--fm)', fontSize: 10, color: 'var(--text3)' }}>
              {signal.sourceSupportCount} corroborating sources
            </span>
          )}
        </div>

        {/* Metric cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12, marginTop: 24 }}>
          <div className="stat" style={{ '--sc': 'rgba(79,70,229,0.35)', '--sv': 'var(--indigo-l)' } as React.CSSProperties}>
            <div className="stat-n">{signal.confidence}</div>
            <div className="stat-l">Confidence</div>
          </div>
          {signal.significanceScore != null && (
            <div className="stat" style={{ '--sc': 'rgba(217,119,6,0.35)', '--sv': 'var(--amber-l)' } as React.CSSProperties}>
              <div className="stat-n">{signal.significanceScore}</div>
              <div className="stat-l">Significance</div>
            </div>
          )}
          {signal.sourceSupportCount != null && (
            <div className="stat" style={{ '--sc': 'rgba(16,185,129,0.35)', '--sv': 'var(--emerald-l)' } as React.CSSProperties}>
              <div className="stat-n">{signal.sourceSupportCount}</div>
              <div className="stat-l">Sources</div>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>

        {/* Main content column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Summary */}
          <div style={GLASS_CARD}>
            <div style={SECTION_HEADER}>Signal Summary</div>
            <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.8 }}>
              {signal.summary}
            </p>
          </div>

          {/* Why it matters */}
          {signal.context?.whyItMatters && (
            <div style={GLASS_CARD}>
              <div style={SECTION_HEADER}>Why It Matters</div>
              <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.8 }}>
                {signal.context.whyItMatters}
              </p>
            </div>
          )}

          {/* Implications */}
          {signal.context?.implications && signal.context.implications.length > 0 && (
            <div style={GLASS_CARD}>
              <div style={SECTION_HEADER}>Implications</div>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {signal.context.implications.map((item, i) => (
                  <li key={i} style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Confidence explanation */}
          {signal.context?.confidenceExplanation && (
            <div style={GLASS_CARD}>
              <div style={SECTION_HEADER}>Confidence Assessment</div>
              <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>
                {signal.context.confidenceExplanation}
              </p>
            </div>
          )}

          {/* Source basis */}
          {signal.context?.sourceBasis && (
            <div style={GLASS_CARD}>
              <div style={SECTION_HEADER}>Source Basis</div>
              <p style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.7 }}>
                {signal.context.sourceBasis}
              </p>
            </div>
          )}

          {/* Supporting events placeholder */}
          {!signal.context && (
            <div style={GLASS_CARD}>
              <div style={SECTION_HEADER}>Supporting Events</div>
              <p style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.7 }}>
                No supporting events available yet
              </p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Supporting entities */}
          {signal.context?.affectedEntities && signal.context.affectedEntities.length > 0 ? (
            <div style={GLASS_CARD}>
              <div style={SECTION_HEADER}>Supporting Entities</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {signal.context.affectedEntities.map((entity) => {
                  const name = typeof entity === 'string' ? entity : entity.name;
                  const type = typeof entity === 'string' ? undefined : entity.type;
                  return (
                    <Link
                      key={name}
                      href={`/entity/${encodeURIComponent(name)}`}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '8px 12px', borderRadius: 8,
                        border: '1px solid var(--border2)', background: 'var(--glass2)',
                        textDecoration: 'none', transition: 'border-color 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontFamily: 'var(--fm)', fontSize: 12, color: 'var(--text2)' }}>
                          {name}
                        </span>
                        {type && (
                          <span style={{ fontFamily: 'var(--fm)', fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text3)' }}>
                            {type}
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={GLASS_CARD}>
              <div style={SECTION_HEADER}>Supporting Entities</div>
              <p style={{ fontSize: 13, color: 'var(--text3)' }}>
                No supporting entities identified yet
              </p>
            </div>
          )}

          {/* Related signals */}
          {relatedSignals.length > 0 ? (
            <div style={GLASS_CARD}>
              <div style={SECTION_HEADER}>Related Signals</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {relatedSignals.map((rel) => (
                  <Link
                    key={rel.id}
                    href={`/signals/${rel.id}`}
                    style={{
                      display: 'block',
                      padding: '10px 12px', borderRadius: 8,
                      border: '1px solid var(--border2)', background: 'var(--glass2)',
                      textDecoration: 'none', transition: 'border-color 0.15s',
                    }}
                  >
                    <span style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
                      {rel.title}
                    </span>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <span style={{
                        fontFamily: 'var(--fm)', fontSize: 8, letterSpacing: '0.1em',
                        textTransform: 'uppercase', color: 'var(--text3)',
                        padding: '1px 6px', borderRadius: 8,
                        border: '1px solid var(--border2)',
                      }}>
                        {rel.category}
                      </span>
                      <span style={{ fontFamily: 'var(--fm)', fontSize: 9, color: 'var(--text3)' }}>
                        {formatDate(rel.date)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <div style={GLASS_CARD}>
              <div style={SECTION_HEADER}>Related Signals</div>
              <p style={{ fontSize: 13, color: 'var(--text3)' }}>
                No related signals found
              </p>
            </div>
          )}

          {/* Entity link */}
          {signal.entityName && (
            <div style={GLASS_CARD}>
              <div style={SECTION_HEADER}>Entity</div>
              <Link
                href={`/entity/${encodeURIComponent(signal.entityName)}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 12px', borderRadius: 8,
                  border: '1px solid var(--border2)', background: 'var(--glass2)',
                  textDecoration: 'none', transition: 'border-color 0.15s',
                }}
              >
                <span style={{ fontFamily: 'var(--fm)', fontSize: 12, color: 'var(--indigo-l)' }}>
                  {signal.entityName}
                </span>
                <span style={{ fontFamily: 'var(--fm)', fontSize: 9, color: 'var(--text3)', marginLeft: 'auto' }}>
                  View entity →
                </span>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
