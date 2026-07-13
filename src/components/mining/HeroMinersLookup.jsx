// HeroMinersLookup.jsx - Wallet address lookup with multi-coin monitoring dashboard
import { useState, useCallback, useEffect, useRef } from "react";

// Default saved pairs (loaded from localStorage)
const STORAGE_KEY = "herominers_monitor_pairs";
const AUTO_REFRESH_KEY = "herominers_auto_refresh";

function loadSavedPairs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function savePairs(pairs) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pairs)); } catch {}
}

function loadAutoRefresh() {
  try {
    const val = localStorage.getItem(AUTO_REFRESH_KEY);
    return val === null ? true : val === "true";
  } catch { return true; }
}

function saveAutoRefresh(val) {
  try { localStorage.setItem(AUTO_REFRESH_KEY, String(val)); } catch {}
}

const COIN_COLORS = ["#60a5fa", "#34d399", "#f59e0b", "#a78bfa", "#f472b6", "#38bdf8"];

function formatUsd(value) {
  const v = parseFloat(value);
  if (isNaN(v) || v <= 0) return "";
  if (v >= 1) return `$${v.toFixed(2)}`;
  if (v >= 0.0001) return `$${v.toFixed(4)}`;
  if (v >= 0.000001) return `$${v.toFixed(8)}`;
  return `$${v.toFixed(12)}`;
}

function parseAmount(str) {
  if (!str) return 0;
  return parseFloat(str.replace(/[^0-9.eE-]/g, "")) || 0;
}

