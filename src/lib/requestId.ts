export function createRequestId() {
  return crypto.randomUUID()
}
export function logWithRequestId(
  id: string,
  scope: string,
  message: string
) {
  console.log(`[${scope}] id=${id} ${message}`)
}
