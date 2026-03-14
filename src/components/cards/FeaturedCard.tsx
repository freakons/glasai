import Link from 'next/link';
import type { Article } from '@/lib/data/news';
import { Badge } from '@/components/ui/Badge';

interface FeaturedCardProps {
  article: Article;
}

export function FeaturedCard({ article }: FeaturedCardProps) {
  // Link to source URL if available, otherwise to signals page
  const href = article.sourceUrl || '/signals';

  return (
    <Link
      href={href}
      className="featured-link"
      {...(article.sourceUrl ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      <div className="featured">
        <div className="featured-content">
          <Badge category={article.cat} />
          <h2 className="featured-title">{article.title}</h2>
          <p className="featured-body">{article.body}</p>
        </div>
        {article.stats && (
          <div className="featured-stats">
            {article.stats.map((s, i) => (
              <div key={i} className="featured-stat">
                <div className="featured-stat-value">{s.n}</div>
                <div className="featured-stat-label">{s.l}</div>
              </div>
            ))}
          </div>
        )}
        <span className="featured-open-hint">Read more</span>
      </div>
    </Link>
  );
}
