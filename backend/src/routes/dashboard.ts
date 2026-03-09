import type { FastifyInstance } from "fastify";
import { getRuns, getTodayKwh, getTotalKwh, getStreak } from "../db.js";
import { getRunnerStatus } from "../runner-service.js";

export async function dashboardRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/api/health", async (_req, reply) => {
    return reply.send({ ok: true, ts: Date.now() });
  });

  fastify.get("/api/dashboard", async (_req, reply) => {
    const status = getRunnerStatus();
    const todayKwh = getTodayKwh();
    const totalKwh = getTotalKwh();
    const streak = getStreak();

    return reply.send({
      total_kwh: totalKwh,
      today_kwh: todayKwh,
      streak,
      current_run: status.currentRun,
      paused: status.paused,
      consecutive_failures: status.consecutiveFailures,
    });
  });

  fastify.get<{ Querystring: { limit?: string } }>("/api/runs", async (req, reply) => {
    const limit = Math.min(parseInt(req.query.limit ?? "20", 10), 100);
    const runs = getRuns(limit);
    return reply.send({ runs });
  });

  fastify.get("/api/alliance", async (_req, reply) => {
    // Placeholder leaderboard — can be replaced with real data later
    return reply.send({
      leaderboard: [
        { rank: 1, wallet: "0xABC...123", total_kwh: 1200, streak: 14 },
        { rank: 2, wallet: "0xDEF...456", total_kwh: 980,  streak: 7  },
        { rank: 3, wallet: "0x123...789", total_kwh: 540,  streak: 3  },
      ],
    });
  });
}
