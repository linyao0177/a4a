import type { WebSocket } from "@fastify/websocket";
import type { Run } from "@arkreen/a4a-sdk";

export type WsEventType =
  | "state:change"
  | "run:completed"
  | "run:failed"
  | "alert"
  | "assets:update";

export interface WsEvent {
  type: WsEventType;
  payload: unknown;
}

const clients = new Set<WebSocket>();

export function addClient(ws: WebSocket): void {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));
}

export function broadcast(type: WsEventType, payload: unknown): void {
  const msg = JSON.stringify({ type, payload }, bigIntReplacer);
  for (const ws of clients) {
    if (ws.readyState === 1 /* OPEN */) {
      ws.send(msg);
    }
  }
}

export function clientCount(): number {
  return clients.size;
}

// ── BigInt JSON replacer ───────────────────────────────────────────────────────

function bigIntReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

// ── Typed broadcast helpers ────────────────────────────────────────────────────

export function broadcastStateChange(run: Run, prev: string, step: unknown): void {
  broadcast("state:change", { runId: run.id, prev, next: run.state, step });
}

export function broadcastRunCompleted(run: Run): void {
  broadcast("run:completed", { run });
}

export function broadcastRunFailed(run: Run, error: string): void {
  broadcast("run:failed", { run, error });
}

export function broadcastAlert(level: string, message: string): void {
  broadcast("alert", { level, message, ts: Date.now() });
}

export function broadcastAssetsUpdate(assets: unknown): void {
  broadcast("assets:update", assets);
}
