import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  getEntityBySlug,
  getSignalsForEntity,
  getEventsForEntity,
  getEntityMetrics,
} from '@/db/queries';
import { SupportingEventRow } from '@/components/events/SupportingEventRow';
import { WatchlistButton } from '@/components/watchlist/WatchlistButton';

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

const BREADCRUMB: React.CSSProperties = {
  fontFamily: 'var(--fm)', fontSize: 10, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'var(--text3)', textDecoration: 'none',
};

const TAG: React.CSSProperties = {
  fontFamily: 'var(--fm)', fontSize: 9, letterSpacing: '0.08em',
  textTransform: 'uppercase', padding: '2px 8px', borderRadius: 10,
  border: '1px solid var(--border2)', color: 'var(--text3)',
};

const EMPTY_TEXT: React.CSSProperties = {
  fontSize: 13, color: 'var(--text3)', lineHeight: 1.7,
};

// ─────────────────────────────────────────────────────────────────────────────
// Metadata
// ─────────────────────────────────────────────────────────────────────────────

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const entity = await getEntityBySlug(slug);
  const displayName = entity?.name ?? slug;
  return {
    title: `${displayName} — Entity Intelligence Dossier`,
    description: `Intelligence dossier for ${displayName} — signals, events, metrics, and related activity.`,
  };
}

