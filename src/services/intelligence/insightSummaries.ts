export async function generateTrendInsight(trend: any) {
  if (!process.env.OPENAI_API_KEY) {
    return `Trend activity detected for ${trend.topic}.`
  }
  const prompt = `
Summarize the following trend activity in 2 sentences.
Topic: ${trend.topic}
Score: ${trend.score}
Velocity: ${trend.velocity}
Sources: ${trend.sources?.join(", ")}
Explain why this trend may matter.
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
          { role: "system", content: "You are a technology analyst." },
          { role: "user", content: prompt }
        ]
      })
    }
  )
  const data = await res.json()
  return data.choices[0].message.content
}
