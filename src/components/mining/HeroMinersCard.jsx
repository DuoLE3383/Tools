// HeroMinersCard.jsx - UPGRADED with coin price modal integration
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { fetchMiningStats } from "./miningStatsFetcher.js";
import { useRentedRigs } from "../mrr/RentedRigContext.jsx";
import MiningDutch from "./MiningDutch.jsx";
import { useCoinPrice } from "./CoinPriceContext.jsx"; 

// Algorithm normalization - match HeroMiners format
function normalizeAlgorithm(algo) {
  if (!algo) return "";
  let cleaned = String(algo).toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  
  const mappings = {
    "cryptonight": ["cryptonight", "cryptonightv7", "cryptonightv8", "cryptonightheavy", "cryptonightr"],
    "randomx": ["randomx", "randomxmonero"],
    "kawpow": ["kawpow", "kawpowrvn"],
    "equihash": ["equihash", "equihash1445", "equihash1927", "equihash2109", "equihash1254"],
    "sha256": ["sha256", "sha256d"],
    "scrypt": ["scrypt"],
    "x11": ["x11"],
    "ethash": ["ethash", "daggerhashimoto"],
    "etchash": ["etchash", "etcfash"],
  };
  
  for (const [key, variants] of Object.entries(mappings)) {
    if (variants.includes(cleaned) || variants.some(v => cleaned.includes(v) || v.includes(cleaned))) {
      return key;
    }
  }
  return cleaned;
}

function getAlgoDisplayName(algo) {
  const displayNames = {
    "cryptonight": "CryptoNight",
    "randomx": "RandomX",
    "kawpow": "KawPow",
    "equihash": "Equihash",
    "sha256": "SHA256",
    "scrypt": "Scrypt",
    "x11": "X11",
    "ethash": "Ethash",
    "etchash": "Etchash",
  };
  return displayNames[algo] || algo.charAt(0).toUpperCase() + algo.slice(1);
}

function formatNumber(value, digits = 0) {
  const num = Number(value);
  return Number.isFinite(num)
    ? num.toLocaleString(undefined, { maximumFractionDigits: digits })
    : "0";
}

function HeroMinersTable({
  stats,
  filterMiningOnly,
  activeAlgos,
  sortConfig,
  onSort,
}) {
  const { openCoinModal } = useCoinPrice(); // <-- hook

  const rows = useMemo(() => {
    const list = Array.isArray(stats) ? [...stats] : [];
    const groupedByAlgo = new Map();
    
    list.forEach((coin) => {
      const rawAlgo = coin.algorithm || coin.algo || "Unknown";
      const normalized = normalizeAlgorithm(rawAlgo);
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
    
    let groupedList = Array.from(groupedByAlgo.values()).map(item => ({
      ...item,
      coins: Array.from(item.coinsSet).filter(Boolean).sort(),
    }));
    
    if (filterMiningOnly && activeAlgos.size > 0) {
      groupedList = groupedList.filter((item) => {
        const normalizedItem = item.normalized;
        for (const activeAlgo of activeAlgos) {
          const normalizedActive = normalizeAlgorithm(activeAlgo);
          if (normalizedItem === normalizedActive || 
              normalizedItem.includes(normalizedActive) ||
              normalizedActive.includes(normalizedItem)) {
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
                  <div style={{ 
                    fontSize: "9px", 
                    color: "#94a3b8", 
                    marginTop: "2px",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "4px"
                  }}>
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

export default function HeroMinersCard({ onCall, pollInterval = 30000 }) {
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

  const activeAlgos = useMemo(() => {
    const algos = new Set();
    if (!rentedRigs || rentedRigs.length === 0) return algos;
    rentedRigs.forEach((rig) => {
      const algoFields = [
        rig.algo, rig.algorithm, rig.type,
        rig.rig?.algo, rig.rig?.algorithm, rig.rig?.type,
        rig.hashrate?.algo, rig.hashrate?.algorithm,
        rig.name, rig.rig?.name,
      ];
      for (const field of algoFields) {
        if (field) {
          const algoStr = String(field);
          const parts = algoStr.split(/[,;\s|/]+/);
          parts.forEach(part => {
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

  useEffect(() => {
    queueMicrotask(() => void fetchHeroMiners());
    if (pollInterval > 0) {
      pollTimerRef.current = setInterval(() => void fetchHeroMiners(), pollInterval);
    }
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [fetchHeroMiners, pollInterval]);

  const refreshData = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = setInterval(() => void fetchHeroMiners(), pollInterval);
    }
    void fetchHeroMiners(true);
  }, [fetchHeroMiners, pollInterval]);

  const heroStats = heroGlobalStats?.coinStats || [];

  return (
    <div
      className="hero-miners-live-card"
      style={{
        padding: "15px",
        background: "rgba(255,255,255,0.02)",
        borderRadius: "12px",
        border: "1px solid rgba(255,255,255,0.05)",
        display: "grid",
        gap: "16px",
      }}
    >
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
          <h3 style={{ margin: 0, color: "#e2e8f0" }}>HeroMiners</h3>
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

      <MiningDutch onCall={onCall} />
    </div>
  );
}