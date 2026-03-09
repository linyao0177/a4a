/**
 * A4A SDK — usage example
 *
 * Run with:
 *   npx ts-node src/example.ts
 */
import { A4ARunner } from "./runner.js";

const RPC_URL     = process.env.POLYGON_RPC  ?? "https://polygon-rpc.com";
const PRIVATE_KEY = process.env.AGENT_PK     ?? "";

if (!PRIVATE_KEY) throw new Error("Set AGENT_PK env var");

async function main() {
  const runner = new A4ARunner(PRIVATE_KEY, RPC_URL, {
    strategy:            "dca",
    minKwhThreshold:     100,
    maxSlippageBps:      150,
    maxKwhPerRun:        200,
    minAkreReserve:      BigInt("50000000000000000000"), // 50 AKRE
    maxConsecutiveFailures: 3,
    domainIds:           [2, 3, 11, 12],
  });

  // ── Wire up events ───────────────────────────────────────────────────────
  runner.on("state:change", (run, prev) => {
    console.log(`[${run.id}] ${prev} → ${run.state}`);
  });

  runner.on("alert", (level, msg) => {
    const prefix = { info: "ℹ", warn: "⚠", error: "✕" }[level];
    console.log(`${prefix} ${msg}`);
  });

  runner.on("run:completed", (run) => {
    console.log(`\n✅ Run complete — ${run.offsetKwh} kWh offset in ${((run.completedAt! - run.startedAt) / 3600000).toFixed(1)}h`);
  });

  runner.on("run:failed", (run, err) => {
    console.error(`\n❌ Run failed at ${run.state}: ${err.message}`);
  });

  runner.on("run:paused", (_, reason) => {
    console.error(`\n⏸ Runner paused: ${reason}`);
  });

  // ── Execute once ─────────────────────────────────────────────────────────
  console.log(`Agent wallet: ${runner.walletAddress}`);
  console.log("Starting pipeline run...\n");

  const run = await runner.execute();
  console.log("\nFinal run state:", JSON.stringify(run, null, 2));
  // Destroy provider to stop background polling
  await (runner as any).signer.provider.destroy();
  process.exit(0);
}

main().catch(console.error);
