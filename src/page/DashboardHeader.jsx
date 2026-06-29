// components/Dashboard/DashboardHeader.jsx
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
}) {
  return (
    <header
      className="app-header"
      style={{
        padding: "40px 0",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        marginBottom: "30px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-end",
      }}
    >
      <div className="brand-block" style={{ flex: 1 }}>
        <div className="status-card" style={{ marginBottom: "2px" }}>
          <div className="status-item">
            <span style={{ opacity: 0.5, marginRight: "10px" }}>SYSTEM:</span>
            <span
              className={`status-value ${state.loading ? "status-ready" : state.error ? "status-error" : "status-success"}`}
            >
              {state.loading ? "Loading..." : state.error ? "Error" : "Ready"}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              gap: "8px",
              marginTop: "8px",
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "2px",
                marginRight: "10px",
                minWidth: "160px",
                justifyContent: "center",
              }}
            >
              <span style={{ fontSize: "11px", opacity: 0.55 }}>Logged in as</span>
              <span style={{ fontSize: "13px", fontWeight: 700 }}>
                {currentUser?.username || "Unknown user"}
              </span>
              <span style={{ fontSize: "11px", opacity: 0.7, textTransform: "uppercase" }}>
                {currentUser?.role || "unknown"}
              </span>
            </div>
            
            <button className="btn-pro secondary" onClick={onForceCheck} style={{ fontSize: "10px" }}>
              Force Check
            </button>
            <button className="btn-pro secondary" onClick={onDebugLogs} style={{ fontSize: "10px" }}>
              Debug Logs
            </button>
            <button className="btn-pro secondary" onClick={onLogout} style={{ fontSize: "10px" }}>
              Logout
            </button>
            
            {isAdmin && (
              <button className="btn-pro secondary" onClick={onUsers} style={{ fontSize: "10px" }}>
                Users
              </button>
            )}

            <button className="btn-pro secondary" onClick={onCalculator} style={{ fontSize: "10px" }}>
              Calculator
            </button>

            <a
              href="/cryptorate"
              className="btn-pro secondary"
              onClick={onNavigate("/cryptorate")}
              style={{
                fontSize: "10px",
                textAlign: "center",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              Live Rates
            </a>

            <a
              href="/mining"
              className="btn-pro secondary"
              onClick={onNavigate("/mining")}
              style={{
                fontSize: "10px",
                textAlign: "center",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              Mining
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}