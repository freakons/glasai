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
}

interface Metrics {
  signals_last_24h: number;
  signals_last_7d: number;
  avg_importance_score: number;
  velocity_score: number;
}

interface Signal {
  id: string;
  title: string;
  summary: string | null;
  category: string | null;
  signal_type: string | null;
  created_at: string;
}

interface RelatedEntity {
  name: string;
  mentions: number;
}

interface ApiResponse {
  ok: boolean;
  entity: EntityData;
  metrics: Metrics;
  related_entities: RelatedEntity[];
  recent_signals: Signal[];
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

  const { entity, metrics, related_entities, recent_signals } = data;

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
        <div style={{ marginBottom: 6 }}>
          <span style={{
            fontFamily: 'var(--fm)', fontSize: 9, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'var(--text3)',
          }}>
            {entity.type}{entity.sector ? ` · ${entity.sector}` : ''}{entity.country ? ` · ${entity.country}` : ''}
          </span>
        </div>

        <h1 style={{
          fontFamily: 'var(--fd)', fontSize: 34, fontStyle: 'italic',
          color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 10,
        }}>
          {entity.name}
        </h1>

        {entity.description && (
          <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7, maxWidth: 600, marginBottom: 24 }}>
            {entity.description}
          </p>
        )}

        {/* Metric cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
          <div className="stat" style={{ '--sc': 'rgba(6,182,212,0.35)', '--sv': 'var(--cyan-l)' } as React.CSSProperties}>
            <div className="stat-n">{metrics.signals_last_24h}</div>
            <div className="stat-l">Signals · 24 h</div>
          </div>
          <div className="stat" style={{ '--sc': 'rgba(79,70,229,0.35)', '--sv': 'var(--indigo-l)' } as React.CSSProperties}>
            <div className="stat-n">{metrics.signals_last_7d}</div>
            <div className="stat-l">Signals · 7 d</div>
          </div>
          <div className="stat" style={{ '--sc': 'rgba(16,185,129,0.35)', '--sv': 'var(--emerald-l)' } as React.CSSProperties}>
            <div className="stat-n">{metrics.velocity_score.toFixed(1)}</div>
            <div className="stat-l">Velocity Score</div>
          </div>
          <div className="stat" style={{ '--sc': 'rgba(217,119,6,0.35)', '--sv': 'var(--amber-l)' } as React.CSSProperties}>
            <div className="stat-n">{metrics.avg_importance_score.toFixed(1)}</div>
            <div className="stat-l">Avg Importance</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>

        {/* Recent signals */}
        <div style={{
          padding: '20px 24px', borderRadius: 'var(--r)',
          background: 'var(--glass)', border: '1px solid var(--border)',
        }}>
          <div style={{
            fontFamily: 'var(--fm)', fontSize: 9, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 16,
          }}>
            Recent Signals
          </div>

          {recent_signals.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text3)' }}>No signals found.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {recent_signals.map((sig) => (
                <div
                  key={sig.id}
                  style={{
                    padding: '12px 0',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, marginBottom: 4 }}>
                    {sig.title}
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
                      {new Date(sig.created_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Related entities */}
        <div style={{
          padding: '20px 24px', borderRadius: 'var(--r)',
          background: 'var(--glass)', border: '1px solid var(--border)',
        }}>
          <div style={{
            fontFamily: 'var(--fm)', fontSize: 9, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 16,
          }}>
            Related Entities
          </div>

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
                  <span style={{ fontFamily: 'var(--fm)', fontSize: 12, color: 'var(--text2)' }}>
                    {rel.name}
                  </span>
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
      </div>
    </div>
  );
}
