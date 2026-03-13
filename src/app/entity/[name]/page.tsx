import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';

// ─────────────────────────────────────────────────────────────────────────────
// Types matching /api/entities/[name] response
// ─────────────────────────────────────────────────────────────────────────────

interface EntityData {
  id: string;
  name: string;
  type: string;
  description: string;
  sector: string | null;
  country: string | null;
  risk_level: string | null;
  first_seen: string | null;
  last_activity: string | null;
}

interface Metrics {
  signals_last_24h: number;
  signals_last_7d: number;
  signals_last_30d: number;
  avg_importance_score: number;
  velocity_score: number;
  trend: 'rising' | 'falling' | 'stable';
}

interface Signal {
  id: string;
  title: string;
  summary: string | null;
  category: string | null;
  signal_type: string | null;
  significance_score: number | null;
  created_at: string;
}

interface RelatedEntity {
  name: string;
  type: string;
  mentions: number;
}

interface ApiResponse {
  ok: boolean;
  entity: EntityData;
  metrics: Metrics;
  related_entities: RelatedEntity[];
  recent_signals: Signal[];
  major_developments: Signal[];
  source_coverage: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Data fetching
// ─────────────────────────────────────────────────────────────────────────────

const NAV_ENTITIES = ['openai', 'deepseek', 'ai-agents'];

async function fetchEntityData(name: string): Promise<ApiResponse | null> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  try {
    const res = await fetch(`${baseUrl}/api/entities/${encodeURIComponent(name)}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

const TREND_SYMBOLS: Record<string, string> = {
  rising: '↑',
  falling: '↓',
  stable: '→',
};

const TREND_COLORS: Record<string, string> = {
  rising: 'var(--emerald-l)',
  falling: 'var(--amber-l)',
  stable: 'var(--text3)',
};

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
  { params }: { params: Promise<{ name: string }> },
): Promise<Metadata> {
  const { name } = await params;
  const entityName = decodeURIComponent(name);
  return {
    title: `${entityName} — Entity Intelligence`,
    description: `Intelligence signals, velocity, and related entities for ${entityName}.`,
  };
}

export const revalidate = 300;

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default async function EntityIntelligencePage(
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const entityName = decodeURIComponent(name);
  const data = await fetchEntityData(entityName);

  if (!data?.ok) notFound();

  const { entity, metrics, related_entities, recent_signals, major_developments, source_coverage } = data;

  return (
    <div className="page-enter">

      {/* Nav links */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
        <Link
          href="/"
          style={{ fontFamily: 'var(--fm)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)', textDecoration: 'none' }}
        >
          ← Home
        </Link>
        <span style={{ color: 'var(--border)', fontSize: 10 }}>·</span>
        {NAV_ENTITIES.map((e) => (
          <Link
            key={e}
            href={`/entity/${e}`}
            style={{
              fontFamily: 'var(--fm)', fontSize: 10, letterSpacing: '0.08em',
              textTransform: 'uppercase', textDecoration: 'none',
              color: e === entityName ? 'var(--text)' : 'var(--text3)',
            }}
          >
            {e}
          </Link>
        ))}
      </div>

      {/* Entity header */}
      <div className="hero" style={{ padding: '32px 40px', marginBottom: 20 }}>
        <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontFamily: 'var(--fm)', fontSize: 9, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'var(--text3)',
          }}>
            {entity.type}{entity.sector ? ` · ${entity.sector}` : ''}{entity.country ? ` · ${entity.country}` : ''}
          </span>
          {entity.risk_level && (
            <span style={{
              fontFamily: 'var(--fm)', fontSize: 8, letterSpacing: '0.1em',
              textTransform: 'uppercase',
              padding: '2px 8px', borderRadius: 10,
              color: entity.risk_level === 'high' ? 'var(--amber-l)' : 'var(--text3)',
              border: `1px solid ${entity.risk_level === 'high' ? 'rgba(217,119,6,0.4)' : 'var(--border2)'}`,
            }}>
              {entity.risk_level} risk
            </span>
          )}
        </div>

        <h1 style={{
          fontFamily: 'var(--fd)', fontSize: 34, fontStyle: 'italic',
          color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 10,
        }}>
          {entity.name}
        </h1>

        {entity.description && (
          <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7, maxWidth: 600, marginBottom: 16 }}>
            {entity.description}
          </p>
        )}

        {/* Entity metadata row */}
        <div style={{ display: 'flex', gap: 20, marginBottom: 24, flexWrap: 'wrap' }}>
          {entity.first_seen && (
            <span style={{ fontFamily: 'var(--fm)', fontSize: 10, color: 'var(--text3)' }}>
              First seen {formatDate(entity.first_seen)}
            </span>
          )}
          {entity.last_activity && (
            <span style={{ fontFamily: 'var(--fm)', fontSize: 10, color: 'var(--text3)' }}>
              Last active {formatDate(entity.last_activity)}
            </span>
          )}
          {source_coverage > 0 && (
            <span style={{ fontFamily: 'var(--fm)', fontSize: 10, color: 'var(--text3)' }}>
              {source_coverage} source{source_coverage !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Metric cards + activity indicators */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
          <div className="stat" style={{ '--sc': 'rgba(6,182,212,0.35)', '--sv': 'var(--cyan-l)' } as React.CSSProperties}>
            <div className="stat-n">{metrics.signals_last_24h}</div>
            <div className="stat-l">Signals · 24 h</div>
          </div>
          <div className="stat" style={{ '--sc': 'rgba(79,70,229,0.35)', '--sv': 'var(--indigo-l)' } as React.CSSProperties}>
            <div className="stat-n">{metrics.signals_last_7d}</div>
            <div className="stat-l">Signals · 7 d</div>
          </div>
          <div className="stat" style={{ '--sc': 'rgba(139,92,246,0.35)', '--sv': 'var(--indigo-l)' } as React.CSSProperties}>
            <div className="stat-n">{metrics.signals_last_30d}</div>
            <div className="stat-l">Signals · 30 d</div>
          </div>
          <div className="stat" style={{ '--sc': 'rgba(16,185,129,0.35)', '--sv': 'var(--emerald-l)' } as React.CSSProperties}>
            <div className="stat-n">{metrics.velocity_score.toFixed(1)}</div>
            <div className="stat-l">Velocity Score</div>
          </div>
          <div className="stat" style={{ '--sc': 'rgba(217,119,6,0.35)', '--sv': 'var(--amber-l)' } as React.CSSProperties}>
            <div className="stat-n">{metrics.avg_importance_score.toFixed(1)}</div>
            <div className="stat-l">Avg Importance</div>
          </div>
          <div className="stat" style={{ '--sc': 'rgba(100,116,139,0.35)', '--sv': TREND_COLORS[metrics.trend] } as React.CSSProperties}>
            <div className="stat-n" style={{ color: TREND_COLORS[metrics.trend] }}>
              {TREND_SYMBOLS[metrics.trend]}
            </div>
            <div className="stat-l">Trend · 7 d</div>
          </div>
        </div>
      </div>

      {/* Major developments */}
      {major_developments.length > 0 && (
        <div style={{ ...GLASS_CARD, marginBottom: 16 }}>
          <div style={SECTION_HEADER}>Major Developments</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {major_developments.map((sig) => (
              <div
                key={sig.id}
                style={{
                  padding: '12px 0',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  {sig.significance_score != null && (
                    <span style={{
                      fontFamily: 'var(--fm)', fontSize: 11, fontWeight: 600,
                      color: sig.significance_score >= 65 ? 'var(--amber-l)' : 'var(--text2)',
                      minWidth: 28,
                    }}>
                      {sig.significance_score}
                    </span>
                  )}
                  <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
                    {sig.title}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', paddingLeft: sig.significance_score != null ? 38 : 0 }}>
                  {(sig.category ?? sig.signal_type) && (
                    <span style={{
                      fontFamily: 'var(--fm)', fontSize: 9, letterSpacing: '0.1em',
                      textTransform: 'uppercase', color: 'var(--text3)',
                      padding: '2px 8px', borderRadius: 10,
                      border: '1px solid var(--border2)',
                    }}>
                      {sig.category ?? sig.signal_type}
                    </span>
                  )}
                  <span style={{ fontFamily: 'var(--fm)', fontSize: 10, color: 'var(--text3)' }}>
                    {formatDate(sig.created_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>

        {/* Entity timeline — chronological signals with significance highlights */}
        <div style={GLASS_CARD}>
          <div style={SECTION_HEADER}>Entity Timeline</div>

          {recent_signals.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text3)' }}>No signals found.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {recent_signals.map((sig) => {
                const isHighlight = (sig.significance_score ?? 0) >= 65;
                return (
                  <div
                    key={sig.id}
                    style={{
                      padding: '12px 0',
                      borderBottom: '1px solid var(--border)',
                      borderLeft: isHighlight ? '2px solid var(--amber-l)' : '2px solid transparent',
                      paddingLeft: 12,
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
                      {(sig.category ?? sig.signal_type) && (
                        <span style={{
                          fontFamily: 'var(--fm)', fontSize: 9, letterSpacing: '0.1em',
                          textTransform: 'uppercase', color: 'var(--text3)',
                          padding: '2px 8px', borderRadius: 10,
                          border: '1px solid var(--border2)',
                        }}>
                          {sig.category ?? sig.signal_type}
                        </span>
                      )}
                      <span style={{ fontFamily: 'var(--fm)', fontSize: 10, color: 'var(--text3)' }}>
                        {formatDate(sig.created_at)}
                      </span>
                      {sig.significance_score != null && (
                        <span style={{
                          fontFamily: 'var(--fm)', fontSize: 9, color: 'var(--text3)',
                        }}>
                          sig {sig.significance_score}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Related entities — grouped by type */}
          <div style={GLASS_CARD}>
            <div style={SECTION_HEADER}>Related Entities</div>

            {related_entities.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text3)' }}>None found.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {related_entities.map((rel) => (
                  <Link
                    key={rel.name}
                    href={`/entity/${encodeURIComponent(rel.name)}`}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px 12px', borderRadius: 8,
                      border: '1px solid var(--border2)', background: 'var(--glass2)',
                      textDecoration: 'none',
                      transition: 'border-color 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontFamily: 'var(--fm)', fontSize: 12, color: 'var(--text2)' }}>
                        {rel.name}
                      </span>
                      <span style={{ fontFamily: 'var(--fm)', fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text3)' }}>
                        {rel.type}
                      </span>
                    </div>
                    <span style={{
                      fontFamily: 'var(--fm)', fontSize: 10, color: 'var(--text3)',
                      padding: '1px 7px', borderRadius: 10, background: 'var(--glass)',
                      border: '1px solid var(--border)',
                    }}>
                      {rel.mentions}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Source coverage */}
          {source_coverage > 0 && (
            <div style={GLASS_CARD}>
              <div style={SECTION_HEADER}>Source Coverage</div>
              <div style={{ fontFamily: 'var(--fm)', fontSize: 22, color: 'var(--text)', marginBottom: 4 }}>
                {source_coverage}
              </div>
              <div style={{ fontFamily: 'var(--fm)', fontSize: 10, color: 'var(--text3)' }}>
                distinct source level{source_coverage !== 1 ? 's' : ''} corroborating signals
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
