import Link from 'next/link';
import type { Signal, SignalContext } from '@/data/mockSignals';
import type { AiEvent } from '@/data/mockEvents';
import { SupportingEventRow } from '@/components/events/SupportingEventRow';
import { slugify } from '@/utils/sanitize';

// ─────────────────────────────────────────────────────────────────────────────
// Style constants
// ─────────────────────────────────────────────────────────────────────────────

const SECTION_HEADER: React.CSSProperties = {
  fontFamily: 'var(--fm)', fontSize: 9, letterSpacing: '0.12em',
  textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 16,
};

const GLASS_CARD: React.CSSProperties = {
  padding: '20px 24px', borderRadius: 'var(--r)',
  background: 'var(--glass)', border: '1px solid var(--border)',
};

const EVIDENCE_ROW: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '10px 14px', borderRadius: 8,
  border: '1px solid var(--border2)', background: 'var(--glass2)',
};

const EVIDENCE_LABEL: React.CSSProperties = {
  fontFamily: 'var(--fm)', fontSize: 9, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'var(--text3)',
  minWidth: 90,
};

const EVIDENCE_VALUE: React.CSSProperties = {
  fontSize: 13, color: 'var(--text2)', lineHeight: 1.6,
};

const MINI_BADGE: React.CSSProperties = {
  fontFamily: 'var(--fm)', fontSize: 8, letterSpacing: '0.1em',
  textTransform: 'uppercase', padding: '2px 8px', borderRadius: 10,
  display: 'inline-flex', alignItems: 'center',
};

