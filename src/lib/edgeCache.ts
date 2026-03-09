import { kv } from "@vercel/kv"

export async function getEdgeSignals() {
  return kv.get("signals")
}

export async function setEdgeSignals(signals: any) {
  await kv.set("signals", signals, { ex: 5 })
}
