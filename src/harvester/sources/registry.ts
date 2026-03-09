import { SourceAdapter } from './sourceAdapter';
import { RssSource } from './rssSource';
import { GitHubReleaseSource } from './githubSource';

const RSS_FEEDS: string[] = [
  'https://news.ycombinator.com/rss',
  'https://www.theverge.com/rss/ai',
  'https://techcrunch.com/tag/artificial-intelligence/feed/',
  'https://venturebeat.com/category/ai/feed/',
];

const GITHUB_REPOS: [string, string][] = [
  ['huggingface', 'transformers'],
  ['langchain-ai', 'langchain'],
  ['openai', 'openai-cookbook'],
];

export function getSources(): SourceAdapter[] {
  const rssSources = RSS_FEEDS.map((url) => new RssSource(url));
  const githubSources = GITHUB_REPOS.map(([owner, repo]) => new GitHubReleaseSource(owner, repo));
  return [...rssSources, ...githubSources];
}
