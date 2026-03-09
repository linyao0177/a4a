export default function MinersPage() {
  return (
    <>
      <h1 className="page-title">Miners</h1>
      <p className="page-subtitle">Connected energy sources</p>

      <div className="empty">
        Miner data coming soon — connect your Arkreen smart plugs to see live generation stats.
      </div>

      <div className="stat-grid" style={{ marginTop: 24 }}>
        {["Plug Alpha", "Plug Beta", "Plug Gamma"].map((name, i) => (
          <div key={i} className="stat-card">
            <div className="stat-label">{name}</div>
            <div className="stat-value" style={{ fontSize: 18 }}>—</div>
            <div className="stat-unit">Offline</div>
          </div>
        ))}
      </div>
    </>
  );
}
