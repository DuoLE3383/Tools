// components/Dashboard/QuickActions.jsx
import React from 'react';

export default function QuickActions({ onCalculator, onNavigate }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "16px",
        gap: "12px",
        flexWrap: "wrap",
      }}
    >
      <div>
        <h3 style={{ margin: 0, fontSize: "1rem" }}>Quick Actions</h3>
        <p
          style={{
            margin: "4px 0 0",
            color: "var(--muted)",
            fontSize: "0.85rem",
          }}
        >
          Open the hashrate calculator or view live rates.
        </p>
      </div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button className="btn-pro secondary" onClick={onCalculator}>
          Open Calculator
        </button>
        <a
          href="/cryptorate"
          className="btn-pro secondary"
          onClick={onNavigate("/cryptorate")}
          style={{
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          Live Rates
        </a>
      </div>
    </div>
  );
}