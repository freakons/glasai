function fallbackTopics(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .split(' ');

  const counts: Record<string, number> = {};
  for (const w of words) {
    if (w.length < 4) continue;
    counts[w] = (counts[w] || 0) + 1;
  }

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map((e) => e[0]);
}

export async function extractTopics(text: string): Promise<string[]> {
  if (!process.env.OPENAI_API_KEY) {
    return fallbackTopics(text);
  }

  const prompt = `
Extract 3-5 concise technology topics from the following content.
Return them as a JSON array of short phrases.
CONTENT:
${text.slice(0, 2000)}
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
        { role: 'system', content: 'You extract technology topics.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
    }),
  });

  const data = await res.json() as {
    choices: { message: { content: string } }[];
  };

  try {
    return JSON.parse(data.choices[0].message.content) as string[];
  } catch {
    return fallbackTopics(text);
  }
}
