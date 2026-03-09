"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useWS } from "@/hooks/useWS";

interface AssetsPayload {
  wallet: string;
  akre: string;
  matic: string;
}

const NAV = [
  { href: "/",         label: "Dashboard",  icon: "◈" },
  { href: "/runner",   label: "Runner",     icon: "▶" },
  { href: "/runs",     label: "Run History",icon: "≡" },
  { href: "/miners",   label: "Miners",     icon: "⛏" },
  { href: "/alliance", label: "Alliance",   icon: "◉" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { connected, on } = useWS();
  const [assets, setAssets] = useState<AssetsPayload | null>(null);

  useEffect(() => {
    return on("assets:update", (payload) => {
      setAssets(payload as AssetsPayload);
    });
  }, [on]);

  // Initial asset fetch
  useEffect(() => {
    fetch("/api/assets")
      .then(r => r.json())
      .then(data => setAssets(data as AssetsPayload))
      .catch(() => {});
  }, []);

  const shortWallet = assets?.wallet
    ? `${assets.wallet.slice(0, 6)}…${assets.wallet.slice(-4)}`
    : "—";

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="sidebar-logo">A4<span>A</span></div>
        {NAV.map(({ href, label, icon }) => (
          <Link
            key={href}
            href={href}
            className={`nav-link${pathname === href ? " active" : ""}`}
          >
            <span>{icon}</span>
            {label}
          </Link>
        ))}
        <div style={{ marginTop: "auto", paddingTop: 24, borderTop: "1px solid var(--border-dim)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px" }}>
            <span className={`ws-dot${connected ? "" : " disconnected"}`} />
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {connected ? "Live" : "Reconnecting..."}
            </span>
          </div>
        </div>
      </nav>

      <div className="main-content">
        <div className="status-bar">
          <div className="status-bar-wallet">
            Wallet: <span>{shortWallet}</span>
          </div>
          <div className="status-bar-balances">
            <div className="balance-item">
              <span className="balance-label">AKRE</span>
              <span className="balance-value">
                {assets ? Number(assets.akre).toFixed(2) : "—"}
              </span>
            </div>
            <div className="balance-item">
              <span className="balance-label">MATIC</span>
              <span className="balance-value">
                {assets ? Number(assets.matic).toFixed(4) : "—"}
              </span>
            </div>
          </div>
        </div>

        <main className="page">
          {children}
        </main>
      </div>
    </div>
  );
}
