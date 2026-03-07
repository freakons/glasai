import Link from 'next/link';
import { Card } from './Card';
import { Badge } from './Badge';
import { StatusIndicator } from './StatusIndicator';
import type { SignalType } from '@/types/intelligence';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Intelligence signal data required to render a SignalCard */
export interface SignalCardData {
  /** Unique signal identifier — used to build the /signals/{id} route */
  id: string;
  /** Short headline summarising the signal */
  title: string;
  /** Plain-language explanation of the signal and its implications */
  summary: string;
  /** Pattern type detected by the signals engine, e.g. "MODEL_RELEASE_WAVE" */
  type: SignalType | string;
  /** Confidence score 0.0 – 1.0 */
  confidence: number;
  /** ISO 8601 timestamp when the signal was first generated */
  createdAt: string;
  /** Number of events that support this signal */
  relatedEventsCount: number;
  /** Key companies / organisations mentioned in or affected by the signal */
  keyEntities: string[];
}

export interface SignalCardProps {
  signal: SignalCardData;
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

type BadgeCategory = 'signals' | 'models' | 'funding' | 'regulation' | 'alerts' | 'agents' | 'research' | 'product';

/** Map a SignalType string to the closest Badge category */
function signalTypeToBadgeCategory(type: string): BadgeCategory {
  const t = type.toUpperCase();
  if (t.includes('MODEL')) return 'models';
  if (t.includes('CAPITAL') || t.includes('FUNDING')) return 'funding';
  if (t.includes('REGUL') || t.includes('POLICY')) return 'regulation';
  if (t.includes('RESEARCH')) return 'research';
  if (t.includes('ALERT')) return 'alerts';
  return 'signals';
}

/** Human-readable label for a SignalType string */
function signalTypeLabel(type: string): string {
  return type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Map confidence score to StatusIndicator state.
 *  ≥ 0.80 → live    (emerald, pulsing)
 *  ≥ 0.60 → pending (amber, static)
 *  < 0.60 → inactive (muted, static)
 */
function confidenceToStatus(confidence: number): 'live' | 'pending' | 'inactive' {
  if (confidence >= 0.8) return 'live';
  if (confidence >= 0.6) return 'pending';
  return 'inactive';
}

/**
 * CSS custom property value for the top-edge gradient accent.
 * Matches the signal category colour palette from the design system.
 */
function signalTypeToGradient(type: string): string {
  const t = type.toUpperCase();
  if (t.includes('MODEL')) return 'linear-gradient(90deg, var(--violet), var(--indigo-l))';
  if (t.includes('CAPITAL') || t.includes('FUNDING')) return 'linear-gradient(90deg, var(--amber), var(--amber-l))';
  if (t.includes('REGUL') || t.includes('POLICY')) return 'linear-gradient(90deg, var(--rose), var(--amber-l))';
  if (t.includes('RESEARCH')) return 'linear-gradient(90deg, var(--sky), var(--cyan-l))';
  if (t.includes('ALERT')) return 'linear-gradient(90deg, var(--rose), var(--rose-l))';
  // Default: signals / expansion — cyan → indigo
  return 'linear-gradient(90deg, var(--indigo), var(--cyan))';
}

/** Format a confidence score as a percentage string, e.g. 0.86 → "86%" */
function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

/** Format an ISO date string to a compact display value, e.g. "Mar 7, 2026" */
function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SignalCard — displays a single intelligence signal detected by the backend.
 *
 * Renders inside the `.nc` card surface with:
 * - A coloured top-edge accent that reflects the signal type
 * - A Badge for the signal type category
 * - A StatusIndicator dot scaled to the confidence score
 * - Title, summary, key entities, event count, and confidence percentage
 *
 * Clicking anywhere on the card navigates to `/signals/{id}`.
 * Suitable for use inside a grid / list.
 */
export function SignalCard({ signal, className = '' }: SignalCardProps) {
  const {
    id,
    title,
    summary,
    type,
    confidence,
    createdAt,
    relatedEventsCount,
    keyEntities,
  } = signal;

  const badgeCategory = signalTypeToBadgeCategory(type);
  const typeLabel = signalTypeLabel(type);
  const gradient = signalTypeToGradient(type);
  const status = confidenceToStatus(confidence);

  return (
    <Link
      href={`/signals/${id}`}
      style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
    >
      <Card
        variant="default"
        className={className}
        style={{ '--cc': gradient } as React.CSSProperties}
      >
        {/* ── Top row: badge + confidence indicator ─────────────────────── */}
        <div className="nc-top">
          <Badge category={badgeCategory} label={typeLabel} />
          <StatusIndicator state={status} />
        </div>

        {/* ── Title ─────────────────────────────────────────────────────── */}
        <div className="nc-title">{title}</div>

        {/* ── Summary ───────────────────────────────────────────────────── */}
        <div className="nc-body">{summary}</div>

        {/* ── Key entities ──────────────────────────────────────────────── */}
        {keyEntities.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px',
              marginBottom: '14px',
            }}
          >
            {keyEntities.map((entity, i) => (
              <span
                key={entity}
                style={{
                  fontFamily: 'var(--fm)',
                  fontSize: '10.5px',
                  color: 'var(--text2)',
                }}
              >
                {entity}
                {i < keyEntities.length - 1 && (
                  <span
                    style={{
                      marginLeft: '6px',
                      opacity: 0.4,
                    }}
                  >
                    •
                  </span>
                )}
              </span>
            ))}
          </div>
        )}

        {/* ── Footer: events count · confidence · date ──────────────────── */}
        <div className="nc-foot">
          <span className="nc-src">
            <span
              style={{
                width: 3.5,
                height: 3.5,
                borderRadius: '50%',
                background: 'var(--indigo-l)',
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            Events:&nbsp;{relatedEventsCount}
          </span>

          <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <StatusIndicator state={status} />
              <span>{formatConfidence(confidence)}</span>
            </span>
            <span>{formatDate(createdAt)}</span>
          </span>
        </div>
      </Card>
    </Link>
  );
}
