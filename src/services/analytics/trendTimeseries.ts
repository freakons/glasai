import { dbQuery as sql } from "@/db/client"

export async function recordTrendSnapshot(topic: string, count: number) {
  await sql`
    INSERT INTO trend_timeseries(topic, signal_count)
    VALUES (${topic}, ${count})
  `
}

export async function getTrendHistory(topic: string) {
  const rows = await sql`
    SELECT signal_count, recorded_at
    FROM trend_timeseries
    WHERE topic = ${topic}
    ORDER BY recorded_at ASC
  `
  return rows
}
