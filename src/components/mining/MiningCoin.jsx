// MiningCoin.jsx - Add import and price modal
import { useMemo, useState } from "react";
import { btcValue, compactNumber, percentValue } from "./miningWorkspaceData";
import { useMiningWorkspace } from "./MiningWorkspaceProvider";
import CoinPriceModal from "./CoinPriceModal"; // <-- Add this import

export default function MiningCoin({ onCall, nhClient = "VN" }) {
  const {
    routes: combinedRows,
    loading,
    error,
    lastUpdated,
    refresh,
  } = useMiningWorkspace();
  const [query, setQuery] = useState("");
  const [onlyProfitable, setOnlyProfitable] = useState(true);
  const [selectedCoin, setSelectedCoin] = useState(null);
  const [priceModalOpen, setPriceModalOpen] = useState(false);

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return combinedRows.filter((row) => {
      if (
        onlyProfitable &&
        !(
          row.spread > 0 ||
          (row.miningDutchBtcPerDay > 0 && !row.niceHashPrice)
        )
      ) {
        return false;
      }

      if (!needle) return true;
      return [
        row.label,
        row.nicehashAlgo,
        row.mrrAlgo,
        row.bestSource,
        ...row.heroCoins,
      ].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(needle),
      );
    });
  }, [combinedRows, onlyProfitable, query]);

  const bestRow = visibleRows[0] || null;
  const profitableCount = combinedRows.filter((row) => row.spread > 0).length;

  // Handle coin click - open price modal
  const handleCoinClick = (coin) => {
    setSelectedCoin({
      symbol: coin,
      name: coin,
      coinId: coin.toLowerCase(),
    });
    setPriceModalOpen(true);
  };

  return (
    <section
      className="mining-coin-page"
      style={{ display: "grid", gap: "14px" }}
    >
      {/* ... header section ... */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: "14px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h3 style={{ margin: 0, color: "#e2e8f0" }}>Mining Coin Router</h3>
          <p style={{ margin: "4px 0 0", color: "#94a3b8", fontSize: "12px" }}>
            Match pool profitability to NiceHash and MRR algorithm names.
          </p>
        </div>
        <div
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <label
            style={{
              display: "flex",
              gap: "6px",
              alignItems: "center",
              color: "#94a3b8",
              fontSize: "11px",
            }}
          >
            <input
              type="checkbox"
              checked={onlyProfitable}
              onChange={(event) => setOnlyProfitable(event.target.checked)}
            />
            Profitable only
          </label>
          <button
            className="btn-pro secondary"
            onClick={() => void refresh(true)}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* ... summary tiles ... */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: "10px",
        }}
      >
        <SummaryTile
          label="Best algorithm"
          value={bestRow?.label || "N/A"}
          tone="#22d3ee"
        />
        <SummaryTile
          label="Positive spread"
          value={profitableCount}
          tone="#34d399"
        />
        <SummaryTile
          label="Algorithms tracked"
          value={combinedRows.length}
          tone="#fbbf24"
        />
        <SummaryTile
          label="Updated"
          value={
            lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "--"
          }
          tone="#a78bfa"
        />
      </div>

      {/* ... search input ... */}
      <div
        style={{
          display: "flex",
          gap: "10px",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search algorithm, MRR slug, or coin..."
          style={{
            flex: "1 1 280px",
            minWidth: 0,
            background: "rgba(15,23,42,0.72)",
            border: "1px solid rgba(148,163,184,0.18)",
            borderRadius: "8px",
            color: "#e2e8f0",
            padding: "10px 12px",
            fontSize: "12px",
          }}
        />
        {error && (
          <span style={{ color: "#f87171", fontSize: "12px" }}>{error}</span>
        )}
      </div>

      {/* ... table ... */}
      <div
        style={{
          overflowX: "auto",
          border: "1px solid rgba(148,163,184,0.12)",
          borderRadius: "8px",
          background: "rgba(2,6,23,0.35)",
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "11px",
            minWidth: "980px",
          }}
        >
          <thead>
            <tr
              style={{
                color: "#94a3b8",
                borderBottom: "1px solid rgba(148,163,184,0.12)",
              }}
            >
              <HeaderCell align="left">Algorithm</HeaderCell>
              <HeaderCell>NiceHash</HeaderCell>
              <HeaderCell>MRR</HeaderCell>
              <HeaderCell>Pool BTC/day</HeaderCell>
              <HeaderCell>NiceHash price</HeaderCell>
              <HeaderCell>Spread</HeaderCell>
              <HeaderCell>HeroMiners</HeaderCell>
              <HeaderCell align="left">Coins</HeaderCell>
            </tr>
          </thead>
          <tbody>
            {loading && !visibleRows.length ? (
              <tr>
                <td
                  colSpan="8"
                  style={{
                    padding: "24px",
                    textAlign: "center",
                    color: "#94a3b8",
                  }}
                >
                  Loading mining routes...
                </td>
              </tr>
            ) : visibleRows.length === 0 ? (
              <tr>
                <td
                  colSpan="8"
                  style={{
                    padding: "24px",
                    textAlign: "center",
                    color: "#94a3b8",
                  }}
                >
                  No matching algorithm routes found.
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => (
                <tr
                  key={row.nicehashAlgo}
                  style={{ borderBottom: "1px solid rgba(148,163,184,0.08)" }}
                >
                  <BodyCell align="left">
                    <strong style={{ color: "#e2e8f0" }}>{row.label}</strong>
                    <div style={{ color: "#64748b", marginTop: "2px" }}>
                      {row.unit}/day comparison
                    </div>
                  </BodyCell>
                  <BodyCell>{row.nicehashAlgo}</BodyCell>
                  <BodyCell>{row.mrrAlgo}</BodyCell>
                  <BodyCell>
                    <strong
                      style={{
                        color:
                          row.miningDutchBtcPerDay > 0 ? "#34d399" : "#64748b",
                      }}
                    >
                      {btcValue(row.miningDutchBtcPerDay)}
                    </strong>
                    <div style={{ color: "#64748b", marginTop: "2px" }}>
                      {row.miningDutchMiners
                        ? `${compactNumber(row.miningDutchMiners, 0)} MD miners`
                        : row.miningDutchHashrate}
                    </div>
                  </BodyCell>
                  <BodyCell>{btcValue(row.niceHashPrice)}</BodyCell>
                  <BodyCell>
                    <span
                      style={{
                        color:
                          row.spread > 0
                            ? "#34d399"
                            : row.spread < 0
                              ? "#f87171"
                              : "#94a3b8",
                        fontWeight: 700,
                      }}
                    >
                      {row.spread === null ? "N/A" : percentValue(row.spread)}
                    </span>
                  </BodyCell>
                  <BodyCell>
                    <strong style={{ color: "#60a5fa" }}>
                      {compactNumber(row.heroMiners, 0)}
                    </strong>
                    <div style={{ color: "#64748b", marginTop: "2px" }}>
                      {compactNumber(row.heroWorkers, 0)} workers
                    </div>
                  </BodyCell>
                  <BodyCell align="left">
                    <div
                      style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}
                    >
                      {row.heroCoins && row.heroCoins.length > 0 ? (
                        row.heroCoins.map((coin) => (
                          <button
                            key={coin}
                            onClick={() => handleCoinClick(coin)}
                            style={{
                              border: "1px solid rgba(96,165,250,0.22)",
                              color: "#bfdbfe",
                              background: "rgba(37,99,235,0.12)",
                              borderRadius: "999px",
                              padding: "2px 8px",
                              fontSize: "10px",
                              cursor: "pointer",
                              transition: "all 0.2s",
                            }}
                            onMouseEnter={(e) => {
                              e.target.style.background =
                                "rgba(37,99,235,0.25)";
                              e.target.style.borderColor =
                                "rgba(96,165,250,0.5)";
                            }}
                            onMouseLeave={(e) => {
                              e.target.style.background =
                                "rgba(37,99,235,0.12)";
                              e.target.style.borderColor =
                                "rgba(96,165,250,0.22)";
                            }}
                          >
                            {coin} 💰
                          </button>
                        ))
                      ) : (
                        <span style={{ color: "#64748b", fontSize: "10px" }}>
                          No coins
                        </span>
                      )}
                      {/* Show count if many coins */}
                      {row.heroCoins && row.heroCoins.length > 10 && (
                        <span
                          style={{
                            color: "#64748b",
                            fontSize: "9px",
                            padding: "2px 4px",
                          }}
                        >
                          +{row.heroCoins.length - 10} more
                        </span>
                      )}
                    </div>
                  </BodyCell>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Price Modal */}
      <CoinPriceModal
        isOpen={priceModalOpen}
        onClose={() => setPriceModalOpen(false)}
        coin={selectedCoin}
        onCall={onCall}
        priceSource="coingecko"
      />
    </section>
  );
}

function SummaryTile({ label, value, tone }) {
  return (
    <div
      style={{
        border: "1px solid rgba(148,163,184,0.12)",
        borderRadius: "8px",
        background: "rgba(15,23,42,0.48)",
        padding: "12px",
      }}
    >
      <div
        style={{
          color: "#64748b",
          fontSize: "10px",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: tone,
          fontSize: "18px",
          fontWeight: 800,
          marginTop: "6px",
        }}
      >
        {value}
      </div>
    </div>
  );
}

export function HeaderCell({ children, align = "right" }) {
  return (
    <th
      style={{
        padding: "9px 10px",
        textAlign: align,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
      }}
    >
      {children}
    </th>
  );
}

export function BodyCell({ children, align = "right" }) {
  return (
    <td
      style={{
        padding: "10px",
        textAlign: align,
        verticalAlign: "top",
        color: "#cbd5e1",
      }}
    >
      {children}
    </td>
  );
}
