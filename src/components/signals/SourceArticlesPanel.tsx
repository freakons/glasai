import type { SourceArticle } from '@/db/queries';

// ─────────────────────────────────────────────────────────────────────────────
// Style constants (consistent with EvidencePanel / ConfidenceBreakdown)
// ─────────────────────────────────────────────────────────────────────────────

const SECTION_HEADER: React.CSSProperties = {
  fontFamily: 'var(--fm)', fontSize: 9, letterSpacing: '0.12em',
  textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 16,
};

const GLASS_CARD: React.CSSProperties = {
  padding: '20px 24px', borderRadius: 'var(--r)',
  background: 'var(--glass)', border: '1px solid var(--border)',
};

const MINI_BADGE: React.CSSProperties = {
  fontFamily: 'var(--fm)', fontSize: 8, letterSpacing: '0.1em',
  textTransform: 'uppercase', padding: '2px 8px', borderRadius: 10,
  display: 'inline-flex', alignItems: 'center',
  color: 'var(--text3)', border: '1px solid var(--border2)',
};

const EMPTY_TEXT: React.CSSProperties = {
  fontSize: 13, color: 'var(--text3)', lineHeight: 1.7,
  fontStyle: 'italic',
};

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface SourceArticlesPanelProps {
  articles: SourceArticle[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function SourceArticlesPanel({ articles }: SourceArticlesPanelProps) {
  return (
    <div style={GLASS_CARD}>
      <div style={{ ...SECTION_HEADER, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Source Articles</span>
        {articles.length > 0 && (
          <span style={{
            ...MINI_BADGE,
            color: 'var(--emerald-l)',
            border: '1px solid rgba(5,150,105,0.3)',
          }}>
            {articles.length}
          </span>
        )}
      </div>

      {articles.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {articles.map((article) => (
            <a
              key={article.url}
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', borderRadius: 8,
                border: '1px solid var(--border2)', background: 'var(--glass2)',
                textDecoration: 'none', transition: 'border-color 0.15s',
              }}
            >
              {/* Source badge */}
              <span style={MINI_BADGE}>
                {article.sourceName}
              </span>

              {/* Title */}
              <span style={{
                fontSize: 13, color: 'var(--text2)', lineHeight: 1.5,
                flex: 1, minWidth: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {article.title}
              </span>

              {/* Date */}
              <span style={{
                fontFamily: 'var(--fm)', fontSize: 9, color: 'var(--text3)',
                whiteSpace: 'nowrap',
              }}>
                {article.publishedAt}
              </span>

              {/* External link icon (↗) */}
              <span style={{
                fontSize: 12, color: 'var(--text3)', lineHeight: 1,
                flexShrink: 0,
              }}>
                ↗
              </span>
            </a>
          ))}
        </div>
      ) : (
        <p style={EMPTY_TEXT}>
          No source articles available for this signal yet.
        </p>
      )}
    </div>
  );
}
