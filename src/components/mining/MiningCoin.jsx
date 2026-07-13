// MiningCoin.jsx - Updated with HeroMiners integration

import { useMemo, useState, useEffect, useCallback } from "react";
import { btcValue, compactNumber, percentValue } from "./miningWorkspaceData.js";
import { useMiningWorkspace } from "./MiningWorkspaceProvider";
import { useCoinPrice } from "./CoinPriceContext.jsx";
import { getAlgoDisplayName } from "../../core/mapping.js";
export default function MiningCoin({ onCall, nhClient = "VN" }) {
  const {
    opportunities: combinedRows,
    loading,
    error,
    lastUpdated,
    refresh,
    heroStats,
    heroLoading,
    heroError,
  } = useMiningWorkspace();
  const { openCoinModal } = useCoinPrice();
  
  const [query, setQuery] = useState("");
  const [onlyProfitable, setOnlyProfitable] = useState(true);
  const [availableCoins, setAvailableCoins] = useState(new Set());
  const [coinDetailsMap, setCoinDetailsMap] = useState(new Map());
  const [showHeroMiners, setShowHeroMiners] = useState(false);

  // HeroMiners table data
  const heroCoinStats = useMemo(() => {
    if (!heroStats?.coinStats) return [];
    const list = Array.isArray(heroStats.coinStats) ? heroStats.coinStats : [];
    
    // Group by algorithm
    const groupedByAlgo = new Map();
    list.forEach((coin) => {
      const rawAlgo = coin.algorithm || coin.algo || "Unknown";
      const normalized = rawAlgo.toUpperCase();
      
      const existing = groupedByAlgo.get(normalized);
      if (existing) {
        existing.miners += Number(coin.miners) || 0;
        existing.btcPerDay += parseFloat(coin.btcPerDay || 0);
        existing.usdPerDay += parseFloat(coin.usdPerDay || 0);
        if (coin.coin) existing.coinsSet.add(coin.coin);
        if (coin.symbol) existing.coinsSet.add(coin.symbol);
      } else {
        const coinsSet = new Set();
        if (coin.coin) coinsSet.add(coin.coin);
        if (coin.symbol) coinsSet.add(coin.symbol);
        
        groupedByAlgo.set(normalized, {
          algorithm: getAlgoDisplayName(normalized),
          normalized: normalized,
          miners: Number(coin.miners) || 0,
          btcPerDay: parseFloat(coin.btcPerDay || 0),
          usdPerDay: parseFloat(coin.usdPerDay || 0),
          coinsSet: coinsSet,
        });
      }
    });
    
    return Array.from(groupedByAlgo.values()).map(item => ({
      ...item,
      coins: Array.from(item.coinsSet).filter(Boolean).sort(),
    }));
  }, [heroStats]);

  // Filtered rows (existing logic)
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

  // Filtered HeroMiners rows
  const visibleHeroRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return heroCoinStats;
    return heroCoinStats.filter((row) => {
      return [
        row.algorithm,
        row.normalized,
        ...row.coins,
      ].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(needle),
      );
    });
  }, [heroCoinStats, query]);

  const bestRow = visibleRows[0] || null;
  const profitableCount = combinedRows.filter((row) => row.spread > 0).length;

  // Check which coins are available in the local DB
  const checkAvailableCoins = useCallback(async () => {
    if (typeof onCall !== 'function') return;
    try {
      const result = await onCall('/api/v2/db/available-coins', { silent: true });
      if (result?.success && Array.isArray(result.data)) {
        const coinMap = new Map();
        const coinSet = new Set();
        result.data.forEach(coin => { 
          coinMap.set(coin.symbol.toUpperCase(), coin); 
          coinSet.add(coin.symbol.toUpperCase()); 
        });
        setAvailableCoins(coinSet);
        setCoinDetailsMap(coinMap);
      }
    } catch (err) {
      console.warn("Could not fetch available coins list:", err.message);
    }
  }, [onCall]);

  useEffect(() => { checkAvailableCoins(); }, [checkAvailableCoins]);

  // Combined refresh
  const handleRefresh = useCallback(async () => {
    await refresh(true);
  }, [refresh]);

  return (
    <section className="mining-coin-page" style={{ display: "grid", gap: "14px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "14px", flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0, color: "#e2e8f0" }}>
            Mining Coin Router {showHeroMiners && "with HeroMiners"}
          </h3>
          <p style={{ margin: "4px 0 0", color: "#94a3b8", fontSize: "12px" }}>
            Match pool profitability to NiceHash and MRR algorithm names.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", gap: "6px", alignItems: "center", color: "#94a3b8", fontSize: "11px" }}>
            <input
              type="checkbox"
              checked={showHeroMiners}
              onChange={(event) => setShowHeroMiners(event.target.checked)}
            />
            Show HeroMiners
          </label>
          <label style={{ display: "flex", gap: "6px", alignItems: "center", color: "#94a3b8", fontSize: "11px" }}>
            <input
              type="checkbox"
              checked={onlyProfitable}
              onChange={(event) => setOnlyProfitable(event.target.checked)}
            />
            Profitable only
          </label>
          <button className="btn-pro secondary" onClick={handleRefresh} disabled={loading || heroLoading}>
            {loading || heroLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Summary Tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "10px" }}>
        <SummaryTile label="Best algorithm" value={bestRow?.label || "N/A"} tone="#22d3ee" />
        <SummaryTile label="Positive spread" value={profitableCount} tone="#34d399" />
        <SummaryTile label="Algorithms tracked" value={combinedRows.length} tone="#fbbf24" />
        <SummaryTile label="Updated" value={lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "--"} tone="#a78bfa" />
        {showHeroMiners && (
          <>
            <SummaryTile label="Hero Miners" value={heroStats?.miners || 0} tone="#60a5fa" />
            <SummaryTile label="Hero Coins" value={heroCoinStats.length} tone="#f472b6" />
          </>
        )}
      </div>

      {/* Search */}
      <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
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
        {error && <span style={{ color: "#f87171", fontSize: "12px" }}>{error}</span>}
        {heroError && <span style={{ color: "#f87171", fontSize: "12px" }}>Hero: {heroError}</span>}
      </div>

      {/* Main Table or HeroMiners Table */}
      {showHeroMiners ? (
        // HeroMiners Table
        <div style={{ overflowX: "auto", border: "1px solid rgba(148,163,184,0.12)", borderRadius: "8px", background: "rgba(2,6,23,0.35)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", minWidth: "780px" }}>
            <thead>
              <tr style={{ color: "#94a3b8", borderBottom: "1px solid rgba(148,163,184,0.12)" }}>
                <HeaderCell align="left">Algorithm</HeaderCell>
                <HeaderCell>Miners</HeaderCell>
                <HeaderCell>BTC/Day</HeaderCell>
                <HeaderCell>USD/Day</HeaderCell>
                <HeaderCell align="left">Coins</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {heroLoading && !visibleHeroRows.length ? (
                <tr>
                  <td colSpan="5" style={{ padding: "24px", textAlign: "center", color: "#94a3b8" }}>
                    Loading HeroMiners data...
                  </td>
                </tr>
              ) : visibleHeroRows.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ padding: "24px", textAlign: "center", color: "#94a3b8" }}>
                    No HeroMiners data found.
                  </td>
                </tr>
              ) : (
                visibleHeroRows.map((row) => (
                  <tr key={row.normalized} style={{ borderBottom: "1px solid rgba(148,163,184,0.08)" }}>
                    <BodyCell align="left">
                      <strong style={{ color: "#e2e8f0" }}>{row.algorithm}</strong>
                    </BodyCell>
                    <BodyCell>{compactNumber(row.miners, 0)}</BodyCell>
                    <BodyCell>
                      <strong style={{ color: row.btcPerDay > 0 ? "#34d399" : "#64748b" }}>
                        {btcValue(row.btcPerDay)}
                      </strong>
                    </BodyCell>
                    <BodyCell>
                      <strong style={{ color: row.usdPerDay > 0 ? "#fbbf24" : "#64748b" }}>
                        ${row.usdPerDay.toFixed(2)}
                      </strong>
                    </BodyCell>
                    <BodyCell align="left">
                      <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                        {row.coins && row.coins.length > 0 ? (
                          row.coins.map((coin) => (
                            <button
                              key={coin}
                              disabled={!availableCoins.has(coin.toUpperCase())}
                              onClick={() => openCoinModal(coin)}
                              style={{
                                border: "1px solid rgba(96,165,250,0.22)",
                                color: "#bfdbfe",
                                background: "rgba(37,99,235,0.12)",
                                borderRadius: "99px",
                                padding: "2px 8px",
                                fontSize: "10px",
                                cursor: "pointer",
                                transition: "all 0.2s",
                                opacity: availableCoins.has(coin.toUpperCase()) ? 1 : 0.4,
                              }}
                              onMouseEnter={(e) => {
                                if (!availableCoins.has(coin.toUpperCase())) return;
                                e.target.style.background = "rgba(37,99,235,0.25)";
                                e.target.style.borderColor = "rgba(96,165,250,0.5)";
                              }}
                              onMouseLeave={(e) => {
                                if (!availableCoins.has(coin.toUpperCase())) return;
                                e.target.style.background = "rgba(37,99,235,0.12)";
                                e.target.style.borderColor = "rgba(96,165,250,0.22)";
                              }}
                            >
                              {coin}
                            </button>
                          ))
                        ) : (
                          <span style={{ color: "#64748b", fontSize: "10px" }}>No coins</span>
                        )}
                      </div>
                    </BodyCell>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        // Original Mining Routes Table
        <div style={{ overflowX: "auto", border: "1px solid rgba(148,163,184,0.12)", borderRadius: "8px", background: "rgba(2,6,23,0.35)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", minWidth: "980px" }}>
            <thead>
              <tr style={{ color: "#94a3b8", borderBottom: "1px solid rgba(148,163,184,0.12)" }}>
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
                  <td colSpan="8" style={{ padding: "24px", textAlign: "center", color: "#94a3b8" }}>
                    Loading mining routes...
                  </td>
                </tr>
              ) : visibleRows.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ padding: "24px", textAlign: "center", color: "#94a3b8" }}>
                    No matching algorithm routes found.
                  </td>
                </tr>
              ) : (
                visibleRows.map((row, index) => (
                  <tr key={`${row.nicehashAlgo}-${index}`} style={{ borderBottom: "1px solid rgba(148,163,184,0.08)" }}>
                    <BodyCell align="left">
                      <strong style={{ color: "#e2e8f0" }}>{row.label}</strong>
                      <div style={{ color: "#64748b", marginTop: "2px" }}>{row.unit}/day comparison</div>
                    </BodyCell>
                    <BodyCell align="left">{row.nicehashAlgo}</BodyCell>
                    <BodyCell align="left">{row.mrrAlgo}</BodyCell>
                    <BodyCell align="left">
                      <strong style={{ color: row.miningDutchBtcPerDay > 0 ? "#34d399" : "#64748b" }}>
                        {btcValue(row.miningDutchBtcPerDay)}
                      </strong>
                      <div style={{ color: "#64748b", marginTop: "2px" }}>
                        {row.miningDutchMiners ? `${compactNumber(row.miningDutchMiners, 0)} MD miners` : row.miningDutchHashrate}
                      </div>
                    </BodyCell>
                    <BodyCell align="left" alt="nicehash-price">{btcValue(row.niceHashPrice)}</BodyCell>
                    <BodyCell align="left">
                      <span style={{ color: row.spread > 0 ? "#34d399" : row.spread < 0 ? "#f87171" : "#94a3b8", fontWeight: 700 }}>
                        {row.spread === null ? "N/A" : percentValue(row.spread)}
                      </span>
                    </BodyCell>
                    <BodyCell align="left">
                      <strong style={{ color: "#60a5fa" }}>{compactNumber(row.heroMiners, 0)}</strong>
                      <div style={{ color: "#64748b", marginTop: "2px" }}>{compactNumber(row.heroWorkers, 0)} workers</div>
                    </BodyCell>
                    <BodyCell align="left">
                      <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                        {row.heroCoins && row.heroCoins.length > 0 ? (
                          row.heroCoins.slice(0, 10).map((coin) => (
                            <button
                              key={coin}
                              disabled={!availableCoins.has(coin.toUpperCase())}
                              onClick={() => openCoinModal(coin)}
                              style={{
                                border: "1px solid rgba(96,165,250,0.22)",
                                color: "#bfdbfe",
                                background: "rgba(37,99,235,0.12)",
                                borderRadius: "99px",
                                padding: "2px 8px",
                                fontSize: "10px",
                                cursor: "pointer",
                                transition: "all 0.2s",
                                opacity: availableCoins.has(coin.toUpperCase()) ? 1 : 0.4,
                              }}
                              onMouseEnter={(e) => {
                                if (!availableCoins.has(coin.toUpperCase())) return;
                                e.target.style.background = "rgba(37,99,235,0.25)";
                                e.target.style.borderColor = "rgba(96,165,250,0.5)";
                              }}
                              onMouseLeave={(e) => {
                                if (!availableCoins.has(coin.toUpperCase())) return;
                                e.target.style.background = "rgba(37,99,235,0.12)";
                                e.target.style.borderColor = "rgba(96,165,250,0.22)";
                              }}
                            >
                              {coin}
                            </button>
                          ))
                        ) : (
                          <span style={{ color: "#64748b", fontSize: "10px" }}>No coins</span>
                        )}
                        {row.heroCoins && row.heroCoins.length > 10 && (
                          <span style={{ color: "#64748b", fontSize: "9px", padding: "2px 4px" }}>
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
      )}
    </section>
  );
}

// Helper Components (same as before)
function SummaryTile({ label, value, tone }) {
  return (
    <div style={{ border: "1px solid rgba(148,163,184,0.12)", borderRadius: "8px", background: "rgba(15,23,42,0.48)", padding: "12px" }}>
      <div style={{ color: "#64748b", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </div>
      <div style={{ color: tone, fontSize: "18px", fontWeight: 800, marginTop: "6px" }}>
        {value}
      </div>
    </div>
  );
}

export function HeaderCell({ children, align = "right" }) {
  return (
    <th style={{ padding: "9px 10px", textAlign: align, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
      {children}
    </th>
  );
}

export function BodyCell({ children, align = "right" }) {
  return (
    <td style={{ padding: "10px", textAlign: align, verticalAlign: "top", color: "#cbd5e1" }}>
      {children}
    </td>
  );
}