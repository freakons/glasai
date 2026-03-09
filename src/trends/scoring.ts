import { TrendSignal } from './types';

export function scoreSignal(item: TrendSignal): number {
  switch (item.source) {
    case 'github': return 5;
    case 'arxiv':  return 4;
    case 'rss':    return 2;
    default:       return 1;
  }
}
