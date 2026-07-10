// HeroMinersCard.jsx - Using ONLY mapping.js
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { fetchMiningStats } from "./miningStatsFetcher.js";
import { useRentedRigs } from "../mrr/RentedRigContext.jsx";
import { useCoinPrice } from "./CoinPriceContext.jsx";
import "./HeroMinersCard.css";

// ✅ ONLY import from mapping - single source of truth
import {
  getAlgoDisplayName, // For display names
  getAlgorithmUnit, // For units
  mapNiceHashToMRR, // For MRR mapping
  normalizeAlgoForNiceHash, // For NiceHash normalization
  normalizeAlgo, // For general normalization
  ALGO_MAPPING, // If you need the raw mapping
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
// MAIN COMPONENT - MERGED
// ============================================
export default function HeroMinersCard({
  onCall,
  pollInterval = 30000,
  initialCoin = "PPC",
  onPaste,
}) {
  // Global stats (version 1)
  const [heroGlobalStats, setHeroGlobalStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortConfig, setSortConfig] = useState({
    key: "btcPerDay",
    direction: "desc",
  });
  const [filterMiningOnly, setFilterMiningOnly] = useState(false);
  const pollTimerRef = useRef(null);
  const { rentedRigs } = useRentedRigs();

  // Address lookup (version 2)
  const [address, setAddress] = useState("");
  const [coin, setCoin] = useState(initialCoin);
  const [addressStats, setAddressStats] = useState(null);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressError, setAddressError] = useState("");
  const [lastUpdate, setLastUpdate] = useState(null);
  const [viewMode, setViewMode] = useState("dashboard");
  const [coinPrice, setCoinPrice] = useState(0);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceSource, setPriceSource] = useState("");

  const activeAlgos = useMemo(() => {
    const algos = new Set();
    if (!rentedRigs || rentedRigs.length === 0) return algos;
    rentedRigs.forEach((rig) => {
      const algoFields = [
        rig.algo,
        rig.algorithm,
        rig.type,
        rig.rig?.algo,
        rig.rig?.algorithm,
        rig.rig?.type,
        rig.hashrate?.algo,
        rig.hashrate?.algorithm,
        rig.name,
        rig.rig?.name,
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
      direction:
        current.key === key && current.direction === "desc" ? "asc" : "desc",
    }));
  }, []);

  // ============================================
  // FETCH GLOBAL STATS (version 1)
  // ============================================
  const fetchHeroMiners = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const stats = await fetchMiningStats(
        "herominers",
        "VN",
        null,
        null,
        20000,
        force,
      );
      if (stats?.success) {
        setHeroGlobalStats(stats);
        setError(null);
      } else {
        setHeroGlobalStats(null);
        setError(stats?.error || "Failed to fetch HeroMiners stats.");
      }
    } catch (err) {
      setHeroGlobalStats(null);
      setError(err.message || "Failed to fetch HeroMiners stats.");
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================
  // ADDRESS LOOKUP (version 2)
  // ============================================
  useEffect(() => {
    const saved = localStorage.getItem("herominers_last_address");
    if (saved) {
      try {
        const { address: savedAddress, coin: savedCoin } = JSON.parse(saved);
        setAddress(savedAddress);
        if (savedCoin) setCoin(savedCoin);
      } catch (e) {}
    }
  }, []);

  const fetchCoinPrice = useCallback(
    async (coinSymbol) => {
      if (!coinSymbol) return;
      setPriceLoading(true);
      try {
        const upperSymbol = coinSymbol.toUpperCase();
        const coinId = upperSymbol.toLowerCase();
        const result = await onCall("/api/v2/prices/coingecko", {
          query: { ids: coinId, vs_currency: "usd" },
          silent: true,
        });
        const data = result?.data || result || {};
        let price = 0;
        if (data[coinId] && data[coinId].usd !== undefined) {
          price = parseFloat(data[coinId].usd);
        } else if (
          data.data &&
          data.data[coinId] &&
          data.data[coinId].usd !== undefined
        ) {
          price = parseFloat(data.data[coinId].usd);
        } else if (data.price !== undefined) {
          price = parseFloat(data.price);
        } else if (data.usd !== undefined) {
          price = parseFloat(data.usd);
        }
        if (price > 0 && price < 100000) {
          setCoinPrice(price);
          setPriceSource("coingecko");
        }
      } catch (err) {
        console.error("Failed to fetch coin price:", err);
      } finally {
        setPriceLoading(false);
      }
    },
    [onCall],
  );

  const handleLookup = useCallback(async () => {
    if (!address || !coin) {
      setAddressError("Address and Coin are required.");
      return;
    }
    setAddressLoading(true);
    setAddressError("");
    setAddressStats(null);

    try {
      const result = await onCall("/api/v2/mining-stats/herominers/address", {
        query: { address: address.trim(), coin: coin.trim().toUpperCase() },
        silent: true,
      });

      if (result?.success) {
        setAddressStats(result.data);
        setLastUpdate(new Date());
        localStorage.setItem(
          "herominers_last_address",
          JSON.stringify({
            address: address.trim(),
            coin: coin.trim().toUpperCase(),
          }),
        );

        // Force price from coinStats
        if (result.data?.coinStats && result.data.coinStats.length > 0) {
          const upperCoin = coin.trim().toUpperCase();
          const mainCoin =
            result.data.coinStats.find((cs) => cs.coin === upperCoin) ||
            result.data.coinStats[0];
          if (mainCoin?.priceUsd !== undefined && mainCoin.priceUsd > 0) {
            const price = parseFloat(mainCoin.priceUsd);
            setCoinPrice(price);
            setPriceSource("coinStats");
          }
        }
        if (coinPrice === 0) {
          await fetchCoinPrice(coin.trim().toUpperCase());
        }
      } else {
        throw new Error(result?.error || "Failed to fetch address stats.");
      }
    } catch (err) {
      setAddressError(err.message);
    } finally {
      setAddressLoading(false);
    }
  }, [address, coin, onCall, fetchCoinPrice, coinPrice]);

  // ============================================
  // INITIAL EFFECTS
  // ============================================
  useEffect(() => {
    queueMicrotask(() => void fetchHeroMiners());
    if (pollInterval > 0) {
      pollTimerRef.current = setInterval(
        () => void fetchHeroMiners(),
        pollInterval,
      );
    }
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [fetchHeroMiners, pollInterval]);

  const refreshData = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = setInterval(
        () => void fetchHeroMiners(),
        pollInterval,
      );
    }
    void fetchHeroMiners(true);
  }, [fetchHeroMiners, pollInterval]);

  const heroStats = heroGlobalStats?.coinStats || [];

  // ============================================
  // RENDER
  // ============================================
  return (
    <div
      className="herominers-card"
      style={{
        padding: "15px",
        background: "rgba(255,255,255,0.02)",
        borderRadius: "12px",
        border: "1px solid rgba(255,255,255,0.05)",
        display: "grid",
        gap: "16px",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h3 style={{ margin: 0, color: "#e2e8f0" }}>🔍 HeroMiners</h3>
          <div style={{ fontSize: "11px", opacity: 0.6 }}>
            {heroGlobalStats?.miners
              ? `${formatNumber(heroGlobalStats.miners)} miners`
              : "Global pool snapshot"}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          
          <label
            style={{
              fontSize: "11px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              cursor: "pointer",
              color: "#94a3b8",
            }}
          >
            <input
              type="checkbox"
              checked={filterMiningOnly}
              onChange={(e) => setFilterMiningOnly(e.target.checked)}
            />
            Mining Only
            {filterMiningOnly && (
              <span style={{ fontSize: "10px", color: "#38bdf8" }}>
                ({activeAlgos.size} active)
              </span>
            )}
          </label>
          <button
            className="btn-pro secondary"
            onClick={refreshData}
            disabled={loading}
            style={{
              fontSize: "11px",
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            {loading ? "…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Global Stats Table */}
      <div
        className="code-block-content"
        style={{
          maxHeight: "380px",
          overflowY: "auto",
          fontSize: "11px",
          color: "#94a3b8",
          background: "rgba(0,0,0,0.2)",
          padding: "12px",
          borderRadius: "8px",
        }}
      >
        {loading && !error && (
          <div style={{ textAlign: "center", padding: "20px", opacity: 0.7 }}>
            Loading…
          </div>
        )}
        {error && (
          <div style={{ color: "#f87171", padding: "10px" }}>
            <div>{error}</div>
            <button
              onClick={refreshData}
              style={{
                marginTop: "8px",
                background: "rgba(255,255,255,0.1)",
                border: "1px solid #475569",
                color: "#e2e8f0",
                padding: "4px 12px",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Retry
            </button>
          </div>
        )}
        {!error && !loading && (
          <HeroMinersTable
            stats={heroStats}
            filterMiningOnly={filterMiningOnly}
            activeAlgos={activeAlgos}
            sortConfig={sortConfig}
            onSort={requestSort}
          />
        )}
      </div>

      {/* Address Lookup Section */}
      <div
        className="search-section"
        style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}
      >
        <input
          type="text"
          value={coin}
          onChange={(e) => setCoin(e.target.value.toUpperCase())}
          placeholder="Coin (e.g., QRL)"
          style={{
            flex: "1",
            minWidth: "50px",
            maxWidth: "60px",
            padding: "6px 10px",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid #334155",
            borderRadius: "6px",
            color: "#e2e8f0",
            fontSize: "12px",
          }}
        />
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Enter wallet address"
          style={{
            flex: "2",
            minWidth: "200px",
            padding: "6px 10px",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid #334155",
            borderRadius: "6px",
            color: "#e2e8f0",
            fontSize: "12px",
          }}
        />
        {onPaste && addressStats?.coinStats && (
          <button
            className="btn-primary"
            onClick={() => onPaste(addressStats.coinStats)}
            style={{ padding: "6px 12px" }}
          >
            📋 Paste
          </button>
        )}
        <button
          className="btn-primary"
          onClick={handleLookup}
          disabled={addressLoading}
          style={{ padding: "6px 12px" }}
        >
          {addressLoading ? "⏳" : "🔍 Lookup"}
        </button>
        {addressStats && (
            <button
              className="btn-sm"
              onClick={() =>
                setViewMode(viewMode === "dashboard" ? "raw" : "dashboard")
              }
            >
              {viewMode === "dashboard" ? "View Raw" : "View Dashboard"}
            </button>
          )}
      </div>

      {addressError && (
        <div
          style={{ color: "#f87171", padding: "4px 10px", fontSize: "12px" }}
        >
          ❌ {addressError}
        </div>
      )}
      {/* Address Stats Dashboard */}
      {addressStats && (
        <div
          style={{
            marginTop: "12px",
            borderTop: "1px solid #1e293b",
            paddingTop: "12px",
          }}
        >
          {viewMode === "dashboard" ? (
            <AddressLookupDashboard
              stats={addressStats}
              coin={coin}
              coinPrice={coinPrice}
              priceSource={priceSource}
              onPaste={onPaste}
              lastUpdate={lastUpdate}
            />
          ) : (
            <pre
              className="raw-data"
              style={{
                maxHeight: "400px",
                overflow: "auto",
                fontSize: "11px",
                background: "rgba(0,0,0,0.3)",
                padding: "12px",
                borderRadius: "8px",
              }}
            >
              {JSON.stringify(addressStats, null, 2)}
            </pre>
          )}
        </div>
      )}

    </div>
  );
}
