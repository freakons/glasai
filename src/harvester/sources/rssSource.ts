import Parser from 'rss-parser';
import { RawSignal } from '../types';
import { SourceAdapter } from './sourceAdapter';
import { cleanText, cleanPlainText, canonicalizeUrl, normalizeSourceName } from '@/services/normalization/helpers';

export class RssSource implements SourceAdapter {
  name: string;
  private feedUrl: string;
  private parser: Parser;

  constructor(feedUrl: string) {
    this.feedUrl = feedUrl;
    this.parser = new Parser();
    this.name = feedUrl;
  }

  async fetchSignals(): Promise<RawSignal[]> {
    const feed = await this.parser.parseURL(this.feedUrl);
    this.name = normalizeSourceName(feed.title) || this.feedUrl;

    return (feed.items ?? []).map((item) => ({
      title: cleanPlainText(item.title) || item.title || '',
      content: cleanText(item.contentSnippet) || cleanText(item.content) || cleanText(item.summary) || '',
      url: item.link ? canonicalizeUrl(item.link) : item.link,
      source: this.name,
      published_at: item.pubDate,
    }));
  }
}
