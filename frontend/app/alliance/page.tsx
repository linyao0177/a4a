"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface LeaderRow {
  rank: number;
  wallet: string;
  total_kwh: number;
  streak: number;
}

export default function AlliancePage() {
  const { data } = useSWR<{ leaderboard: LeaderRow[] }>("/api/alliance", fetcher, {
    refreshInterval: 30000,
  });

  const rows = data?.leaderboard ?? [];

  return (
    <>
      <h1 className="page-title">Alliance</h1>
      <p className="page-subtitle">Global green energy leaderboard</p>

      <div className="run-list">
        {rows.map(row => (
          <div key={row.rank} className="run-card">
            <div className="run-card-header">
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <span style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 24,
                  color: row.rank === 1 ? "var(--neon-yellow)" : row.rank === 2 ? "var(--text-muted)" : "var(--text-muted)",
                  width: 36,
                }}>
                  #{row.rank}
                </span>
                <span className="run-id" style={{ fontSize: 13 }}>{row.wallet}</span>
              </div>
              <div style={{ display: "flex", gap: 24 }}>
                <div>
                  <div className="stat-label">Total kWh</div>
                  <div style={{ color: "var(--neon-green)", fontFamily: "var(--font-display)", fontSize: 18 }}>
                    {row.total_kwh.toFixed(0)}
                  </div>
                </div>
                <div>
                  <div className="stat-label">Streak</div>
                  <div style={{ color: "var(--neon-cyan)", fontFamily: "var(--font-display)", fontSize: 18 }}>
                    {row.streak}d
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
