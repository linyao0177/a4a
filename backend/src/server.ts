import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocketPlugin from "@fastify/websocket";
import { addClient } from "./ws.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { runnerRoutes } from "./routes/runner.js";
import { assetsRoutes } from "./routes/assets.js";
import { getDb } from "./db.js";

// Warm-up DB
getDb();

const fastify = Fastify({
  logger: { transport: { target: "pino-pretty" } },
  // Custom serializer handles BigInt → string
  serializerOpts: {},
});

// ── BigInt-safe JSON serializer ────────────────────────────────────────────────
fastify.addHook("onSend", async (_req, _reply, payload) => {
  if (typeof payload === "string") {
    // Re-stringify with BigInt support
    try {
      const parsed = JSON.parse(payload);
      return JSON.stringify(parsed, (_k, v) =>
        typeof v === "bigint" ? v.toString() : v
      );
    } catch {
      return payload;
    }
  }
  return payload;
});

// ── Plugins ────────────────────────────────────────────────────────────────────
await fastify.register(cors, {
  origin: process.env.FRONTEND_URL ?? "http://localhost:3000",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
});

await fastify.register(websocketPlugin);

// ── WebSocket endpoint ─────────────────────────────────────────────────────────
fastify.register(async function wsRoutes(f) {
  f.get("/ws", { websocket: true }, (socket, _req) => {
    addClient(socket);
    socket.send(JSON.stringify({ type: "connected", payload: { ts: Date.now() } }));
  });
});

// ── REST routes ────────────────────────────────────────────────────────────────
await fastify.register(dashboardRoutes);
await fastify.register(runnerRoutes);
await fastify.register(assetsRoutes);

// ── Start ──────────────────────────────────────────────────────────────────────
const port = parseInt(process.env.PORT ?? "3001", 10);

try {
  await fastify.listen({ port, host: "0.0.0.0" });
  console.log(`\n🚀 A4A backend listening on http://localhost:${port}\n`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
