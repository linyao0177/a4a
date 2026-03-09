"use client";

import useSWR from "swr";
import { useEffect, useState } from "react";
import { useWS } from "@/hooks/useWS";

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface DashboardData {
  total_kwh: number;
  today_kwh: number;
  streak: number;
  paused: boolean;
  consecutive_failures: number;
  current_run?: {
    id: string;
    state: string;
  };
}

interface AlertItem {
  level: "info" | "warn" | "error";
  message: string;
  ts: number;
}

function fmt(n: number | undefined, dec = 2) {
  return n == null ? "—" : n.toFixed(dec);
}

function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export default function DashboardPage() {
  const { data, mutate } = useSWR<DashboardData>("/api/dashboard", fetcher, { refreshInterval: 5000 });
  const { on } = useWS();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  useEffect(() => {
    return on("alert", (payload) => {
      const item = payload as AlertItem;
      setAlerts(prev => [item, ...prev].slice(0, 50));
    });
  }, [on]);

  useEffect(() => {
    return on("run:completed", () => {
      mutate();
    });
  }, [on, mutate]);

  return (
    <>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-subtitle">Live pipeline stats · Polygon mainnet</p>

      <div className="stat-grid">
        <div className="stat-card green">
          <div className="stat-label">Total Offset</div>
          <div className="stat-value">{fmt(data?.total_kwh, 1)}</div>
          <div className="stat-unit">kWh</div>
        </div>
        <div className="stat-card yellow">
          <div className="stat-label">Today</div>
          <div className="stat-value">{fmt(data?.today_kwh, 1)}</div>
          <div className="stat-unit">kWh</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Streak</div>
          <div className="stat-value">{data?.streak ?? "—"}</div>
          <div className="stat-unit">days</div>
        </div>
        <div className={`stat-card ${data?.paused ? "pink" : "green"}`}>
          <div className="stat-label">Status</div>
          <div className="stat-value" style={{ fontSize: 18, marginTop: 4 }}>
            {data?.paused ? "PAUSED" : "RUNNING"}
          </div>
          {data?.consecutive_failures ? (
            <div className="stat-unit" style={{ color: "var(--neon-pink)" }}>
              {data.consecutive_failures} failure{data.consecutive_failures !== 1 ? "s" : ""}
            </div>
          ) : null}
        </div>
      </div>

      {data?.current_run && (
        <div className="section">
          <div className="section-title">Current Run</div>
          <div className="run-card">
            <div className="run-card-header">
              <span className="run-id">{data.current_run.id}</span>
              <span className={`state-badge ${data.current_run.state}`}>
                {data.current_run.state}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-title">Live Alerts</div>
        {alerts.length === 0 ? (
          <div className="empty">No alerts yet — waiting for events</div>
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
