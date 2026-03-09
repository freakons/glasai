export async function generateTrendReport(trends: any[]) {
  const top = trends
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
  const content = top.map(t => `
Trend: ${t.topic}
Score: ${t.score}
Velocity: ${t.velocity}
Summary:
${t.summary}
`).join("\n")
  if (!process.env.OPENAI_API_KEY) {
    return `
AI Market Intelligence Report
${content}
`
  }
  const prompt = `
Create a professional market intelligence report
based on these technology trends.
${content}
Structure:
Executive summary
Key trends
Market implications
Opportunities
`
  const res = await fetch(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You write investor intelligence reports." },
          { role: "user", content: prompt }
        ]
      })
    }
  )
  const data = await res.json()
  return data.choices[0].message.content
}
