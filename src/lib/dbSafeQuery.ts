export async function safeQuery<T>(queryFn: () => Promise<T>): Promise<T> {
  try {
    return await queryFn()
  } catch (error) {
    console.error("Database query failed:", error)
    throw new Error("database_unavailable")
  }
}
