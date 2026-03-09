import { Insight } from './types';

export async function generateNewsletter(insights: Insight[]): Promise<string> {
  const top = insights
    .slice()
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 8);

  const topics = top
    .map((i) => `• ${i.title}: ${i.summary}`)
    .join('\n');

  if (!process.env.OPENAI_API_KEY) {
    return `\nAI Trend Report\n${topics}\n`;
  }

  const prompt = `
Write a concise technology trend newsletter based on these insights.
${topics}
Structure:
Title
Short intro
Bullet list of trends
Closing summary
`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You write technology newsletters.' },
        { role: 'user', content: prompt },
      ],
    }),
  });

  const data = await res.json() as {
    choices: { message: { content: string } }[];
  };

  return data.choices[0].message.content;
}
