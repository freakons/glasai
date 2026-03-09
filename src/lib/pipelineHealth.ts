let lastRun: number | null = null
let lastIngestCount = 0

export function recordPipelineRun(count: number) {
  lastRun = Date.now()
  lastIngestCount = count
}

export function getPipelineHealth() {
  return {
    last_run: lastRun,
    signals_ingested: lastIngestCount,
    status: lastRun ? 'ok' : 'unknown'
  }
}
