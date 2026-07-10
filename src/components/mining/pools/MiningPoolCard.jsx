// MiningPoolCard.jsx - Reusable pool data card
import { useMemo, useState, useCallback } from "react";
import { useMiningWorkspace } from "../MiningWorkspaceProvider";
import { btcValue, compactNumber, percentValue } from "../miningWorkspaceData";
import { useCoinPrice } from "../CoinPriceContext";

export default function MiningPoolCard({
  title,
  icon,
  accent,
  dataSource, // "hero" | "dutch" | "minerstat" | "wtm" | "hashrateNo"
  rows,
  loading,
  error,
  lastUpdated,
  onRefresh,
  stats,
  filterKey = "btcPerDay",
  extraInfo,
}) {
  const { openCoinModal } = useCoinPrice();
  const [query, setQuery] = useState("");

  const filteredRows = useMemo(() => {
    if (!rows?.length) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return rows.slice(0, 30);
    return rows.filter((row) =>
      [row.coin, row.algorithm, row.nicehashAlgo, row.mrrAlgo]
        .some((v) => String(v || "").toLowerCase().includes(needle))
    ).slice(0, 30);
  }, [rows, query]);

  const topValue = rows?.length
    ? rows.sort((a, b) => (b[filterKey] || 0) - (a[filterKey] || 0))[0]
    : null;

  const totalBtc = useMemo(
    () => rows?.reduce((s, r) => s + (r.btcPerDay || 0), 0) || 0,
    [rows]
  );

  return (
    <div style={{
      padding: "clamp(10px, 1vw, 14px)",
      background: "rgba(15,23,42,0.72)",
      border: "1px solid rgba(148,163,184,0.12)",
      borderRadius: "12px",
      boxShadow: "0 18px 40px rgba(0,0,0,0.20)",
      width: "100%",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      gap: "10px",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <div>
          <h4 style={{ margin: 0, color: accent, fontSize: "clamp(12px, 1vw, 14px)" }}>
            {icon} {title}
          </h4>
          {topValue && (
            <div style={{ fontSize: "clamp(9px, 0.7vw, 11px)", color: "#94a3b8", marginTop: "2px" }}>
              Best: <span style={{ color: "#34d399", fontWeight: 700 }}>{topValue.algorithm || topValue.coin}</span> · {btcValue(topValue.btcPerDay)} BTC/day
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: "clamp(9px, 0.7vw, 11px)", color: "#64748b" }}>
            {compactNumber(totalBtc)} BTC
          </span>
          <button
            className="btn-pro secondary"
            onClick={() => onRefresh?.()}
            disabled={loading}
            style={{
              fontSize: "clamp(9px, 0.7vw, 11px)",
              padding: "3px 10px",
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            {loading ? "⏳" : "⟳"}
          </button>
        </div>
      </div>

      {/* Status */}
      <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
        {loading && (
          <span style={{ color: "#fbbf24", fontSize: "clamp(9px, 0.7vw, 11px)" }}>Loading...</span>
        )}
        {error && (
          <span style={{ color: "#f87171", fontSize: "clamp(9px, 0.7vw, 11px)" }}>
            ⚠ {error}
          </span>
        )}
        {lastUpdated && !loading && (
          <span style={{ color: "#64748b", fontSize: "clamp(8px, 0.6vw, 10px)" }}>
            {new Date(lastUpdated).toLocaleTimeString()}
          </span>
        )}
        {stats && (
          <span style={{ color: "#94a3b8", fontSize: "clamp(8px, 0.6vw, 10px)" }}>
            {rows?.length || 0} rows
          </span>
        )}
        {extraInfo}
      </div>

      {/* Search */}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search algorithms or coins..."
        style={{
          width: "100%",
          padding: "6px 10px",
          background: "rgba(0,0,0,0.25)",
          border: "1px solid rgba(148,163,184,0.15)",
          borderRadius: "6px",
          color: "#e2e8f0",
          fontSize: "clamp(10px, 0.8vw, 12px)",
          outline: "none",
          boxSizing: "border-box",
        }}
      />

      {/* Table */}
      <div style={{
        maxHeight: "320px",
        overflowY: "auto",
        background: "rgba(0,0,0,0.18)",
        borderRadius: "8px",
        padding: "2px",
      }}>
        {loading && !rows?.length ? (
          <div style={{ padding: "20px", textAlign: "center", color: "#64748b", fontSize: "12px" }}>Loading...</div>
        ) : filteredRows.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center", color: "#64748b", fontSize: "11px" }}>
            {query ? "No matches" : "No data available"}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "clamp(9px, 0.7vw, 11px)" }}>
            <thead>
              <tr style={{ color: "#64748b", borderBottom: "1px solid #334155" }}>
                <th style={{ padding: "6px 4px", textAlign: "left" }}>Algo</th>
                <th style={{ padding: "6px 4px", textAlign: "right" }}>Miners</th>
                <th style={{ padding: "6px 4px", textAlign: "right" }}>BTC/Day</th>
                <th style={{ padding: "6px 4px", textAlign: "right" }}>USD/Day</th>
                <th style={{ padding: "6px 4px", textAlign: "left" }}>Coins</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, i) => (
                <tr key={row.nicehashAlgo || row.algorithm || i} style={{ borderBottom: "1px solid #1e293b" }}>
                  <td style={{ padding: "5px 4px", color: "#e2e8f0" }}>
                    <strong>{row.algorithm || row.coin || "N/A"}</strong>
                    {row.nicehashAlgo && row.nicehashAlgo !== "UNKNOWN" && (
                      <div style={{ fontSize: "8px", color: "#64748b", marginTop: "1px" }}>
                        NH: {row.nicehashAlgo}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "5px 4px", textAlign: "right", color: "#94a3b8" }}>
                    {compactNumber(row.miners || row.workers || 0, 0)}
                  </td>
                  <td style={{ padding: "5px 4px", textAlign: "right" }}>
                    <span style={{ color: (row.btcPerDay || 0) > 0 ? "#34d399" : "#64748b", fontWeight: 600 }}>
                      {btcValue(row.btcPerDay)}
                    </span>
                  </td>
                  <td style={{ padding: "5px 4px", textAlign: "right", color: "#fbbf24" }}>
                    ${(row.usdPerDay || 0).toFixed(2)}
                  </td>
                  <td style={{ padding: "5px 4px" }}>
                    <div style={{ display: "flex", gap: "3px", flexWrap: "wrap" }}>
                      {row.coin && row.coin !== "Unknown" && row.coin !== "N/A" && (
                        <button
                          onClick={() => openCoinModal(row.coin)}
                          style={{
                            border: "1px solid rgba(96,165,250,0.22)",
                            color: "#bfdbfe",
                            background: "rgba(37,99,235,0.12)",
                            borderRadius: "99px",
                            padding: "1px 5px",
                            fontSize: "8px",
                            cursor: "pointer",
                          }}
                        >
                          {row.coin}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
