"use client";

import useSWR from "swr";
import { useEffect, useState, useCallback } from "react";
import { useWS } from "@/hooks/useWS";

const fetcher = (url: string) => fetch(url).then(r => r.json());

type RunState =
  | "CREATED" | "WAITING_INPUT" | "MINT_REQUESTED" | "PENDING_CERTIFICATION"
  | "CERTIFIED" | "LIQUIDIZED" | "KWH_CONVERTED" | "OFFSET_SUBMITTED"
  | "COMPLETED" | "FAILED" | "PAUSED";

interface RunnerStatus {
  wallet: string;
  paused: boolean;
  consecutiveFailures: number;
  currentRun: { id: string; state: RunState } | null;
  strategy: string;
}

interface AlertItem {
  level: "info" | "warn" | "error";
  message: string;
  ts: number;
}

const PIPELINE_STEPS = [
  { key: "MINT_REQUESTED",       label: "Mint AREC", icon: "🌱" },
  { key: "PENDING_CERTIFICATION",label: "Certify",   icon: "📋" },
  { key: "LIQUIDIZED",           label: "Liquidize", icon: "💧" },
  { key: "KWH_CONVERTED",        label: "kWh",       icon: "⚡" },
  { key: "OFFSET_SUBMITTED",     label: "GreenBTC",  icon: "🌍" },
];

const STATE_ORDER: RunState[] = [
  "CREATED", "MINT_REQUESTED", "PENDING_CERTIFICATION",
  "CERTIFIED", "LIQUIDIZED", "KWH_CONVERTED", "OFFSET_SUBMITTED", "COMPLETED",
];

function stepStatus(stepState: RunState, currentState: RunState): "done" | "active" | "idle" {
  const si = STATE_ORDER.indexOf(stepState);
  const ci = STATE_ORDER.indexOf(currentState);
  if (si < 0 || ci < 0) return "idle";
  if (ci > si) return "done";
  if (ci === si) return "active";
  return "idle";
}

function connStatus(nextStepState: RunState, currentState: RunState): "done" | "active" | "idle" {
  const ni = STATE_ORDER.indexOf(nextStepState);
  const ci = STATE_ORDER.indexOf(currentState);
  if (ci >= ni) return "done";
  return "idle";
}

function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export default function RunnerPage() {
  const { data, mutate } = useSWR<RunnerStatus>("/api/runner/status", fetcher, { refreshInterval: 3000 });
  const { on } = useWS();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [executing, setExecuting] = useState(false);

  useEffect(() => {
    const off1 = on("alert", (p) => {
      setAlerts(prev => [p as AlertItem, ...prev].slice(0, 100));
    });
    const off2 = on("state:change", () => mutate());
    const off3 = on("run:completed", () => { mutate(); setExecuting(false); });
    const off4 = on("run:failed", () => { mutate(); setExecuting(false); });
    return () => { off1(); off2(); off3(); off4(); };
  }, [on, mutate]);

  const execute = useCallback(async () => {
    setExecuting(true);
    try {
      await fetch("/api/runner/execute", { method: "POST" });
      mutate();
    } catch {
      setExecuting(false);
    }
  }, [mutate]);

  const togglePause = useCallback(async () => {
    const path = data?.paused ? "/api/runner/resume" : "/api/runner/pause";
    await fetch(path, { method: "POST" });
    mutate();
  }, [data?.paused, mutate]);

  const currentState: RunState = data?.currentRun?.state ?? "CREATED";
  const isRunning = data?.currentRun && !["COMPLETED", "FAILED", "PAUSED", "WAITING_INPUT"].includes(currentState);

  return (
    <>
      <h1 className="page-title">Runner</h1>
      <p className="page-subtitle">Pipeline control · Strategy: {data?.strategy ?? "—"}</p>

      {/* Pipeline flow */}
      <div className="pipeline">
        {PIPELINE_STEPS.map((step, idx) => {
          const status = data?.currentRun
            ? stepStatus(step.key as RunState, currentState)
            : "idle";
          const connSt = idx < PIPELINE_STEPS.length - 1 && data?.currentRun
            ? connStatus(PIPELINE_STEPS[idx + 1].key as RunState, currentState)
            : "idle";

          return (
            <div key={step.key} style={{ display: "flex", alignItems: "center", flex: 1 }}>
              <div className={`pipeline-step ${status}`}>
                <div className="pipeline-step-icon">{step.icon}</div>
                <div className="pipeline-step-label">{step.label}</div>
              </div>
              {idx < PIPELINE_STEPS.length - 1 && (
                <div className={`pipeline-connector ${connSt}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Controls */}
      <div className="section">
        <div className="section-title">Controls</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            className="btn-neon"
            onClick={execute}
            disabled={executing || !!isRunning || data?.paused}
          >
            {executing || isRunning ? "◌ Running..." : "▶ Execute"}
          </button>
          <button
            className={`btn-neon ${data?.paused ? "" : "pink"}`}
            onClick={togglePause}
            disabled={!!isRunning}
          >
            {data?.paused ? "▶ Resume" : "⏸ Pause"}
          </button>
        </div>
        {data?.consecutiveFailures ? (
          <p style={{ marginTop: 12, fontSize: 12, color: "var(--neon-pink)" }}>
            ⚠ {data.consecutiveFailures} consecutive failure{data.consecutiveFailures !== 1 ? "s" : ""}
            {data.consecutiveFailures >= 3 ? " — runner auto-paused" : ""}
          </p>
        ) : null}
      </div>

      {/* Current run */}
      {data?.currentRun && (
        <div className="section">
          <div className="section-title">Current Run</div>
          <div className="run-card">
            <div className="run-card-header">
              <span className="run-id">{data.currentRun.id}</span>
              <span className={`state-badge ${data.currentRun.state}`}>
                {data.currentRun.state.replace("_", " ")}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Alert feed */}
      <div className="section">
        <div className="section-title">Live Events</div>
        {alerts.length === 0 ? (
          <div className="empty">Waiting for events…</div>
        ) : (
          <div className="alert-feed">
            {alerts.map((a, i) => (
              <div key={i} className={`alert-item ${a.level}`}>
                <span className="alert-dot" />
                <span style={{ flex: 1 }}>{a.message}</span>
                <span className="alert-ts">{timeAgo(a.ts)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
