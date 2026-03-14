import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getEventById, getSignalsForEvent } from '@/db/queries';

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

const TYPE_TAG: React.CSSProperties = {
  fontFamily: 'var(--fm)', fontSize: 9, letterSpacing: '0.1em',
  textTransform: 'uppercase', padding: '3px 10px', borderRadius: 10,
  border: '1px solid var(--border2)', color: 'var(--text3)',
};

// ─────────────────────────────────────────────────────────────────────────────
// Metadata
// ─────────────────────────────────────────────────────────────────────────────

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id } = await params;
  const event = await getEventById(id).catch(() => null);
  return {
    title: event ? `${event.title} — Event Intelligence` : 'Event Not Found',
    description: event?.description ?? 'Event detail view.',
  };
}

export const revalidate = 300;

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default async function EventDetailPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const event = await getEventById(id).catch(() => null);

  if (!event) notFound();

  const relatedSignals = await getSignalsForEvent(
    event.id, event.signalIds, event.entityName, 10,
  ).catch(() => []);

  return (
    <div className="page-enter">

      {/* Breadcrumb nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
        <Link href="/" style={BREADCRUMB}>← Home</Link>
        <span style={{ color: 'var(--border)', fontSize: 10 }}>·</span>
        <Link href="/intelligence" style={BREADCRUMB}>Intelligence</Link>
        <span style={{ color: 'var(--border)', fontSize: 10 }}>·</span>
        <span style={{ ...BREADCRUMB, color: 'var(--text)' }}>Event</span>
      </div>

      {/* Event header */}
      <div className="hero" style={{ padding: '32px 40px', marginBottom: 20 }}>
        {/* Meta row */}
        <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={TYPE_TAG}>{event.type}</span>
          {event.amount && (
            <span style={{
              fontFamily: 'var(--fm)', fontSize: 10, letterSpacing: '0.05em',
              padding: '2px 8px', borderRadius: 10,
              color: 'var(--amber-l)', border: '1px solid rgba(217,119,6,0.4)',
            }}>
              {event.amount}
            </span>
          )}
        </div>

        {/* Title */}
        <h1 style={{
          fontFamily: 'var(--fd)', fontSize: 28, fontStyle: 'italic',
          color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 10,
          lineHeight: 1.3,
        }}>
          {event.title}
        </h1>

        {/* Date and entity */}
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--fm)', fontSize: 10, color: 'var(--text3)' }}>
            {formatDate(event.date)}
          </span>
          {event.entityName && (
            <Link
              href={`/entity/${encodeURIComponent(event.entityName)}`}
              style={{
                fontFamily: 'var(--fm)', fontSize: 10, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: 'var(--indigo-l)', textDecoration: 'none',
              }}
            >
              {event.entityName}
            </Link>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>

        {/* Main content column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Description / summary */}
          <div style={GLASS_CARD}>
            <div style={SECTION_HEADER}>Event Summary</div>
            <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.8 }}>
              {event.description}
            </p>
          </div>

          {/* Related signals */}
          <div style={GLASS_CARD}>
            <div style={SECTION_HEADER}>Related Signals</div>
            {relatedSignals.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {relatedSignals.map((sig) => (
                  <Link
                    key={sig.id}
                    href={`/signals/${sig.id}`}
                    style={{
                      display: 'block',
                      padding: '10px 12px', borderRadius: 8,
                      border: '1px solid var(--border2)', background: 'var(--glass2)',
                      textDecoration: 'none', transition: 'border-color 0.15s',
                    }}
                  >
                    <span style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
                      {sig.title}
                    </span>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
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
                          {sig.confidence}% confidence
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.7 }}>
                No related signals found
              </p>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Entity link */}
          {event.entityName && (
            <div style={GLASS_CARD}>
              <div style={SECTION_HEADER}>Entity</div>
              <Link
                href={`/entity/${encodeURIComponent(event.entityName)}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 12px', borderRadius: 8,
                  border: '1px solid var(--border2)', background: 'var(--glass2)',
                  textDecoration: 'none', transition: 'border-color 0.15s',
                }}
              >
                <span style={{ fontFamily: 'var(--fm)', fontSize: 12, color: 'var(--indigo-l)' }}>
                  {event.entityName}
                </span>
                <span style={{ fontFamily: 'var(--fm)', fontSize: 9, color: 'var(--text3)', marginLeft: 'auto' }}>
                  View entity →
                </span>
              </Link>
            </div>
          )}

          {/* Source article */}
          <div style={GLASS_CARD}>
            <div style={SECTION_HEADER}>Source</div>
            <p style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.7 }}>
              No source article linked yet
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