export default function HeroMinersLookup({ onCall, coinPrices }) {
  const [pairs, setPairs] = useState(() => loadSavedPairs());
  const [coinInput, setCoinInput] = useState("CFX");
  const [addressInput, setAddressInput] = useState("");
  const [loading, setLoading] = useState(new Set());
  const [results, setResults] = useState({});
  const [errors, setErrors] = useState({});
  const [autoRefresh, setAutoRefresh] = useState(() => loadAutoRefresh());
  const [lastFetched, setLastFetched] = useState(null);
  const pollTimerRef = useRef(null);

  const getPrice = useCallback((coinSymbol) => {
    if (!coinPrices || !coinSymbol) return 0;
    const symbol = coinSymbol.toLowerCase();
    // The prices object is keyed by coingecko ID, e.g., "conflux" for "CFX"
    // We need to find the right key.
    const priceData = Object.values(coinPrices).find(p => p.symbol?.toLowerCase() === symbol);
    return priceData?.usd || 0;
  }, [coinPrices]);

  const fetchAll = useCallback(async (forceRefresh = false) => {
    if (pairs.length === 0) return;
    setLoading(prev => new Set([...prev, ...pairs.map(p => p.id)]));
    const newResults = {};
    const newErrors = {};
    await Promise.all(pairs.map(async (pair) => {
      try {
        const result = await onCall("/api/v2/mining-stats/herominers/address", {
          query: { address: pair.address, coin: pair.coin },
          silent: true,
        });
        if (result?.success) {
          newResults[pair.id] = result.data;
        } else {
          newErrors[pair.id] = result?.error || "Failed";
        }
      } catch (err) {
        newErrors[pair.id] = err.message;
      }
    }));
    setResults(prev => ({ ...prev, ...newResults }));
    setErrors(prev => ({ ...prev, ...newErrors }));
    setLoading(new Set());
    setLastFetched(new Date());
  }, [pairs, onCall]);

  // Auto-poll based on autoRefresh state
  useEffect(() => {
    if (pairs.length > 0) fetchAll();
    if (autoRefresh && pairs.length > 0) {
      pollTimerRef.current = setInterval(() => fetchAll(), 30000);
    }
    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current); };
  }, [pairs.length, autoRefresh]);

  const toggleAutoRefresh = () => {
    setAutoRefresh(prev => {
      const next = !prev;
      saveAutoRefresh(next);
      return next;
    });
  };

  const addPair = useCallback(() => {
    const coin = coinInput.trim().toUpperCase();
    const address = addressInput.trim();
    if (!coin || !address) return;
    const id = `${coin}:${address}`;
    if (pairs.some(p => p.id === id)) return;
    const newPairs = [...pairs, { id, coin, address }];
    setPairs(newPairs);
    savePairs(newPairs);
    setCoinInput("");
    setAddressInput("");
    setLoading(prev => new Set([...prev, id]));
    onCall("/api/v2/mining-stats/herominers/address", {
      query: { address, coin },
      silent: true,
    }).then(result => {
      if (result?.success) {
        setResults(prev => ({ ...prev, [id]: result.data }));
      } else {
        setErrors(prev => ({ ...prev, [id]: result?.error || "Failed" }));
      }
      setLoading(prev => { const next = new Set(prev); next.delete(id); return next; });
    }).catch(err => {
      setErrors(prev => ({ ...prev, [id]: err.message }));
      setLoading(prev => { const next = new Set(prev); next.delete(id); return next; });
    });
  }, [coinInput, addressInput, pairs, onCall]);

  const removePair = useCallback((id) => {
    const newPairs = pairs.filter(p => p.id !== id);
    setPairs(newPairs);
    savePairs(newPairs);
    setResults(prev => { const next = { ...prev }; delete next[id]; return next; });
    setErrors(prev => { const next = { ...prev }; delete next[id]; return next; });
  }, [pairs]);

  const clearAll = useCallback(() => {
    setPairs([]);
    savePairs([]);
    setResults({});
    setErrors({});
  }, []);

  return (
    <div style={{
      padding: "clamp(10px, 1vw, 14px)",
      background: "rgba(15,23,42,0.72)",
      border: "1px solid rgba(148,163,184,0.12)",
      borderRadius: "12px",
      boxShadow: "0 18px 40px rgba(0,0,0,0.20)",
      display: "flex",
      flexDirection: "column",
      gap: "10px",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h4 style={{ margin: 0, color: "#60a5fa", fontSize: "clamp(12px, 1vw, 14px)" }}>📍 HeroMiners Monitor</h4>
          <div style={{ fontSize: "clamp(9px, 0.7vw, 11px)", color: "#94a3b8", marginTop: "2px" }}>
            {pairs.length} coin{pairs.length !== 1 ? "s" : ""}
            {autoRefresh ? " · Auto 30s" : " · Manual"}
            {lastFetched && ` · ${lastFetched.toLocaleTimeString()}`}
          </div>
        </div>
        {pairs.length > 0 && (
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <label style={{ fontSize: "clamp(8px, 0.6vw, 10px)", display: "flex", alignItems: "center", gap: "3px", cursor: "pointer", color: autoRefresh ? "#34d399" : "#64748b" }}>
              <input type="checkbox" checked={autoRefresh} onChange={toggleAutoRefresh} style={{ width: "12px", height: "12px" }} />
              Auto
            </label>
            <button className="btn-sm" onClick={() => fetchAll(true)} disabled={loading.size > 0}
              style={{ fontSize: "clamp(9px, 0.7vw, 11px)", padding: "3px 10px" }}>
              {loading.size > 0 ? "⏳" : "🔄"}
            </button>
            <button className="btn-sm" onClick={clearAll}
              style={{ fontSize: "clamp(9px, 0.7vw, 11px)", padding: "3px 10px", color: "#f87171" }}>
              ✕ Clear
            </button>
          </div>
        )}
      </div>

      {/* Add new pair */}
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        <input value={coinInput} onChange={(e) => setCoinInput(e.target.value.toUpperCase())}
          placeholder="Coin (e.g. CFX)"
          style={{ flex: "0 0 70px", padding: "6px 10px", background: "rgba(0,0,0,0.25)",
            border: "1px solid rgba(148,163,184,0.15)", borderRadius: "6px", color: "#e2e8f0",
            fontSize: "clamp(10px, 0.8vw, 12px)" }} />
        <input value={addressInput} onChange={(e) => setAddressInput(e.target.value)}
          placeholder="Wallet address"
          style={{ flex: "1", minWidth: "180px", padding: "6px 10px", background: "rgba(0,0,0,0.25)",
            border: "1px solid rgba(148,163,184,0.15)", borderRadius: "6px", color: "#e2e8f0",
            fontSize: "clamp(10px, 0.8vw, 12px)" }}
          onKeyDown={(e) => { if (e.key === "Enter") addPair(); }} />
        <button className="btn-primary" onClick={addPair}
          disabled={!coinInput || !addressInput}
          style={{ padding: "6px 14px", fontSize: "clamp(10px, 0.8vw, 12px)" }}>
          + Add
        </button>
      </div>

      {/* Quick-start hints */}
      {pairs.length === 0 && (
        <div style={{ fontSize: "clamp(9px, 0.7vw, 11px)", color: "#64748b", padding: "8px", textAlign: "center", fontStyle: "italic" }}>
          Add coin/address pairs to monitor. E.g. <strong>CFX</strong> + your Conflux wallet address.
        </div>
      )}

      {/* Dashboard grid */}
      {pairs.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "8px" }}>
          {pairs.map((pair, idx) => {
            const data = results[pair.id];
            const error = errors[pair.id];
            const isLoading = loading.has(pair.id);
            const accent = COIN_COLORS[idx % COIN_COLORS.length];
            const ps = data?.paymentStats || {};
            const ls = data?.liveStats || {};
            const ss = data?.shareStats?.total || {};
            const bs = data?.blockStats || {};

            const price = getPrice(pair.coin);

            const pendingUsd = ps.pendingUSD || formatUsd(parseAmount(ps.pendingBalance) * price);
            const totalPaidUsd = ps.totalPaidUSD || formatUsd(parseAmount(ps.totalPaid) * price);
            const paid24hUsd = formatUsd(parseAmount(ps.paid24h) * price);

            return (
              <div key={pair.id} style={{
                background: "rgba(0,0,0,0.25)",
                borderRadius: "8px",
                border: `1px solid ${accent}22`,
                padding: "10px",
                display: "flex", flexDirection: "column", gap: "6px",
              }}>
                {/* Coin Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{
                      background: accent, color: "#000", fontWeight: 900,
                      padding: "1px 8px", borderRadius: "4px", fontSize: "12px",
                    }}>{pair.coin}</span>
                    <span style={{ color: "#94a3b8", fontSize: "10px", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {pair.address.slice(0, 12)}...{pair.address.slice(-6)}
                    </span>
                  </div>
                  <button onClick={() => removePair(pair.id)}
                    style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: "12px", padding: "0 4px" }}>
                    ✕
                  </button>
                </div>

                {isLoading && <div style={{ color: "#fbbf24", fontSize: "11px" }}>Loading...</div>}
                {error && !isLoading && <div style={{ color: "#f87171", fontSize: "10px" }}>⚠ {error}</div>}

                {data && !isLoading && (
                  <>
                    {/* Hashrate row */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
                      <MiniStat label="Hashrate" value={ls.currentHashrate || "0"} color={accent} />
                      <MiniStat label="Avg 24h" value={ls.avg24h || "0"} color="#34d399" />
                    </div>

                    {/* Pending + Total Paid with USD */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
                      <MiniStatUSD label="Pending" value={ps.pendingBalance || "0"} usd={pendingUsd} color="#f59e0b" />
                      <MiniStatUSD label="Total Paid" value={ps.totalPaid || "0"} usd={totalPaidUsd} color="#34d399" />
                    </div>

                    {/* 1h Profit + 24h Paid with USD */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
                      {(() => {
                        const paid24hNum = parseAmount(ps.paid24h || "0");
                        const paid24hVal = paid24hNum || 0;
                        const profit1h = paid24hVal / 24;
                        const profit1hUsd = formatUsd(profit1h * price);
                        return (
                          <>
                            <MiniStatUSD label="Profit 1h" value={`${profit1h.toFixed(4)} ${pair.coin}`} usd={profit1hUsd} color="#38bdf8" />
                            <MiniStatUSD label="24h Paid" value={ps.paid24h || "0"} usd={paid24hUsd} color="#a78bfa" />
                          </>
                        );
                      })()}
                    </div>

                    {/* Workers + Blocks */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
                      <MiniStat label="Workers" value={`${ls.workersOnline || 0}`} color="#94a3b8" />
                      <MiniStat label="Avg 1h" value={ls.avg1h || "0"} color="#f472b6" />
                    </div>

                    {/* Shares + Blocks */}
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#64748b", borderTop: "1px solid rgba(148,163,184,0.08)", paddingTop: "4px" }}>
                      <span>Valid: {(ss.valid || 0).toLocaleString()} · Stale: {(ss.stale || 0).toLocaleString()}</span>
                      <span>⛓ {bs.totalBlocks || 0}</span>
                    </div>
                  </>
                )}
                {!data && !isLoading && !error && (
                  <div style={{ color: "#64748b", fontSize: "10px", fontStyle: "italic", textAlign: "center", padding: "8px" }}>
                    Awaiting first fetch...
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, color }) {
  return (
    <div style={{
      padding: "6px 8px",
      borderRadius: "6px",
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(148,163,184,0.06)",
    }}>
      <div style={{ color: "#64748b", fontSize: "8px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </div>
      <div style={{ color, fontSize: "clamp(11px, 0.9vw, 13px)", fontWeight: 800, marginTop: "1px", overflow: "hidden", textOverflow: "ellipsis" }}>
        {value}
      </div>
    </div>
  );
}

function MiniStatUSD({ label, value, usd, color }) {
  return (
    <div style={{
      padding: "6px 8px",
      borderRadius: "6px",
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(148,163,184,0.06)",
    }}>
      <div style={{ color: "#64748b", fontSize: "8px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </div>
      <div style={{ color, fontSize: "clamp(11px, 0.9vw, 13px)", fontWeight: 800, marginTop: "1px", overflow: "hidden", textOverflow: "ellipsis" }}>
        {value}
      </div>
      {usd && (
        <div style={{ color: "#94a3b8", fontSize: "clamp(8px, 0.6vw, 10px)", marginTop: "1px" }}>
          {usd}
        </div>
      )}
    </div>
  );
}
