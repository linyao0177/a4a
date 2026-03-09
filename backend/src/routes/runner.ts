import type { FastifyInstance } from "fastify";
import {
  executeRun,
  pauseRunner,
  resumeRunner,
  getRunnerStatus,
} from "../runner-service.js";

export async function runnerRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/api/runner/status", async (_req, reply) => {
    const status = getRunnerStatus();
    return reply.send(status);
  });

  fastify.post("/api/runner/execute", async (_req, reply) => {
    try {
      const run = await executeRun();
      return reply.send({ run });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(409).send({ error: msg });
    }
  });

  fastify.post("/api/runner/pause", async (_req, reply) => {
    pauseRunner();
    return reply.send({ ok: true, paused: true });
  });

  fastify.post("/api/runner/resume", async (_req, reply) => {
    resumeRunner();
    return reply.send({ ok: true, paused: false });
  });
}
