import { A4ARunner } from "@arkreen/a4a-sdk";
import type { Run, RunState } from "@arkreen/a4a-sdk";
import {
  upsertRun,
  insertAlert,
  addDailyKwh,
} from "./db.js";
import {
  broadcastStateChange,
  broadcastRunCompleted,
  broadcastRunFailed,
  broadcastAlert,
  broadcastAssetsUpdate,
} from "./ws.js";
import { fetchAssets } from "./routes/assets.js";

let runner: A4ARunner | null = null;

export function getRunner(): A4ARunner {
  if (!runner) {
    const pk = process.env.AGENT_PK;
    const rpc = process.env.POLYGON_RPC ?? "https://polygon-rpc.com";
    if (!pk) throw new Error("AGENT_PK not set in environment");
    runner = new A4ARunner(pk, rpc);
    attachEvents(runner);
  }
  return runner;
}

function attachEvents(r: A4ARunner): void {
  r.on("state:change", (run: Run, prev: RunState) => {
    upsertRun(run);
    const lastStep = run.steps[run.steps.length - 1];
    broadcastStateChange(run, prev, lastStep);
  });

  r.on("run:completed", (run: Run) => {
    upsertRun(run);
    if (run.offsetKwh) {
      addDailyKwh(run.offsetKwh);
    }
    broadcastRunCompleted(run);

    // Push updated balances after a completed run
    fetchAssets()
      .then(assets => broadcastAssetsUpdate(assets))
      .catch(err =>
        console.error("[ws] assets:update failed:", err instanceof Error ? err.message : err)
      );
  });

  r.on("run:failed", (run: Run, error: Error) => {
    upsertRun(run);
    broadcastRunFailed(run, error.message);
  });

  r.on("alert", (level: string, message: string) => {
    insertAlert(level, message);
    broadcastAlert(level, message);
  });
}

export async function executeRun(): Promise<Run> {
  const r = getRunner();
  return r.execute();
}

export function pauseRunner(): void {
  getRunner().pause("Manual pause via API");
}

export function resumeRunner(): void {
  getRunner().resume();
}

export function getRunnerStatus() {
  const r = getRunner();
  return r.getStatus();
}
