import { logger } from "./logger/logger.js";
import { AsyncLocalStorage } from "node:async_hooks";
import type { ClientMessage } from "./types/index.js";
import { WebSocket } from "ws";

export const requestContext = new AsyncLocalStorage<Pick<ClientMessage, "requestId">>();

const log = logger.child("core", "webSocket");

const clients = new Set<WebSocket>();

export function addClient(client: WebSocket): void {
  clients.add(client);
  log.debug("Client connected", { clients: clients.size });
}

export function removeClient(client: WebSocket): void {
  clients.delete(client);
  log.debug("Client disconnected", { clients: clients.size });
}

export function sendJson(client: WebSocket, payload: unknown): void {
  if (client.readyState === WebSocket.OPEN) {
    const requestId = requestContext.getStore()?.requestId;
    if (requestId !== undefined && typeof payload === "object" && payload !== null && "type" in payload && (payload.type === "ack" || payload.type === "error")) {
      payload = { ...payload, requestId };
    }
    log.trace("> Client message", () => ({ payload: JSON.stringify(payload, (key, value) => (/password|token|secret|authorization|^code$/i.test(key) ? "[redacted]" : value)) }));
    client.send(JSON.stringify(payload));
  } else {
    log.trace("Skipped send to closed client", { state: client.readyState });
  }
}

export function broadcast(payload: unknown): void {
  log.trace("Broadcasting", { clients: clients.size });
  for (const client of clients) {
    sendJson(client, payload);
  }
}

export function clientCount(): number {
  return clients.size;
}
