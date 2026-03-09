import { TrendResult } from '@/trends/types';
import { Insight } from './types';

const MIN_SIGNAL_COUNT = 3;

const CATEGORY_LABELS: Record<string, string> = {
  ai_model_release: 'AI model releases',
  funding:          'funding activity',
  tool_launch:      'tool launches',
  ai_startup:       'AI startup activity',
  research:         'research activity',
  other:            'intelligence signals',
};

function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category.replace(/_/g, ' ');
}

export function generateInsights(trends: TrendResult[]): Insight[] {
  return trends
    .filter((t) => t.signal_count >= MIN_SIGNAL_COUNT)
    .map((trend): Insight => ({
      title:      `${trend.topic} dominating ${categoryLabel(trend.category)}`,
      summary:    `Multiple signals indicate ${trend.topic} activity across ${categoryLabel(trend.category)} with ${trend.signal_count} mentions in the last analysis window.`,
      category:   trend.category,
      topics:     [trend.topic, ...trend.entities].slice(0, 5),
      confidence: trend.confidence,
    }))
    .sort((a, b) => b.confidence - a.confidence);
}
