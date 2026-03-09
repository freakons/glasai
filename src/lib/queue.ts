const queue: (() => Promise<void>)[] = []
let running = false

export async function enqueue(task: () => Promise<void>) {
  queue.push(task)
  if (running) return
  running = true
  while (queue.length) {
    const job = queue.shift()
    if (!job) continue
    try {
      await job()
    } catch (e) {
      console.error("[queue] job failed", e)
    }
  }
  running = false
}
