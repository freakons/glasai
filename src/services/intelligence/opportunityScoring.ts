export function scoreOpportunity(opportunity: any) {
  const score =
    opportunity.trendScore * 0.4 +
    opportunity.velocity * 0.3 +
    opportunity.marketSignals * 0.2 +
    opportunity.sourceDiversity * 0.1
  return Math.round(score)
}