export const revalidate = 300;

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default async function EntityDossierPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const entity = await getEntityBySlug(slug);
  if (!entity) notFound();

  const entityName = entity.name;

  const [signals, events, metrics] = await Promise.all([
    getSignalsForEntity(entityName, 20).catch(() => []),
    getEventsForEntity(entityName, 15).catch(() => []),
    getEntityMetrics(entityName).catch(() => ({
      signalsTotal: 0, signals24h: 0, signals7d: 0, signals30d: 0,
      eventsTotal: 0, avgConfidence: 0, firstSeen: null, lastActivity: null,
    })),
  ]);

  const riskColor = entity.riskLevel === 'high'
    ? 'var(--amber-l)'
    : entity.riskLevel === 'medium'
      ? 'var(--text2)'
      : 'var(--text3)';

  const riskBorder = entity.riskLevel === 'high'
    ? 'rgba(217,119,6,0.4)'
    : 'var(--border2)';

  return (
    <div className="page-enter">

      {/* Breadcrumb nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
        <Link href="/" style={BREADCRUMB}>← Home</Link>
        <span style={{ color: 'var(--border)', fontSize: 10 }}>·</span>
        <Link href="/intelligence" style={BREADCRUMB}>Intelligence</Link>
        <span style={{ color: 'var(--border)', fontSize: 10 }}>·</span>
        <span style={{ ...BREADCRUMB, color: 'var(--text)' }}>Entity Dossier</span>
      </div>

      {/* Entity header / hero */}
      <div className="hero" style={{ padding: '32px 40px', marginBottom: 20 }}>

        {/* Type / sector / country badges */}
        <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: 'var(--fm)', fontSize: 9, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'var(--text3)',
          }}>
            {entity.sector || 'Company'}{entity.country ? ` · ${entity.country}` : ''}
          </span>
          {entity.riskLevel && entity.riskLevel !== 'low' && (
            <span style={{
              fontFamily: 'var(--fm)', fontSize: 8, letterSpacing: '0.1em',
              textTransform: 'uppercase',
              padding: '2px 8px', borderRadius: 10,
              color: riskColor,
              border: `1px solid ${riskBorder}`,
            }}>
              {entity.riskLevel} risk
            </span>
          )}
          {entity.founded > 0 && (
            <span style={{
              fontFamily: 'var(--fm)', fontSize: 9, color: 'var(--text3)',
            }}>
              Est. {entity.founded}
            </span>
          )}
        </div>

        {/* Entity name + watchlist action */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
          <h1 style={{
            fontFamily: 'var(--fd)', fontSize: 34, fontStyle: 'italic',
            color: 'var(--text)', letterSpacing: '-0.02em', margin: 0,
          }}>
            {entity.name}
          </h1>
          <WatchlistButton
            slug={slug}
            name={entity.name}
            sector={entity.sector ?? undefined}
            country={entity.country ?? undefined}
          />
        </div>

        {/* Description */}
        {entity.summary ? (
          <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7, maxWidth: 600, marginBottom: 16 }}>
            {entity.summary}
          </p>
        ) : (
          <p style={{ ...EMPTY_TEXT, maxWidth: 600, marginBottom: 16 }}>
            No entity profile details available yet
          </p>
        )}

        {/* Tags */}
        {entity.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {entity.tags.map((tag) => (
              <span key={tag} style={TAG}>{tag}</span>
            ))}
          </div>
        )}

        {/* Metadata row */}
        <div style={{ display: 'flex', gap: 20, marginBottom: 24, flexWrap: 'wrap' }}>
          {metrics.firstSeen && (
            <span style={{ fontFamily: 'var(--fm)', fontSize: 10, color: 'var(--text3)' }}>
              First seen {formatDate(metrics.firstSeen)}
            </span>
          )}
          {metrics.lastActivity && (
            <span style={{ fontFamily: 'var(--fm)', fontSize: 10, color: 'var(--text3)' }}>
              Last active {formatDate(metrics.lastActivity)}
            </span>
          )}
          {entity.financialScale && (
            <span style={{ fontFamily: 'var(--fm)', fontSize: 10, color: 'var(--amber-l)' }}>
              {entity.financialScale}
            </span>
          )}
        </div>

        {/* Metric cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
          <div className="stat" style={{ '--sc': 'rgba(6,182,212,0.35)', '--sv': 'var(--cyan-l)' } as React.CSSProperties}>
            <div className="stat-n">{metrics.signals24h}</div>
            <div className="stat-l">Signals · 24 h</div>
          </div>
          <div className="stat" style={{ '--sc': 'rgba(79,70,229,0.35)', '--sv': 'var(--indigo-l)' } as React.CSSProperties}>
            <div className="stat-n">{metrics.signals7d}</div>
            <div className="stat-l">Signals · 7 d</div>
          </div>
          <div className="stat" style={{ '--sc': 'rgba(139,92,246,0.35)', '--sv': 'var(--indigo-l)' } as React.CSSProperties}>
            <div className="stat-n">{metrics.signals30d}</div>
            <div className="stat-l">Signals · 30 d</div>
          </div>
          <div className="stat" style={{ '--sc': 'rgba(16,185,129,0.35)', '--sv': 'var(--emerald-l)' } as React.CSSProperties}>
            <div className="stat-n">{metrics.signalsTotal}</div>
            <div className="stat-l">Total Signals</div>
          </div>
          <div className="stat" style={{ '--sc': 'rgba(217,119,6,0.35)', '--sv': 'var(--amber-l)' } as React.CSSProperties}>
            <div className="stat-n">{metrics.eventsTotal}</div>
            <div className="stat-l">Total Events</div>
          </div>
          <div className="stat" style={{ '--sc': 'rgba(100,116,139,0.35)', '--sv': 'var(--text2)' } as React.CSSProperties}>
            <div className="stat-n">{metrics.avgConfidence > 0 ? metrics.avgConfidence.toFixed(0) : '—'}</div>
            <div className="stat-l">Avg Confidence</div>
          </div>
        </div>
      </div>

      {/* Main content grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>

        {/* Left column — signals + events */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Recent signals */}
          <div style={GLASS_CARD}>
            <div style={SECTION_HEADER}>Recent Signals</div>

            {signals.length === 0 ? (
              <p style={EMPTY_TEXT}>No recent signals available yet</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {signals.map((sig) => {
                  const isHighlight = (sig.significanceScore ?? 0) >= 65;
                  return (
                    <Link
                      key={sig.id}
                      href={`/signals/${sig.id}`}
                      style={{
                        display: 'block',
                        padding: '12px 0 12px 12px',
                        borderBottom: '1px solid var(--border)',
                        borderLeft: isHighlight ? '2px solid var(--amber-l)' : '2px solid transparent',
                        textDecoration: 'none',
                        transition: 'background 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
                          {sig.title}
                        </span>
                        {isHighlight && (
                          <span style={{
                            fontFamily: 'var(--fm)', fontSize: 8, letterSpacing: '0.08em',
                            textTransform: 'uppercase', color: 'var(--amber-l)',
                            padding: '1px 6px', borderRadius: 8,
                            border: '1px solid rgba(217,119,6,0.4)',
                            whiteSpace: 'nowrap',
                          }}>
                            major
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        {sig.category && (
                          <span style={{
                            fontFamily: 'var(--fm)', fontSize: 9, letterSpacing: '0.1em',
                            textTransform: 'uppercase', color: 'var(--text3)',
                            padding: '2px 8px', borderRadius: 10,
                            border: '1px solid var(--border2)',
                          }}>
                            {sig.category}
                          </span>
                        )}
                        <span style={{ fontFamily: 'var(--fm)', fontSize: 10, color: 'var(--text3)' }}>
                          {formatDate(sig.date)}
                        </span>
                        {sig.confidence >= 80 && (
                          <span style={{ fontFamily: 'var(--fm)', fontSize: 9, color: 'var(--emerald-l)' }}>
                            {sig.confidence}%
                          </span>
                        )}
                        {sig.significanceScore != null && (
                          <span style={{ fontFamily: 'var(--fm)', fontSize: 9, color: 'var(--text3)' }}>
                            sig {sig.significanceScore}
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent events */}
          <div style={GLASS_CARD}>
            <div style={SECTION_HEADER}>Recent Events</div>

            {events.length === 0 ? (
              <p style={EMPTY_TEXT}>No recent events available yet</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {events.map((evt) => (
                  <SupportingEventRow key={evt.id} event={evt} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column — sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Entity profile card */}
          <div style={GLASS_CARD}>
            <div style={SECTION_HEADER}>Entity Profile</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'var(--fm)', fontSize: 10, color: 'var(--text3)' }}>Name</span>
                <span style={{ fontFamily: 'var(--fm)', fontSize: 11, color: 'var(--text)' }}>{entity.name}</span>
              </div>
              {entity.sector && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'var(--fm)', fontSize: 10, color: 'var(--text3)' }}>Sector</span>
                  <span style={{ fontFamily: 'var(--fm)', fontSize: 11, color: 'var(--text2)' }}>{entity.sector}</span>
                </div>
              )}
              {entity.country && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'var(--fm)', fontSize: 10, color: 'var(--text3)' }}>Country</span>
                  <span style={{ fontFamily: 'var(--fm)', fontSize: 11, color: 'var(--text2)' }}>{entity.country}</span>
                </div>
              )}
              {entity.founded > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'var(--fm)', fontSize: 10, color: 'var(--text3)' }}>Founded</span>
                  <span style={{ fontFamily: 'var(--fm)', fontSize: 11, color: 'var(--text2)' }}>{entity.founded}</span>
                </div>
              )}
              {entity.riskLevel && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'var(--fm)', fontSize: 10, color: 'var(--text3)' }}>Risk Level</span>
                  <span style={{ fontFamily: 'var(--fm)', fontSize: 11, color: riskColor }}>{entity.riskLevel}</span>
                </div>
              )}
            </div>
          </div>

          {/* Website / links card */}
          {entity.website && (
            <div style={GLASS_CARD}>
              <div style={SECTION_HEADER}>Website</div>
              <a
                href={entity.website}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 12px', borderRadius: 8,
                  border: '1px solid var(--border2)', background: 'var(--glass2)',
                  textDecoration: 'none', transition: 'border-color 0.15s',
                }}
              >
                <span style={{ fontFamily: 'var(--fm)', fontSize: 11, color: 'var(--indigo-l)' }}>
                  {entity.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                </span>
                <span style={{ fontFamily: 'var(--fm)', fontSize: 9, color: 'var(--text3)', marginLeft: 'auto' }}>
                  ↗
                </span>
              </a>
            </div>
          )}

          {/* Activity summary */}
          <div style={GLASS_CARD}>
            <div style={SECTION_HEADER}>Activity Summary</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--fm)', fontSize: 10, color: 'var(--text3)' }}>Total Signals</span>
                <span style={{ fontFamily: 'var(--fm)', fontSize: 13, color: 'var(--text)' }}>{metrics.signalsTotal}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--fm)', fontSize: 10, color: 'var(--text3)' }}>Total Events</span>
                <span style={{ fontFamily: 'var(--fm)', fontSize: 13, color: 'var(--text)' }}>{metrics.eventsTotal}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--fm)', fontSize: 10, color: 'var(--text3)' }}>Avg Confidence</span>
                <span style={{ fontFamily: 'var(--fm)', fontSize: 13, color: metrics.avgConfidence >= 80 ? 'var(--emerald-l)' : 'var(--text2)' }}>
                  {metrics.avgConfidence > 0 ? `${metrics.avgConfidence.toFixed(0)}%` : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Future sections placeholder */}
          <div style={GLASS_CARD}>
            <div style={SECTION_HEADER}>Coming Soon</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={EMPTY_TEXT}>Entity timeline</span>
              <span style={EMPTY_TEXT}>Related entities graph</span>
              <span style={EMPTY_TEXT}>Funding history</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