const EMPTY_TEXT: React.CSSProperties = {
  fontSize: 13, color: 'var(--text3)', lineHeight: 1.7,
  fontStyle: 'italic',
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

/** Compute the timeframe span from signal date and supporting events. */
function computeTimeframe(signalDate: string, events: AiEvent[]): string | null {
  if (events.length === 0) return null;
  const dates = [signalDate, ...events.map((e) => e.date)]
    .map((d) => new Date(d).getTime())
    .filter((t) => !isNaN(t));
  if (dates.length < 2) return null;
  const earliest = new Date(Math.min(...dates));
  const latest = new Date(Math.max(...dates));
  const diffDays = Math.round((latest.getTime() - earliest.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 1) return '1 day';
  if (diffDays <= 7) return `${diffDays} days`;
  const weeks = Math.round(diffDays / 7);
  if (weeks <= 4) return weeks === 1 ? '1 week' : `${weeks} weeks`;
  const months = Math.round(diffDays / 30);
  return months === 1 ? '1 month' : `${months} months`;
}

/** Derive unique event types for display. */
function uniqueEventTypes(events: AiEvent[]): string[] {
  return [...new Set(events.map((e) => e.type))];
}

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface EvidencePanelProps {
  signal: Signal;
  supportingEvents: AiEvent[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function EvidencePanel({ signal, supportingEvents }: EvidencePanelProps) {
  const ctx = signal.context;
  const entityCount = ctx?.affectedEntities?.length ?? 0;
  const eventCount = supportingEvents.length;
  const sourceCount = signal.sourceSupportCount ?? 0;
  const timeframe = computeTimeframe(signal.date, supportingEvents);
  const eventTypes = uniqueEventTypes(supportingEvents);

  const hasAnyEvidence = eventCount > 0 || sourceCount > 0 || ctx?.sourceBasis || entityCount > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Evidence Summary ────────────────────────────────────────────── */}
      <div style={GLASS_CARD}>
        <div style={SECTION_HEADER}>Evidence Summary</div>

        {hasAnyEvidence ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

            {/* Why triggered */}
            {ctx?.whyItMatters && (
              <div style={EVIDENCE_ROW}>
                <span style={EVIDENCE_LABEL}>Trigger</span>
                <span style={EVIDENCE_VALUE}>{ctx.whyItMatters}</span>
              </div>
            )}

            {/* Source count */}
            {sourceCount > 0 && (
              <div style={EVIDENCE_ROW}>
                <span style={EVIDENCE_LABEL}>Sources</span>
                <span style={EVIDENCE_VALUE}>
                  {sourceCount} corroborating {sourceCount === 1 ? 'source' : 'sources'}
                </span>
              </div>
            )}

            {/* Corroborating events */}
            {eventCount > 0 && (
              <div style={EVIDENCE_ROW}>
                <span style={EVIDENCE_LABEL}>Events</span>
                <span style={EVIDENCE_VALUE}>
                  {eventCount} supporting {eventCount === 1 ? 'event' : 'events'}
                  {eventTypes.length > 0 && (
                    <span style={{ marginLeft: 8, display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
                      {eventTypes.map((t) => (
                        <span
                          key={t}
                          style={{
                            ...MINI_BADGE,
                            color: 'var(--text3)',
                            border: '1px solid var(--border2)',
                          }}
                        >
                          {t}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              </div>
            )}

            {/* Timeframe */}
            {timeframe && (
              <div style={EVIDENCE_ROW}>
                <span style={EVIDENCE_LABEL}>Timeframe</span>
                <span style={EVIDENCE_VALUE}>Evidence spans {timeframe}</span>
              </div>
            )}

            {/* Entity mentions */}
            {entityCount > 0 && (
              <div style={EVIDENCE_ROW}>
                <span style={EVIDENCE_LABEL}>Entities</span>
                <span style={{ ...EVIDENCE_VALUE, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {ctx!.affectedEntities.map((entity) => {
                    const name = typeof entity === 'string' ? entity : entity.name;
                    const role = typeof entity === 'string' ? undefined : entity.role;
                    return (
                      <Link
                        key={name}
                        href={`/entity/${slugify(name)}`}
                        style={{
                          ...MINI_BADGE,
                          color: 'var(--indigo-l)',
                          border: '1px solid rgba(79,70,229,0.3)',
                          textDecoration: 'none',
                          gap: 4,
                        }}
                        title={role ?? undefined}
                      >
                        {name}
                        {role && (
                          <span style={{ color: 'var(--text3)', fontSize: 7 }}>
                            {role}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </span>
              </div>
            )}
          </div>
        ) : (
          <p style={EMPTY_TEXT}>
            Evidence chain not yet available. This signal will be enriched as more data is processed.
          </p>
        )}
      </div>

      {/* ── Source Basis ─────────────────────────────────────────────────── */}
      {ctx?.sourceBasis && (
        <div style={GLASS_CARD}>
          <div style={SECTION_HEADER}>Source Articles</div>
          <p style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.7 }}>
            {ctx.sourceBasis}
          </p>
        </div>
      )}

      {/* ── Supporting Events ───────────────────────────────────────────── */}
      <div style={GLASS_CARD}>
        <div style={{ ...SECTION_HEADER, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Supporting Events</span>
          {eventCount > 0 && (
            <span style={{
              ...MINI_BADGE,
              color: 'var(--emerald-l)',
              border: '1px solid rgba(5,150,105,0.3)',
            }}>
              {eventCount}
            </span>
          )}
        </div>
        {eventCount > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {supportingEvents.map((evt) => (
              <SupportingEventRow key={evt.id} event={evt} />
            ))}
          </div>
        ) : (
          <p style={EMPTY_TEXT}>
            No supporting events available yet for this signal.
          </p>
        )}
      </div>

      {/* ── Signal Context Fields ───────────────────────────────────────── */}
      {ctx && (ctx.modelProvider || ctx.promptVersion) && (
        <div style={GLASS_CARD}>
          <div style={SECTION_HEADER}>Signal Context</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {ctx.modelProvider && (
              <span style={{
                ...MINI_BADGE,
                color: 'var(--text3)',
                border: '1px solid var(--border2)',
              }}>
                {ctx.modelProvider}/{ctx.modelName}
              </span>
            )}
            {ctx.promptVersion && (
              <span style={{
                ...MINI_BADGE,
                color: 'var(--text3)',
                border: '1px solid var(--border2)',
              }}>
                prompt {ctx.promptVersion}
              </span>
            )}
            {ctx.status && (
              <span style={{
                ...MINI_BADGE,
                color: ctx.status === 'ready' ? 'var(--emerald-l)' : 'var(--amber-l)',
                border: `1px solid ${ctx.status === 'ready' ? 'rgba(5,150,105,0.3)' : 'rgba(217,119,6,0.3)'}`,
              }}>
                {ctx.status}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
