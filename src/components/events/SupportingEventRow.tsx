import type { AiEvent } from '@/data/mockEvents';

// ─────────────────────────────────────────────────────────────────────────────
// Style constants
// ─────────────────────────────────────────────────────────────────────────────

const ROW: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '14px 16px',
  borderRadius: 'var(--rs)',
  border: '1px solid var(--border)',
  background: 'var(--glass)',
  transition: 'border-color var(--t) var(--ease)',
};

const ROW_HOVER: React.CSSProperties = {
  ...ROW,
  cursor: 'pointer',
};

const TITLE: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--text2)',
  lineHeight: 1.5,
};

const META_ROW: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
};

const TYPE_TAG: React.CSSProperties = {
  fontFamily: 'var(--fm)',
  fontSize: 8,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  padding: '2px 7px',
  borderRadius: 8,
  border: '1px solid var(--border2)',
  color: 'var(--text3)',
};

const META_TEXT: React.CSSProperties = {
  fontFamily: 'var(--fm)',
  fontSize: 9,
  color: 'var(--text3)',
};

const AMOUNT: React.CSSProperties = {
  fontFamily: 'var(--fm)',
  fontSize: 9,
  color: 'var(--amber-l)',
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface SupportingEventRowProps {
  event: AiEvent;
  /** Optional source URL — when present the row becomes a link. */
  sourceUrl?: string;
}

export function SupportingEventRow({ event, sourceUrl }: SupportingEventRowProps) {
  const content = (
    <>
      <span style={TITLE}>{event.title}</span>
      <div style={META_ROW}>
        <span style={TYPE_TAG}>{event.type}</span>
        <span style={META_TEXT}>{formatDate(event.date)}</span>
        {event.entityName && (
          <span style={META_TEXT}>{event.entityName}</span>
        )}
        {event.amount && (
          <span style={AMOUNT}>{event.amount}</span>
        )}
      </div>
    </>
  );

  if (sourceUrl) {
    return (
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{ ...ROW_HOVER, textDecoration: 'none' }}
      >
        {content}
      </a>
    );
  }

  return <div style={ROW}>{content}</div>;
}
