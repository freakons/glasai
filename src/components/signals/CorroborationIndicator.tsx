import type { SourceArticle } from '@/db/queries';

// ─────────────────────────────────────────────────────────────────────────────
// Corroboration types
// ─────────────────────────────────────────────────────────────────────────────

export type StrengthLabel = 'Strong' | 'Moderate' | 'Weak';

export interface CorroborationData {
  sourceCount: number;
  eventCount: number;
  articleCount: number;
  independentSourceCount: number;
  confidenceScore: number;
  strengthLabel: StrengthLabel;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoring logic
// ─────────────────────────────────────────────────────────────────────────────

export function computeCorroboration(opts: {
  sourceSupportCount: number | null | undefined;
  supportingEventsCount: number;
  articles: SourceArticle[];
  confidenceScore: number;
}): CorroborationData {
  const sourceCount = opts.sourceSupportCount ?? 0;
  const eventCount = opts.supportingEventsCount;
  const articleCount = opts.articles.length;
  const independentSourceCount = new Set(
    opts.articles.map((a) => a.sourceName.toLowerCase().trim()),
  ).size;
  const confidenceScore = opts.confidenceScore;

  let strengthLabel: StrengthLabel = 'Weak';
  if (sourceCount >= 4 && eventCount >= 2 && independentSourceCount >= 2) {
    strengthLabel = 'Strong';
  } else if (sourceCount >= 2 && eventCount >= 1) {
    strengthLabel = 'Moderate';
  }

  return {
    sourceCount,
    eventCount,
    articleCount,
    independentSourceCount,
    confidenceScore,
    strengthLabel,
  };
}

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

const STAT_ROW: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '6px 0',
  borderBottom: '1px solid var(--border2)',
};

const STAT_LABEL: React.CSSProperties = {
  fontFamily: 'var(--fm)', fontSize: 10, letterSpacing: '0.06em',
  textTransform: 'uppercase', color: 'var(--text3)',
};

const STAT_VALUE: React.CSSProperties = {
  fontFamily: 'var(--fm)', fontSize: 13, color: 'var(--text2)',
};

const STRENGTH_COLORS: Record<StrengthLabel, { color: string; border: string }> = {
  Strong: { color: 'var(--emerald-l)', border: 'rgba(5,150,105,0.4)' },
  Moderate: { color: 'var(--amber-l)', border: 'rgba(217,119,6,0.4)' },
  Weak: { color: 'var(--text3)', border: 'var(--border2)' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface CorroborationIndicatorProps {
  data: CorroborationData;
}

export function CorroborationIndicator({ data }: CorroborationIndicatorProps) {
  const colors = STRENGTH_COLORS[data.strengthLabel];

  const stats: { label: string; value: string | number }[] = [
    { label: 'Sources', value: data.sourceCount },
    { label: 'Events', value: data.eventCount },
    { label: 'Articles', value: data.articleCount },
    { label: 'Independent Sources', value: data.independentSourceCount },
    { label: 'Confidence', value: `${data.confidenceScore}%` },
  ];

  return (
    <div style={GLASS_CARD}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ ...SECTION_HEADER, marginBottom: 0 }}>Signal Corroboration</div>
        <span
          style={{
            fontFamily: 'var(--fm)', fontSize: 9, letterSpacing: '0.1em',
            textTransform: 'uppercase', padding: '3px 10px', borderRadius: 10,
            color: colors.color, border: `1px solid ${colors.border}`,
          }}
          title={`Corroboration: ${data.strengthLabel} — ${data.sourceCount} sources, ${data.eventCount} supporting events, ${data.independentSourceCount} independent sources.`}
        >
          {data.strengthLabel}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {stats.map((s, i) => (
          <div
            key={s.label}
            style={{
              ...STAT_ROW,
              ...(i === stats.length - 1 ? { borderBottom: 'none' } : {}),
            }}
          >
            <span style={STAT_LABEL}>{s.label}</span>
            <span style={STAT_VALUE}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
