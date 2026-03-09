export type Strategy = "lazy" | "dca" | "max";

export interface StrategyConfig {
  /** lazy = weekly, dca = daily/threshold, max = event-driven */
  strategy: Strategy;
  /** Minimum kWh to accumulate before issuing AREC (default: 100) */
  minKwhThreshold: number;
  /** Max slippage in basis points for ART→kWh (default: 150) */
  maxSlippageBps: number;
  /** Max kWh to process in a single run (default: 200) */
  maxKwhPerRun: number;
  /** Min AKRE to keep in reserve (default: 50) */
  minAkreReserve: bigint;
  /** Max consecutive failures before auto-pause (default: 3) */
  maxConsecutiveFailures: number;
  /** GreenBTC domain IDs to use (default: ACTIVE_DOMAINS) */
  domainIds: number[];
}

export const DEFAULT_STRATEGY: StrategyConfig = {
  strategy: "dca",
  minKwhThreshold: 100,
  maxSlippageBps: 150,
  maxKwhPerRun: 200,
  minAkreReserve: BigInt("50000000000000000000"), // 50 AKRE
  maxConsecutiveFailures: 3,
  domainIds: [2, 3, 11, 12, 13, 14, 15, 16, 17, 18],
};

// ── Run State Machine ──────────────────────────────────────────────────────────
// CREATED → WAITING_INPUT? → MINT_REQUESTED → PENDING_CERTIFICATION
//   → CERTIFIED → LIQUIDIZED → KWH_CONVERTED → OFFSET_SUBMITTED → COMPLETED
//                                                              → FAILED
//                                                              → PAUSED

export type RunState =
  | "CREATED"
  | "WAITING_INPUT"      // not enough kWh or AKRE
  | "MINT_REQUESTED"     // mintRECRequest tx submitted
  | "PENDING_CERTIFICATION"
  | "CERTIFIED"
  | "LIQUIDIZED"
  | "KWH_CONVERTED"
  | "OFFSET_SUBMITTED"
  | "COMPLETED"
  | "FAILED"
  | "PAUSED";

export interface RunStep {
  state: RunState;
  timestamp: number;
  txHash?: string;
  data?: Record<string, unknown>;
  error?: string;
}

export interface Run {
  id: string;
  agentWallet: string;
  strategy: Strategy;
  state: RunState;
  steps: RunStep[];
  startedAt: number;
  completedAt?: number;
  offsetKwh?: number;
  tokenId?: number;
  consecutiveFailures: number;
}

// ── Events emitted by Runner ───────────────────────────────────────────────────
export interface RunnerEvents {
  "state:change": (run: Run, prev: RunState) => void;
  "run:completed": (run: Run) => void;
  "run:failed": (run: Run, error: Error) => void;
  "run:paused": (run: Run, reason: string) => void;
  "alert": (level: "info" | "warn" | "error", message: string, data?: unknown) => void;
}

// ── Arkreen API types ──────────────────────────────────────────────────────────
export interface RecOwnerData {
  startDate: string;   // yyyyMMdd
  endDate: string;     // yyyyMMdd
  totalREOutput?: string;     // hex mWh
  totalPowerOutput?: string;  // hex mWh
}

export interface RecIssueResult {
  cid: string;
  uri: string;
}
