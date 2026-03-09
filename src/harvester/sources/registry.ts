import { SourceAdapter } from './sourceAdapter';
import { RssSource } from './rssSource';

const RSS_FEEDS: string[] = [
  'https://news.ycombinator.com/rss',
  'https://www.theverge.com/rss/ai',
  'https://techcrunch.com/tag/artificial-intelligence/feed/',
  'https://venturebeat.com/category/ai/feed/',
];

export function getSources(): SourceAdapter[] {
  return RSS_FEEDS.map((url) => new RssSource(url));
}
