import React from 'react';

export default function DashboardHeader({
  state,
  currentUser,
  isAdmin,
  onForceCheck,
  onDebugLogs,
  onLogout,
  onUsers,
  onCalculator,
  onNavigate,
  currentView = 'dashboard',
}) {
  const navItems = [
    { path: '/', label: 'Pools', view: 'dashboard' },
    { path: '/nicehash', label: 'NiceHash', view: 'nicehash' },
    { path: '/mrr', label: 'Rigs', view: 'mrr' },
    { path: '/mining', label: 'Mining', view: 'mining' },
    { path: '/cryptorate', label: 'Live Rates', view: 'cryptorate' },
  ];

  return (
    <header className="app-header">
      <div className="brand-block">
        <div className="status-card" style={{ marginBottom: "12px" }}>
          <div className="status-item">
            <span style={{ opacity: 0.5, marginRight: "10px" }}>SYSTEM:</span>
            <span
              className={`status-value ${state.loading ? "status-ready" : state.error ? "status-error" : "status-success"}`}
            >
              {state.loading ? "Loading..." : state.error ? "Error" : "Ready"}
            </span>
          </div>
        </div>

        <div className="header-layout">
          <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginRight: "10px", flexShrink: 0 }}>
            <span style={{ fontSize: "11px", opacity: 0.55 }}>Logged in as</span>
            <span style={{ fontSize: "13px", fontWeight: 700 }}>
              {currentUser?.username || "Unknown user"}
            </span>
            <span style={{ fontSize: "11px", opacity: 0.7, textTransform: "uppercase" }}>
              {currentUser?.role || "unknown"}
            </span>
          </div>

          <div className="header-nav">
            {navItems.map((item) => (
              <a
                key={item.path}
                href={item.path}
                onClick={onNavigate(item.path)}
                className="btn-pro secondary"
                style={{
                  fontSize: "10px",
                  padding: "4px 12px",
                  borderRadius: "11px",
                  textDecoration: "none",
                  color: currentView === item.view ? "#60a5fa" : "#94a3b8",
                  background: currentView === item.view ? "rgba(96, 165, 250, 0.12)" : "transparent",
                  border: currentView === item.view ? "1px solid rgba(96, 165, 250, 0.2)" : "1px solid rgba(255,255,255,0.05)",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => { e.target.style.background = "rgba(255,255,255,0.05)"; }}
                onMouseLeave={(e) => {
                  if (currentView !== item.view) e.target.style.background = "transparent";
                }}
              >
                {item.label}
              </a>
            ))}
          </div>

          <div className="header-actions">
            <button className="btn-pro secondary" onClick={onForceCheck} style={{ fontSize: "10px" }}>
              Force Check
            </button>
            <button className="btn-pro secondary" onClick={onDebugLogs} style={{ fontSize: "10px" }}>
              Debug Logs
            </button>
            <button className="btn-pro secondary" onClick={onCalculator} style={{ fontSize: "10px" }}>
              Calculator
            </button>
            {isAdmin && (
              <button className="btn-pro secondary" onClick={onUsers} style={{ fontSize: "10px" }}>
                Users
              </button>
            )}
            <button className="btn-pro secondary" onClick={onLogout} style={{ fontSize: "10px" }}>
              Logout
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
