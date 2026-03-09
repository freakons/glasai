import { WebSocketServer } from "ws"

let wss: WebSocketServer | null = null

export function startOpportunitySocket(server: any) {
  if (wss) return
  wss = new WebSocketServer({ server })
  wss.on("connection", ws => {
    console.log("[ws] client connected")
    ws.send(JSON.stringify({
      type: "welcome"
    }))
  })
}

export function broadcastOpportunity(data: any) {
  if (!wss) return
  const msg = JSON.stringify(data)
  wss.clients.forEach(client => {
    client.send(msg)
  })
}
