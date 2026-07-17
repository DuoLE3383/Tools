// HeroMinersCard.jsx - Profit estimates with NiceHash cost comparison
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { fetchMiningStats } from "./miningStatsFetcher.js";
import { useRentedRigs } from "../mrr/RentedRigContext.jsx";
import { useCoinPrice } from "./CoinPriceContext.jsx";
import "./HeroMinersCard.css";

import {
  getAlgoDisplayName,
  getAlgorithmUnit,
  normalizeAlgo,
  ALGO_MAPPING,
} from "../../core/mapping";

// ============================================
// NO LOCAL MAPPING - use imported functions
// ============================================

function formatNumber(value, digits = 0) {
  const num = Number(value);
  return Number.isFinite(num)
    ? num.toLocaleString(undefined, { maximumFractionDigits: digits })
    : "0";
}

// ============================================
// ADDRESS LOOKUP DASHBOARD (from version 2)
// ============================================
function AddressLookupDashboard({
  stats,
  coin,
  coinPrice,
  priceSource,
  onPaste,
  lastUpdate,
}) {
  if (!stats) return null;

  const {
    liveStats = {},
    paymentStats = {},
    shareStats = { total: {}, pool: {}, solo: {} },
    blockStats = {},
    charts = { hashrate: [], payments: [] },
    coinStats = [],
    workerStats = {},
    miningDetails = {},
  } = stats;

  const totalShares = shareStats.total || {};
  const validShares = miningDetails.validShares ?? totalShares.valid ?? 0;
  const staleShares = miningDetails.staleShares ?? totalShares.stale ?? 0;
  const invalidShares = miningDetails.invalidShares ?? totalShares.invalid ?? 0;
  const efficiency =
    miningDetails.efficiency ??
    (totalShares.efficiency ? totalShares.efficiency + "%" : "0.00%");
  const blocksFound = miningDetails.blocksFound ?? blockStats.totalBlocks ?? 0;
  const roundContribution =
    miningDetails.roundContribution ?? blockStats.roundContribution ?? "0.00%";
  const payoutEstimate =
    miningDetails.payoutEstimate ?? blockStats.payoutEstimate ?? "0.0000 QRL";
  const hashrate15m = liveStats.avg15m || liveStats.hashrate15m || "0 H/s";
  const hashrate1h = liveStats.avg1h || liveStats.hashrate1h || "0 H/s";

  // Parse amounts
  const parseAmount = (formatted) => {
    if (!formatted) return 0;
    const cleaned = formatted.replace(/[^0-9.]/g, "");
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  };

  const pendingNum = parseAmount(paymentStats.pendingBalance || "0");
  const totalPaidNum = parseAmount(paymentStats.totalPaid || "0");
  const paid24hNum = parseAmount(paymentStats.paid24h || "0");
  const paidWeekNum = parseAmount(paymentStats.paidWeek || "0");

  const isValidPrice = coinPrice > 0 && coinPrice < 100000;

  const formatUsd = (value) => {
    if (!value || value === 0) return "";
    if (value >= 1) return `$${value.toFixed(2)}`;
    if (value >= 0.0001) return `$${value.toFixed(4)}`;
    if (value >= 0.000001) return `$${value.toFixed(8)}`;
    return `$${value.toFixed(12)}`;
  };

  const formatNumberWithCommas = (value) => {
    if (!value || value === 0) return "0";
    if (value < 0.01 && value > 0) return value.toFixed(6);
    if (value < 1) return value.toFixed(4);
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  };

  return (
    <div className="herominers-dashboard">
      {/* Live Stats */}
      <div className="stats-section">
        <h4>📊 Live Stats</h4>
        <div className="stats-grid">
          <div className="stat-item">
            <span className="stat-label">Current Hashrate</span>
            <span className="stat-value highlight">
              {liveStats.currentHashrate || "0 H/s"}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Avg 15m</span>
            <span className="stat-value">{hashrate15m}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Avg 1h</span>
            <span className="stat-value">{hashrate1h}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Avg 6h</span>
            <span className="stat-value">{liveStats.avg6h || "0 H/s"}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Avg 24h</span>
            <span className="stat-value">{liveStats.avg24h || "0 H/s"}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Last Share</span>
            <span className="stat-value">{liveStats.lastShare || "N/A"}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Total Hashes</span>
            <span className="stat-value">{liveStats.totalHashes || "0"}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Workers Online</span>
            <span className="stat-value">
              {liveStats.workersOnline || 0} / {liveStats.workersTotal || 0}
            </span>
          </div>
        </div>
      </div>

      {/* Payments */}
      <div className="stats-section">
        <h4>💰 Payments</h4>
        <div className="stats-grid">
          <div className="stat-item">
            <span className="stat-label">Pending Balance</span>
            <span className="stat-value highlight">
              {paymentStats.pendingBalance || "0"}
              {isValidPrice && pendingNum > 0 && (
                <span
                  className="stat-value-usd"
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: "normal",
                  }}
                >
                  ({formatUsd(pendingNum * coinPrice)} USD)
                </span>
              )}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Total Paid</span>
            <span className="stat-value">
              {paymentStats.totalPaid || "0"}
              {isValidPrice && totalPaidNum > 0 && (
                <span
                  className="stat-value-usd"
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: "normal",
                  }}
                >
                  ({formatUsd(totalPaidNum * coinPrice)} USD)
                </span>
              )}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Last 24h Paid</span>
            <span className="stat-value">
              {paymentStats.paid24h || "0"}
              {isValidPrice && paid24hNum > 0 && (
                <span
                  className="stat-value-usd"
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: "normal",
                  }}
                >
                  ({formatUsd(paid24hNum * coinPrice)} USD)
                </span>
              )}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Last Week Paid</span>
            <span className="stat-value">
              {paymentStats.paidWeek || "0"}
              {isValidPrice && paidWeekNum > 0 && (
                <span
                  className="stat-value-usd"
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: "normal",
                  }}
                >
                  ({formatUsd(paidWeekNum * coinPrice)} USD)
                </span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Mining Details */}
      <div className="stats-section">
        <h4>⛏️ Mining Details</h4>
        <div className="stats-grid">
          <div className="stat-item">
            <span className="stat-label">Valid Shares</span>
            <span className="stat-value success">
              {validShares.toLocaleString()}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Stale Shares</span>
            <span className="stat-value warning">
              {staleShares.toLocaleString()}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Invalid Shares</span>
            <span className="stat-value error">
              {invalidShares.toLocaleString()}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Efficiency</span>
            <span className="stat-value">{efficiency}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Blocks Found</span>
            <span className="stat-value highlight">{blocksFound}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Round Contribution</span>
            <span className="stat-value">{roundContribution}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Payout Estimate</span>
            <span className="stat-value">{payoutEstimate}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Hashrate 1h</span>
            <span className="stat-value">{hashrate1h}</span>
          </div>
        </div>
      </div>

      {/* Worker Stats */}
      {workerStats && workerStats.total > 0 && (
        <div className="stats-section">
          <h4>👷 Worker Summary</h4>
          <div className="stats-grid">
            <div className="stat-item">
              <span className="stat-label">Total Workers</span>
              <span className="stat-value">{workerStats.total}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Pool Workers</span>
              <span className="stat-value">{workerStats.pool || 0}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Solo Workers</span>
              <span className="stat-value">{workerStats.solo || 0}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Total Hashrate</span>
              <span className="stat-value">
                {workerStats.totalHashrate || "0 H/s"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Update Info */}
      {lastUpdate && (
        <div className="update-info">
          Last updated: {lastUpdate.toLocaleString()}
          {isValidPrice && (
            <span style={{ marginLeft: "12px", color: "#34d399" }}>
              {coin} Price: ${coinPrice.toFixed(4)} ({priceSource})
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// TABLE COMPONENT
// ============================================
function HeroMinersTable({
  stats,
  filterMiningOnly,
  activeAlgos,
  sortConfig,
  onSort,
}) {
  const { openCoinModal } = useCoinPrice();

  const rows = useMemo(() => {
    const list = Array.isArray(stats) ? [...stats] : [];
    const groupedByAlgo = new Map();

    list.forEach((coin) => {
      const rawAlgo = coin.algorithm || coin.algo || "Unknown";

      // ✅ Use normalizeAlgo from mapping
      const normalized = normalizeAlgo(rawAlgo);

      // ✅ Use getAlgoDisplayName from mapping
      const displayName = getAlgoDisplayName(normalized);

      const coinName = coin.coin || coin.symbol || "";

      const existing = groupedByAlgo.get(normalized);
      if (existing) {
        existing.miners += Number(coin.miners) || 0;
        existing.btcPerDay += parseFloat(coin.btcPerDay || 0);
        existing.usdPerDay += parseFloat(coin.usdPerDay || 0);
        if (coinName) existing.coinsSet.add(coinName);
        if (coin.raw?.coin) existing.coinsSet.add(coin.raw.coin);
        if (coin.raw?.symbol) existing.coinsSet.add(coin.raw.symbol);
        existing.rawAlgos.push(rawAlgo);
      } else {
        const coinsSet = new Set();
        if (coinName) coinsSet.add(coinName);
        if (coin.raw?.coin) coinsSet.add(coin.raw.coin);
        if (coin.raw?.symbol) coinsSet.add(coin.raw.symbol);

        groupedByAlgo.set(normalized, {
          algorithm: displayName,
          rawAlgorithm: rawAlgo,
          normalized: normalized,
          miners: Number(coin.miners) || 0,
          btcPerDay: parseFloat(coin.btcPerDay || 0),
          usdPerDay: parseFloat(coin.usdPerDay || 0),
          coinsSet: coinsSet,
          rawAlgos: [rawAlgo],
        });
      }
    });

    let groupedList = Array.from(groupedByAlgo.values()).map((item) => ({
      ...item,
      coins: Array.from(item.coinsSet).filter(Boolean).sort(),
    }));

    if (filterMiningOnly && activeAlgos.size > 0) {
      groupedList = groupedList.filter((item) => {
        const normalizedItem = item.normalized;
        for (const activeAlgo of activeAlgos) {
          // ✅ Use normalizeAlgo from mapping
          const normalizedActive = normalizeAlgo(activeAlgo);
          if (
            normalizedItem === normalizedActive ||
            normalizedItem.includes(normalizedActive) ||
            normalizedActive.includes(normalizedItem)
          ) {
            return true;
          }
        }
        return false;
      });
    }

    return groupedList.sort((a, b) => {
      let aVal, bVal;
      if (sortConfig.key === "usdPerDay") {
        aVal = a.usdPerDay || 0;
        bVal = b.usdPerDay || 0;
      } else if (sortConfig.key === "miners") {
        aVal = a.miners || 0;
        bVal = b.miners || 0;
      } else if (sortConfig.key === "btcPerDay") {
        aVal = a.btcPerDay || 0;
        bVal = b.btcPerDay || 0;
      } else if (sortConfig.key === "algorithm") {
        aVal = String(a.algorithm || "").toLowerCase();
        bVal = String(b.algorithm || "").toLowerCase();
      } else {
        aVal = String(a[sortConfig.key] || "").toLowerCase();
        bVal = String(b[sortConfig.key] || "").toLowerCase();
      }
      if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [stats, filterMiningOnly, activeAlgos, sortConfig]);

  if (!rows.length) {
    return (
      <div style={{ opacity: 0.6, padding: "10px", textAlign: "center" }}>
        {filterMiningOnly && activeAlgos.size === 0
          ? "No active mining algorithms found. Please rent a rig first."
          : filterMiningOnly
            ? "No matching algorithms for your rented rigs."
            : "No data available from HeroMiners."}
      </div>
    );
  }

  return (
    <table
      style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}
    >
      <thead>
        <tr style={{ color: "#64748b", borderBottom: "1px solid #334155" }}>
          <th
            style={{ padding: "6px 4px", textAlign: "left", cursor: "pointer" }}
            onClick={() => onSort("algorithm")}
          >
            Algorithm
          </th>
          <th
            style={{
              padding: "6px 4px",
              textAlign: "right",
              cursor: "pointer",
            }}
            onClick={() => onSort("miners")}
          >
            Miners
          </th>
          <th
            style={{
              padding: "6px 4px",
              textAlign: "right",
              cursor: "pointer",
            }}
            onClick={() => onSort("usdPerDay")}
          >
            USD/Day
          </th>
          <th
            style={{
              padding: "6px 4px",
              textAlign: "right",
              cursor: "pointer",
            }}
            onClick={() => onSort("btcPerDay")}
          >
            BTC/Day
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((item, idx) => (
          <tr
            key={`${item.normalized}-${idx}`}
            style={{ borderBottom: "1px solid #1e293b" }}
          >
            <td style={{ padding: "6px 4px", color: "#e2e8f0" }}>
              <div>
                <strong>{item.algorithm}</strong>
                {item.coins && item.coins.length > 0 && (
                  <div
                    style={{
                      fontSize: "9px",
                      color: "#94a3b8",
                      marginTop: "2px",
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "4px",
                    }}
                  >
                    {item.coins.slice(0, 8).map((coin) => (
                      <button
                        key={coin}
                        onClick={() => openCoinModal(coin)}
                        style={{
                          border: "1px solid rgba(96,165,250,0.22)",
                          color: "#bfdbfe",
                          background: "rgba(37,99,235,0.12)",
                          borderRadius: "999px",
                          padding: "1px 6px",
                          fontSize: "9px",
                          cursor: "pointer",
                          transition: "all 0.2s",
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.background = "rgba(37,99,235,0.25)";
                          e.target.style.borderColor = "rgba(96,165,250,0.5)";
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.background = "rgba(37,99,235,0.12)";
                          e.target.style.borderColor = "rgba(96,165,250,0.22)";
                        }}
                      >
                        {coin}
                      </button>
                    ))}
                    {item.coins.length > 8 && (
                      <span style={{ color: "#64748b", fontSize: "9px" }}>
                        +{item.coins.length - 8} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            </td>
            <td style={{ padding: "6px 4px", textAlign: "right" }}>
              {formatNumber(item.miners, 0)}
            </td>
            <td style={{ padding: "6px 4px", textAlign: "right" }}>
              ${item.usdPerDay.toFixed(2)}
            </td>
            <td style={{ padding: "6px 4px", textAlign: "right" }}>
              {item.btcPerDay.toFixed(8)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ============================================
// PROFIT ESTIMATE TABLE
// ============================================
function ProfitEstimateTable({ estimates, onSort, sortConfig, filterMiningOnly, activeAlgos }) {
  const sorted = useMemo(() => {
    if (!estimates || !Array.isArray(estimates)) return [];
    let list = [...estimates];
    if (filterMiningOnly && activeAlgos.size > 0) {
      list = list.filter(e => [...activeAlgos].some(a => normalizeAlgo(a) === normalizeAlgo(e.algorithm)));
    }
    list.sort((a, b) => {
      const key = sortConfig.key;
      let aVal, bVal;
      if (key === 'netUsdPerDay') { aVal = a.netUsdPerDay || 0; bVal = b.netUsdPerDay || 0; }
      else if (key === 'roiPercent') { aVal = a.roiPercent ?? -9999; bVal = b.roiPercent ?? -9999; }
      else if (key === 'poolUsdPerDay') { aVal = a.poolUsdPerDay || 0; bVal = b.poolUsdPerDay || 0; }
      else if (key === 'nhCostUsdPerDay') { aVal = a.nhCostUsdPerDay || 0; bVal = b.nhCostUsdPerDay || 0; }
      else if (key === 'miners') { aVal = a.miners || 0; bVal = b.miners || 0; }
      else { aVal = String(a.algorithmDisplay || '').toLowerCase(); bVal = String(b.algorithmDisplay || '').toLowerCase(); }
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [estimates, sortConfig, filterMiningOnly, activeAlgos]);

  if (!sorted.length) {
    return <div style={{ padding: '10px', textAlign: 'center', color: '#64748b', fontSize: '10px' }}>No profit estimates available</div>;
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
      <thead>
        <tr style={{ background: '#000', color: '#f5f5f5' }}>
          {[
            { key: 'algorithmDisplay', label: 'ALGO' },
            { key: 'miners', label: 'MIN' },
            { key: 'poolUsdPerDay', label: 'REV $/D' },
            { key: 'nhCostUsdPerDay', label: 'NH $/D' },
            { key: 'netUsdPerDay', label: 'NET $/D' },
            { key: 'roiPercent', label: 'ROI%' },
          ].map(h => (
            <th key={h.key}
              style={{ padding: '4px', textAlign: h.key === 'algorithmDisplay' ? 'left' : 'right', fontWeight: 900, cursor: 'pointer' }}
              onClick={() => onSort(h.key)}>{h.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((e, i) => {
          const statusColor = e.status === 'profitable' ? '#34d399' : e.status === 'unprofitable' ? '#f87171' : '#94a3b8';
          return (
            <tr key={e.algorithm || i} style={{ borderBottom: '1px solid #000' }}>
              <td style={{ padding: '3px 4px', color: '#f5f5f5', fontWeight: 700 }}>{e.algorithmDisplay}</td>
              <td style={{ padding: '3px 4px', textAlign: 'right', color: '#94a3b8' }}>{formatNumber(e.miners, 0)}</td>
              <td style={{ padding: '3px 4px', textAlign: 'right', color: '#fbbf24' }}>${(e.poolUsdPerDay || 0).toFixed(2)}</td>
              <td style={{ padding: '3px 4px', textAlign: 'right', color: e.nhCostUsdPerDay > 0 ? '#f87171' : '#64748b' }}>{e.nhCostUsdPerDay > 0 ? `$${e.nhCostUsdPerDay.toFixed(2)}` : 'N/A'}</td>
              <td style={{ padding: '3px 4px', textAlign: 'right', fontWeight: 900, color: statusColor }}>
                ${(e.netUsdPerDay || 0).toFixed(2)}
              </td>
              <td style={{ padding: '3px 4px', textAlign: 'right', fontWeight: 900, color: e.roiPercent !== null ? (e.roiPercent > 0 ? '#34d399' : '#f87171') : '#64748b' }}>
                {e.roiPercent !== null ? `${e.roiPercent.toFixed(0)}%` : '-'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ============================================
// MAIN COMPONENT - GLOBAL SNAPSHOT + PROFIT ESTIMATES
// ============================================
export default function HeroMinersCard({
  onCall,
  pollInterval = 30000,
}) {
  const [heroGlobalStats, setHeroGlobalStats] = useState(null);
  const [profitEstimates, setProfitEstimates] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: "netUsdPerDay", direction: "desc" });
  const [filterMiningOnly, setFilterMiningOnly] = useState(false);
  const [viewMode, setViewMode] = useState('revenue'); // 'revenue' or 'profit'
  const pollTimerRef = useRef(null);
  const { rentedRigs } = useRentedRigs();

  const activeAlgos = useMemo(() => {
    const algos = new Set();
    if (!rentedRigs || rentedRigs.length === 0) return algos;
    rentedRigs.forEach((rig) => {
      const algoFields = [
        rig.algo, rig.algorithm, rig.type, rig.rig?.algo, rig.rig?.algorithm,
        rig.rig?.type, rig.hashrate?.algo, rig.hashrate?.algorithm, rig.name, rig.rig?.name,
      ];
      for (const field of algoFields) {
        if (field) {
          const algoStr = String(field);
          const parts = algoStr.split(/[,;\s|/]+/);
          parts.forEach((part) => {
            const cleaned = part.trim();
            if (cleaned && cleaned.length > 1) algos.add(cleaned);
          });
        }
      }
    });
    return algos;
  }, [rentedRigs]);

  const requestSort = useCallback((key) => {
    setSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === "desc" ? "asc" : "desc",
    }));
  }, []);

  const fetchAllData = useCallback(async (force = false) => {
    setLoading(true);
    try {
      // Fetch both in parallel
      const [statsResult, profitResult] = await Promise.allSettled([
        (async () => {
          const stats = await fetchMiningStats("herominers", "VN", null, null, 20000, force);
          return stats;
        })(),
        (async () => {
          const res = await fetch(`/api/v2/mining-stats/herominers/profit-estimates?force=${force}`, {
            signal: AbortSignal.timeout(25000),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return await res.json();
        })(),
      ]);

      if (statsResult.status === 'fulfilled' && statsResult.value?.success) {
        setHeroGlobalStats(statsResult.value);
      }
      if (profitResult.status === 'fulfilled' && profitResult.value?.success) {
        setProfitEstimates(profitResult.value);
      }
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void fetchAllData());
    if (pollInterval > 0) {
      pollTimerRef.current = setInterval(() => void fetchAllData(), pollInterval);
    }
    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current); };
  }, [fetchAllData, pollInterval]);

  const refreshData = useCallback(() => {
    if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = setInterval(() => void fetchAllData(), pollInterval); }
    void fetchAllData(true);
  }, [fetchAllData, pollInterval]);

  const heroStats = heroGlobalStats?.coinStats || [];
  const estimates = profitEstimates?.estimates || [];

  // Count profitable algos
  const profitableCount = estimates.filter(e => e.status === 'profitable').length;

  return (
    <div style={{ padding: "12px", background: "#1e1e2e", border: "3px solid #000", boxShadow: "6px 6px 0px #000", display: "flex", flexDirection: "column", gap: "8px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        <div>
          <h4 style={{ margin: 0, color: "#38bdf8", fontSize: "14px", fontWeight: 900, textTransform: "uppercase" }}>
            🔍 HEROMINERS PROFIT
          </h4>
          <div style={{ fontSize: "9px", color: "#94a3b8", fontWeight: 700, display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {heroGlobalStats?.miners ? `${formatNumber(heroGlobalStats.miners)} miners` : ''}
            {profitableCount > 0 && (
              <span style={{ color: '#34d399' }}>{profitableCount} profitable</span>
            )}
            {profitEstimates?.btcPrice > 0 && (
              <span style={{ color: '#fbbf24' }}>BTC: ${profitEstimates.btcPrice.toLocaleString()}</span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          {/* View mode toggle */}
          <div style={{ display: 'flex', border: '2px solid #000', borderRadius: '2px', overflow: 'hidden' }}>
            <button onClick={() => setViewMode('revenue')} style={{
              fontSize: '8px', fontWeight: 900, padding: '2px 6px',
              background: viewMode === 'revenue' ? '#38bdf8' : '#2d2d3d',
              color: viewMode === 'revenue' ? '#000' : '#94a3b8',
              border: 'none', cursor: 'pointer',
            }}>REV</button>
            <button onClick={() => setViewMode('profit')} style={{
              fontSize: '8px', fontWeight: 900, padding: '2px 6px',
              background: viewMode === 'profit' ? '#34d399' : '#2d2d3d',
              color: viewMode === 'profit' ? '#000' : '#94a3b8',
              border: 'none', cursor: 'pointer',
            }}>PROFIT</button>
          </div>
          <label style={{ fontSize: "9px", display: "flex", alignItems: "center", gap: "4px", cursor: "pointer", color: "#94a3b8", fontWeight: 700 }}>
            <input type="checkbox" checked={filterMiningOnly} onChange={(e) => setFilterMiningOnly(e.target.checked)} />
            MY RIGS{filterMiningOnly && <span style={{ color: "#38bdf8" }}>({activeAlgos.size})</span>}
          </label>
          <button onClick={refreshData} disabled={loading} style={{ fontSize: "9px", fontWeight: 900, padding: "2px 8px", background: "#2d2d3d", border: "2px solid #000", color: "#f5f5f5", cursor: "pointer" }}>
            {loading ? "⏳" : "⟳"}
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ maxHeight: "320px", overflowY: "auto", background: "#16161e", border: "2px solid #000" }}>
        {loading && !error && <div style={{ padding: "16px", textAlign: "center", color: "#64748b", fontWeight: 700, fontSize: "10px" }}>LOADING...</div>}
        {error && (
          <div style={{ padding: "10px", textAlign: "center" }}>
            <div style={{ color: "#f87171", fontSize: "10px", fontWeight: 700 }}>{error}</div>
            <button onClick={refreshData} style={{ marginTop: "4px", fontSize: "9px", fontWeight: 900, padding: "2px 8px", background: "#2d2d3d", border: "2px solid #000", color: "#f5f5f5", cursor: "pointer" }}>RETRY</button>
          </div>
        )}
        {!error && !loading && viewMode === 'revenue' && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9px" }}>
            <thead>
              <tr style={{ background: "#000", color: "#f5f5f5" }}>
                {["ALGO", "MIN", "USD/D", "BTC/D"].map((h, i) => (
                  <th key={h} style={{ padding: "4px", textAlign: i === 0 ? "left" : "right", fontWeight: 900, cursor: "pointer" }}
                    onClick={() => requestSort(i === 0 ? "algorithm" : i === 1 ? "miners" : i === 2 ? "usdPerDay" : "btcPerDay")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(filterMiningOnly && activeAlgos.size > 0
                ? heroStats.filter((item) => { const n = normalizeAlgo(item.algorithm || ""); return [...activeAlgos].some(a => n.includes(normalizeAlgo(a)) || normalizeAlgo(a).includes(n)); })
                : heroStats
              ).sort((a, b) => (b.btcPerDay || 0) - (a.btcPerDay || 0)).slice(0, 20).map((item, i) => (
                <tr key={`${item.algorithm || i}`} style={{ borderBottom: "1px solid #000" }}>
                  <td style={{ padding: "3px 4px", color: "#f5f5f5", fontWeight: 700 }}>{getAlgoDisplayName(item.algorithm || item.algo || "N/A")}</td>
                  <td style={{ padding: "3px 4px", textAlign: "right", color: "#94a3b8", fontWeight: 700 }}>{formatNumber(item.miners, 0)}</td>
                  <td style={{ padding: "3px 4px", textAlign: "right", color: "#fbbf24", fontWeight: 700 }}>${(item.usdPerDay || 0).toFixed(2)}</td>
                  <td style={{ padding: "3px 4px", textAlign: "right", fontWeight: 900, color: (item.btcPerDay || 0) > 0 ? "#34d399" : "#64748b" }}>{(item.btcPerDay || 0).toFixed(8)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!error && !loading && viewMode === 'profit' && (
          <ProfitEstimateTable
            estimates={estimates}
            onSort={requestSort}
            sortConfig={sortConfig}
            filterMiningOnly={filterMiningOnly}
            activeAlgos={activeAlgos}
          />
        )}
      </div>

      {/* Legend */}
      {viewMode === 'profit' && (
        <div style={{ fontSize: '8px', color: '#64748b', display: 'flex', gap: '12px', padding: '2px 0' }}>
          <span>REV: Pool revenue</span>
          <span>NH: NiceHash cost</span>
          <span style={{ color: '#34d399' }}>NET: Revenue - Cost</span>
          <span style={{ color: '#fbbf24' }}>ROI: Return on Investment</span>
        </div>
      )}
    </div>
  );
}
