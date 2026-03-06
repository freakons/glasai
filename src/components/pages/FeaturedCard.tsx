import type { Article } from '@/lib/data/news';
import { Badge } from '@/components/ui/Badge';

interface FeaturedCardProps {
  article: Article;
}

export function FeaturedCard({ article }: FeaturedCardProps) {
  return (
    <div className="featured">
      <div>
        <Badge category={article.cat} />
        <div style={{ fontFamily: 'var(--fd)', fontSize: 22, fontStyle: 'italic', letterSpacing: '-0.02em', color: 'var(--text)', lineHeight: 1.3, marginTop: 10, marginBottom: 10 }}>
          {article.title}
        </div>
        <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.75 }}>
          {article.body}
        </div>
      </div>
      {article.stats && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 140 }}>
          {article.stats.map((s, i) => (
            <div key={i} style={{
              background: 'var(--glass2)', border: '1px solid var(--border)', borderRadius: 8, padding: 11, textAlign: 'center'
            }}>
              <div style={{
                fontFamily: 'var(--fd)', fontSize: 22, fontStyle: 'italic', fontWeight: 700,
                background: 'linear-gradient(90deg, var(--indigo-l), var(--cyan-l))',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', lineHeight: 1
              }}>{s.n}</div>
              <div style={{ fontFamily: 'var(--fm)', fontSize: 9.5, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: 'var(--text3)', marginTop: 4 }}>{s.l}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
