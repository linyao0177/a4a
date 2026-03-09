import { ethers } from "ethers";
import EventEmitter from "eventemitter3";
import {
  mintARECRequest,
  waitForCertification,
  liquidizeREC,
  convertToKWh,
  makeGreenBox,
} from "./pipeline.js";
import { DECIMALS, KWH_PER_BOX_STEP, ADDR, ERC20_ABI } from "./constants.js";
import { DEFAULT_STRATEGY } from "./types.js";
import type { Run, RunState, RunStep, RunnerEvents, StrategyConfig } from "./types.js";

// Simple unique ID without nanoid dependency
const uid = () => `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export class A4ARunner extends EventEmitter<RunnerEvents> {
  private signer: ethers.Wallet;
  private config: StrategyConfig;
  private consecutiveFailures = 0;
  private paused = false;
  private currentRun: Run | null = null;

  constructor(
    privateKey: string,
    rpcUrl: string,
    config: Partial<StrategyConfig> = {}
  ) {
    super();
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    this.signer = new ethers.Wallet(privateKey, provider);
    this.config = { ...DEFAULT_STRATEGY, ...config };
  }

  get walletAddress(): string {
    return this.signer.address;
  }

  // ── State machine helpers ──────────────────────────────────────────────────

  private setState(run: Run, next: RunState, data?: Partial<RunStep>): void {
    const prev = run.state;
    run.state = next;
    const step: RunStep = { state: next, timestamp: Date.now(), ...data };
    run.steps.push(step);
    this.emit("state:change", run, prev);
  }

  private makeRun(): Run {
    return {
      id: uid(),
      agentWallet: this.signer.address,
      strategy: this.config.strategy,
      state: "CREATED",
      steps: [{ state: "CREATED", timestamp: Date.now() }],
      startedAt: Date.now(),
      consecutiveFailures: this.consecutiveFailures,
    };
  }

  // ── Pre-flight checks ──────────────────────────────────────────────────────

  private async checkBalances(): Promise<{ ok: boolean; reason?: string }> {
    const akre = new ethers.Contract(ADDR.AKRE, ERC20_ABI, this.signer.provider);
    const [akreBal, maticBal]: [bigint, bigint] = await Promise.all([
      akre.balanceOf(this.signer.address),
      this.signer.provider!.getBalance(this.signer.address),
    ]);

    if (akreBal < this.config.minAkreReserve) {
      this.emit("alert", "warn", `AKRE low: ${ethers.formatUnits(akreBal, DECIMALS.AKRE)} (min ${ethers.formatUnits(this.config.minAkreReserve, DECIMALS.AKRE)})`);
      return { ok: false, reason: "AKRE_INSUFFICIENT" };
    }
    if (maticBal < ethers.parseEther("0.05")) {
      this.emit("alert", "warn", `MATIC low: ${ethers.formatEther(maticBal)}`);
      return { ok: false, reason: "GAS_INSUFFICIENT" };
    }
    return { ok: true };
  }

  // ── Core pipeline execution ────────────────────────────────────────────────

  async execute(): Promise<Run> {
    if (this.paused) throw new Error("Runner is paused");
    if (this.currentRun && !["COMPLETED", "FAILED"].includes(this.currentRun.state)) {
      throw new Error(`Run ${this.currentRun.id} already in progress`);
    }

    const run = this.makeRun();
    this.currentRun = run;

    try {
      // Pre-flight
      const { ok, reason } = await this.checkBalances();
      if (!ok) {
        this.setState(run, "WAITING_INPUT", { data: { reason } });
        return run;
      }

      // ── Step 1: Mint AREC ────────────────────────────────────────────────
      this.setState(run, "MINT_REQUESTED");
      this.emit("alert", "info", `[${run.id}] Submitting mintRECRequest...`);
      const { tokenId, txHash: mintTx } = await mintARECRequest(this.signer);
      run.tokenId = tokenId;
      this.setState(run, "PENDING_CERTIFICATION", { txHash: mintTx, data: { tokenId } });
      this.emit("alert", "info", `[${run.id}] tokenId=${tokenId} pending certification`);

      // ── Step 2: Wait for Issuer certification ────────────────────────────
      const pollMs = this.config.strategy === "max" ? 30_000 : 60_000;
      await waitForCertification(this.signer.provider!, tokenId, {
        pollIntervalMs: pollMs,
        timeoutMs: 28 * 3600 * 1000, // 28h max
      });
      this.setState(run, "CERTIFIED", { data: { tokenId } });
      this.emit("alert", "info", `[${run.id}] tokenId=${tokenId} CERTIFIED`);

      // ── Step 3: Liquidize AREC → ART ────────────────────────────────────
      const { artReceived, txHash: liqTx } = await liquidizeREC(this.signer, tokenId);
      this.setState(run, "LIQUIDIZED", {
        txHash: liqTx,
        data: { artReceived: ethers.formatUnits(artReceived, DECIMALS.ART) },
      });
      this.emit("alert", "info", `[${run.id}] Liquidized → ${ethers.formatUnits(artReceived, DECIMALS.ART)} ART`);

      // ── Step 4: Convert ART → kWh ────────────────────────────────────────
      const { kwhReceived, txHash: convTx } = await convertToKWh(this.signer, artReceived);
      this.setState(run, "KWH_CONVERTED", {
        txHash: convTx,
        data: { kwhReceived: ethers.formatUnits(kwhReceived, DECIMALS.KWH) },
      });
      this.emit("alert", "info", `[${run.id}] Converted → ${ethers.formatUnits(kwhReceived, DECIMALS.KWH)} kWh`);

      // ── Step 5: Offset via GreenBTC ──────────────────────────────────────
      if (kwhReceived < KWH_PER_BOX_STEP) {
        this.setState(run, "WAITING_INPUT", { data: { reason: "KWH_BELOW_BOX_STEP" } });
        this.emit("alert", "warn", `[${run.id}] kWh below 1 box step — will offset on next run`);
        return run;
      }

      this.setState(run, "OFFSET_SUBMITTED");
      const { kwhBurned, boxSteps, txHash: greenTx } = await makeGreenBox(
        this.signer,
        this.config,
        kwhReceived
      );
      const offsetKwh = Number(ethers.formatUnits(kwhBurned, DECIMALS.KWH));
      run.offsetKwh = offsetKwh;
      run.completedAt = Date.now();
      this.setState(run, "COMPLETED", {
        txHash: greenTx,
        data: { kwhBurned: offsetKwh, boxSteps: Number(boxSteps) },
      });

      this.consecutiveFailures = 0;
      this.emit("run:completed", run);
      this.emit("alert", "info", `[${run.id}] ✓ COMPLETED — ${offsetKwh} kWh offset (${boxSteps} blocks)`);

    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.consecutiveFailures++;
      run.completedAt = Date.now();
      this.setState(run, "FAILED", { error: error.message });
      this.emit("run:failed", run, error);
      this.emit("alert", "error", `[${run.id}] FAILED at ${run.state}: ${error.message}`);

      if (this.consecutiveFailures >= this.config.maxConsecutiveFailures) {
        this.paused = true;
        this.emit("run:paused", run, `Auto-paused after ${this.consecutiveFailures} consecutive failures`);
        this.emit("alert", "error", `Runner AUTO-PAUSED after ${this.consecutiveFailures} failures`);
      }
    }

    return run;
  }

  // ── Controls ───────────────────────────────────────────────────────────────

  pause(reason = "Manual pause"): void {
    this.paused = true;
    if (this.currentRun && this.currentRun.state !== "COMPLETED") {
      this.setState(this.currentRun, "PAUSED");
      this.emit("run:paused", this.currentRun, reason);
    }
  }

  resume(): void {
    this.paused = false;
    this.consecutiveFailures = 0;
    this.emit("alert", "info", "Runner resumed");
  }

  getStatus() {
    return {
      wallet:               this.signer.address,
      paused:               this.paused,
      consecutiveFailures:  this.consecutiveFailures,
      currentRun:           this.currentRun,
      strategy:             this.config.strategy,
    };
  }
}
