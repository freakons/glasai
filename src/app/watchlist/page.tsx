'use client';

import Link from 'next/link';
import { useWatchlist, type WatchedEntity } from '@/hooks/useWatchlist';

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function WatchlistPage() {
  const { entities, remove } = useWatchlist();

  return (
    <div className="page-enter">

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
        <Link href="/" style={BREADCRUMB}>← Home</Link>
        <span style={{ color: 'var(--border)', fontSize: 10 }}>·</span>
        <span style={{ ...BREADCRUMB, color: 'var(--text)' }}>Watchlist</span>
      </div>

      {/* Header */}
      <div className="ph" style={{ marginBottom: 24 }}>
        <h1 className="ph-title">
          Your <span className="ph-hi">Watchlist</span>
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7, maxWidth: 560 }}>
          Entities you&apos;re tracking. Data is stored locally in your browser.
        </p>
      </div>

      {entities.length === 0 ? (
        <EmptyState />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Summary */}
          <div style={GLASS_CARD}>
            <div style={SECTION_HEADER}>
              Watched Entities · {entities.length}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {entities.map((entity) => (
                <EntityRow key={entity.slug} entity={entity} onRemove={remove} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Entity row
// ─────────────────────────────────────────────────────────────────────────────

function EntityRow({
  entity,
  onRemove,
}: {
  entity: WatchedEntity;
  onRemove: (slug: string) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 0 14px 12px',
        borderBottom: '1px solid var(--border)',
        gap: 12,
      }}
    >
      <Link
        href={`/entity/${entity.slug}`}
        style={{
          textDecoration: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          flex: 1,
          minWidth: 0,
        }}
      >
        <span style={{
          fontFamily: 'var(--fd)', fontSize: 17, fontStyle: 'italic',
          color: 'var(--text)', letterSpacing: '-0.01em',
        }}>
          {entity.name}
        </span>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {entity.sector && (
            <span style={{
              fontFamily: 'var(--fm)', fontSize: 9, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--text3)',
              padding: '2px 8px', borderRadius: 10,
              border: '1px solid var(--border2)',
            }}>
              {entity.sector}
            </span>
          )}
          {entity.country && (
            <span style={{
              fontFamily: 'var(--fm)', fontSize: 9, color: 'var(--text3)',
            }}>
              {entity.country}
            </span>
          )}
          <span style={{
            fontFamily: 'var(--fm)', fontSize: 9, color: 'var(--text3)',
          }}>
            Added {new Date(entity.addedAt).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric',
            })}
          </span>
        </div>
      </Link>

      <button
        onClick={() => onRemove(entity.slug)}
        title="Remove from watchlist"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          borderRadius: 8,
          border: '1px solid var(--border2)',
          background: 'transparent',
          color: 'var(--text3)',
          cursor: 'pointer',
          transition: 'all 0.18s ease',
          flexShrink: 0,
        }}
      >
        <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div style={{
      ...GLASS_CARD,
      textAlign: 'center',
      padding: '48px 24px',
    }}>
      <svg
        viewBox="0 0 24 24"
        width={32}
        height={32}
        fill="none"
        stroke="var(--text3)"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ marginBottom: 16, opacity: 0.5 }}
      >
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
      <p style={{
        fontFamily: 'var(--fd)', fontSize: 18, fontStyle: 'italic',
        color: 'var(--text2)', marginBottom: 8,
      }}>
        No watched entities yet
      </p>
      <p style={{
        fontSize: 13, color: 'var(--text3)', lineHeight: 1.7, maxWidth: 380, margin: '0 auto 20px',
      }}>
        Save entities from their dossier pages to build your personal intelligence view.
      </p>
      <Link
        href="/intelligence"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '8px 16px', borderRadius: 10,
          border: '1px solid var(--border2)', background: 'var(--glass2)',
          textDecoration: 'none', fontFamily: 'var(--fm)',
          fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'var(--text2)', transition: 'border-color 0.18s',
        }}
      >
        Browse Intelligence Feed
      </Link>
    </div>
  );
}
