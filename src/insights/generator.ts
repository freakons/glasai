import { TrendResult } from '@/trends/types';
import { Insight } from './types';
import { generateAIInsight } from './aiGenerator';
import { generateTrendInsight } from '@/services/intelligence/insightSummaries';
import { scoreOpportunity } from '@/services/intelligence/opportunityScoring';

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

export async function generateInsights(trends: TrendResult[]): Promise<Insight[]> {
  const qualifying = trends.filter((t) => t.signal_count >= MIN_SIGNAL_COUNT);

  const insights = await Promise.all(
    qualifying.map(async (trend): Promise<Insight> => {
      const ruleBasedSummary = `Multiple signals indicate ${trend.topic} activity across ${categoryLabel(trend.category)} with ${trend.signal_count} mentions in the last analysis window.`;

      let summary = ruleBasedSummary;
      try {
        trend.summary = await generateTrendInsight(trend);
        summary = trend.summary;
      } catch (err) {
        console.warn(`[insights/generator] AI insight failed for "${trend.topic}", using rule-based summary:`, err);
        try {
          summary = await generateAIInsight(trend);
        } catch (fallbackErr) {
          console.warn(`[insights/generator] fallback AI insight also failed for "${trend.topic}":`, fallbackErr);
        }
      }

      const opportunity: any = {
        title:      `${trend.topic} dominating ${categoryLabel(trend.category)}`,
        summary,
        category:   trend.category,
        topics:     [trend.topic, ...trend.entities].slice(0, 5),
        confidence: trend.confidence,
      };

      opportunity.score = scoreOpportunity({
        trendScore:      trend.score,
        velocity:        trend.velocity_score,
        marketSignals:   trend.signal_count || 1,
        sourceDiversity: new Set(trend.entities).size,
      });

      return opportunity;
    }),
  );

  return insights.sort((a, b) => b.confidence - a.confidence);
}
