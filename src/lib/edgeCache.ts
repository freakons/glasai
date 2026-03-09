import { kv } from "@vercel/kv"

export async function getEdgeSignals() {
  try {
    return await kv.get("signals")
  } catch (err) {
    console.warn('[edgeCache] getEdgeSignals failed (KV likely not configured):', err)
    return null
  }
}

export async function setEdgeSignals(signals: any) {
  try {
    await kv.set("signals", signals, { ex: 5 })
  } catch (err) {
    console.warn('[edgeCache] setEdgeSignals failed (KV likely not configured):', err)
  }
}
