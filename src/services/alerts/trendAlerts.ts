export function detectMajorTrends(trends: any[]) {
  return trends.filter(t => {
    const strongVelocity = t.velocity > 5
    const highScore = t.score > 20
    const diverseSources =
      new Set(t.sources).size >= 3
    return strongVelocity && highScore && diverseSources
  })
}

export function formatAlert(trend: any) {
  return `
🚨 Emerging Trend Detected
Topic: ${trend.topic}
Score: ${trend.score}
Velocity: ${trend.velocity}
Sources:
${trend.sources.join(", ")}
Summary:
${trend.summary}
`
}
