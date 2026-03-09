"use client";

import useSWR from "swr";
import { useEffect } from "react";
import { useWS } from "@/hooks/useWS";

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface RunStep {
  state: string;
  timestamp: number;
  txHash?: string;
  error?: string;
}

interface Run {
  id: string;
  agentWallet: string;
  state: string;
  steps: RunStep[];
  startedAt: number;
  completedAt?: number;
  offsetKwh?: number;
  tokenId?: number;
  consecutiveFailures: number;
}

function fmt(ts: number) {
  return new Date(ts).toLocaleString();
}

function duration(start: number, end?: number) {
  const ms = (end ?? Date.now()) - start;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

export default function RunsPage() {
  const { data, mutate } = useSWR<{ runs: Run[] }>("/api/runs?limit=20", fetcher, {
    refreshInterval: 10000,
  });
  const { on } = useWS();

  useEffect(() => {
    const off1 = on("run:completed", () => mutate());
    const off2 = on("run:failed", () => mutate());
    return () => { off1(); off2(); };
  }, [on, mutate]);

  const runs = data?.runs ?? [];

  return (
    <>
      <h1 className="page-title">Run History</h1>
      <p className="page-subtitle">Last 20 pipeline runs</p>

      {runs.length === 0 ? (
        <div className="empty">No runs yet — execute a pipeline run to see history</div>
      ) : (
        <div className="run-list">
          {runs.map(run => (
            <div key={run.id} className="run-card">
              <div className="run-card-header">
                <span className="run-id">{run.id}</span>
                <span className={`state-badge ${run.state}`}>{run.state}</span>
              </div>

              <div className="run-steps">
                {run.steps.map((step, i) => (
                  <span key={i} className="step-chip">{step.state}</span>
                ))}
              </div>

              <div className="run-meta">
                <span>Started: <span>{fmt(run.startedAt)}</span></span>
                <span>Duration: <span>{duration(run.startedAt, run.completedAt)}</span></span>
                {run.offsetKwh != null && (
                  <span>Offset: <span style={{ color: "var(--neon-green)" }}>{run.offsetKwh.toFixed(2)} kWh</span></span>
                )}
                {run.tokenId != null && (
                  <span>Token ID: <span>#{run.tokenId}</span></span>
                )}
                {run.steps[run.steps.length - 1]?.error && (
                  <span style={{ color: "var(--neon-pink)" }}>
                    Error: {run.steps[run.steps.length - 1].error}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
