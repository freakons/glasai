import type { Article } from '@/lib/data/news';
import { Badge } from '@/components/ui/Badge';

interface NewsCardProps {
  article: Article;
}

export function NewsCard({ article }: NewsCardProps) {
  return (
    <div className="nc">
      <div className="nc-top">
        <Badge category={article.cat} />
        {article.verified && (
          <span className="verified">
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--emerald-l)', display: 'inline-block' }} />
            Verified
          </span>
        )}
      </div>
      <div className="nc-title">{article.title}</div>
      <div className="nc-body">{article.body}</div>
      <div className="nc-foot">
        <span className="nc-src">
          <span style={{ width: 3.5, height: 3.5, borderRadius: '50%', background: 'var(--indigo-l)', display: 'inline-block' }} />
          {article.source}
        </span>
        <span>{article.date}</span>
      </div>
    </div>
  );
}
