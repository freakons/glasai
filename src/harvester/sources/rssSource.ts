import Parser from 'rss-parser';
import { RawSignal } from '../types';
import { SourceAdapter } from './sourceAdapter';

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
    this.name = feed.title ?? this.feedUrl;

    return (feed.items ?? []).map((item) => ({
      title: item.title ?? '',
      content: item.contentSnippet ?? item.content ?? item.summary ?? '',
      url: item.link,
      source: this.name,
      published_at: item.pubDate,
    }));
  }
}
