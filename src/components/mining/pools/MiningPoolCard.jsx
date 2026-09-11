// MiningPoolCard.jsx — Reusable pool data card rendered through the shared
// MiningPanel shell so it matches every other card on the dashboard.
import { useMemo, useState } from "react";
import { btcValue, compactNumber } from "../miningWorkspaceData";
import { useCoinPrice } from "../CoinPriceContext";
import { SearchIcon, CloseIcon } from "../Icons.jsx";
import MiningPanel, { StatTile, StatGrid } from "../MiningPanel.jsx";

export default function MiningPoolCard({
  title,
  icon,
  accent,
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
    ? rows.reduce((best, row) => (row[filterKey] || 0) > (best?.[filterKey] || 0) ? row : best, null)
    : null;

  const totalBtc = useMemo(
    () => rows?.reduce((s, r) => s + (r.btcPerDay || 0), 0) || 0,
    [rows]
  );

  const subtitle = topValue
    ? `Best: ${topValue.algorithm || topValue.coin} · ${btcValue(topValue.btcPerDay)} BTC/day`
    : lastUpdated
      ? `Updated ${new Date(lastUpdated).toLocaleTimeString()}`
      : "No data yet";

  return (
    <MiningPanel
      icon={icon}
      accent={accent}
      title={title}
      subtitle={subtitle}
      actions={
        <button
          type="button"
          onClick={() => onRefresh?.()}
          disabled={loading}
          title="Refresh"
          aria-label="Refresh"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "26px",
            height: "26px",
            borderRadius: "8px",
            border: "1px solid rgba(148,163,184,0.18)",
            background: "rgba(148,163,184,0.08)",
            color: "#94a3b8",
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.55 : 1,
            flexShrink: 0,
            padding: 0,
          }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={loading ? { animation: "spin 0.9s linear infinite" } : undefined}
          >
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <polyline points="21 3 21 9 15 9" />
          </svg>
        </button>
      }
    >
      {/* Summary tiles */}
      <StatGrid cols={2}>
        <StatTile label="Algorithms" value={rows?.length || 0} color="#94a3b8" />
        <StatTile label="Total BTC/day" value={btcValue(totalBtc)} color="#34d399" />
      </StatGrid>

      {loading && <div style={{ color: "#fbbf24", fontSize: "11px" }}>Loading...</div>}
      {error && <div style={{ color: "#f87171", fontSize: "11px" }}>{error}</div>}

      {/* Search */}
      <div style={{ position: "relative" }}>
        <span
          style={{
            position: "absolute",
            left: "10px",
            top: "50%",
            transform: "translateY(-50%)",
            display: "flex",
            pointerEvents: "none",
          }}
        >
          <SearchIcon size={13} color="#64748b" />
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search algorithms or coins..."
          style={{
            width: "100%",
            padding: "8px 12px 8px 32px",
            background: "rgba(0,0,0,0.25)",
            border: "1px solid rgba(148,163,184,0.15)",
            borderRadius: "8px",
            color: "#e2e8f0",
            fontSize: "12px",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            style={{
              position: "absolute",
              right: "8px",
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              color: "#64748b",
              cursor: "pointer",
              display: "flex",
            }}
            title="Clear"
          >
            <CloseIcon size={12} />
          </button>
        )}
      </div>

      {/* Table */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          background: "rgba(0,0,0,0.18)",
          borderRadius: "8px",
          padding: "2px",
        }}
      >
        {loading && !rows?.length ? (
          <div style={{ padding: "24px", textAlign: "center", color: "#64748b", fontSize: "13px" }}>Loading...</div>
        ) : filteredRows.length === 0 ? (
          <div style={{ padding: "24px", textAlign: "center", color: "#64748b", fontSize: "12px" }}>
            {query ? "No matches" : "No data available"}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
            <thead>
              <tr style={{ color: "#64748b", borderBottom: "1px solid #334155" }}>
                <th style={{ padding: "8px 6px", textAlign: "left" }}>Algo</th>
                <th style={{ padding: "8px 6px", textAlign: "right" }}>Miners</th>
                <th style={{ padding: "8px 6px", textAlign: "right" }}>BTC/Day</th>
                <th style={{ padding: "8px 6px", textAlign: "right" }}>USD/Day</th>
                <th style={{ padding: "8px 6px", textAlign: "left" }}>Coins</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, i) => (
                <tr
                  key={`${row.nicehashAlgo || row.algorithm || 'pool-row'}-${i}`}
                  style={{ borderBottom: "1px solid #1e293b" }}
                >
                  <td style={{ padding: "4px 2px", color: "#e2e8f0" }}>
                    <strong>{row.algorithm || row.coin || "N/A"}</strong>
                    {row.nicehashAlgo && row.nicehashAlgo !== "UNKNOWN" && (
                      <div style={{ fontSize: "10px", color: "#64748b", marginTop: "2px" }}>
                        NH: {row.nicehashAlgo}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "4px 2px", textAlign: "right", color: "#94a3b8", fontFamily: "monospace" }}>
                    {compactNumber(row.miners || row.workers || 0, 0)}
                  </td>
                  <td style={{ padding: "4px 2px", textAlign: "right" }}>
                    <span
                      style={{
                        color: (row.btcPerDay || 0) > 0 ? "#34d399" : "#64748b",
                        fontWeight: 600,
                        fontFamily: "monospace",
                      }}
                    >
                      {btcValue(row.btcPerDay)}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "4px 2px",
                      textAlign: "right",
                      color: row.usdPerDay > 0 ? "#fbbf24" : "#64748b",
                      fontFamily: "monospace",
                    }}
                  >
                    {row.usdPerDay > 0 ? `$${row.usdPerDay.toFixed(2)}` : "N/A"}
                  </td>
                  <td style={{ padding: "4px 2px" }}>
                    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                      {row.coin && row.coin !== "Unknown" && row.coin !== "N/A" && (
                        <button
                          onClick={() => openCoinModal(row.coin)}
                          style={{
                            border: "1px solid rgba(96,165,250,0.22)",
                            color: "#bfdbfe",
                            background: "rgba(37,99,235,0.12)",
                            borderRadius: "999px",
                            padding: "2px 4px",
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
    </MiningPanel>
  );
}
