// HeroMinersLookup.jsx - Wallet address lookup with multi-coin monitoring dashboard
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import ProfitAlert from './ProfitAlert.jsx';

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

function SummaryStat({ label, value, color }) {
  return (
    <div style={{
      padding: '10px',
      background: 'rgba(0,0,0,0.2)',
      borderRadius: '8px',
      textAlign: 'center'
    }}>
      <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>
        {label}
      </div>
      <div style={{ fontSize: '18px', fontWeight: 'bold', color: color || '#e2e8f0' }}>
        {value}
      </div>
    </div>
  );
}

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
  const [profits, setProfits] = useState({});
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

  const handleProfitUpdate = useCallback((pairId, profitData) => {
    setProfits(prev => ({
      ...prev,
      [pairId]: profitData,
    }));
  }, []);

  const profitSummary = useMemo(() => {
    return Object.values(profits).reduce((acc, p) => {
      if (p) {
        acc.netProfitPerHour += p.netProfitPerHour || 0;
        acc.nhTotalPaidUSD += p.nhTotalPaidUSD || 0;
        acc.paid24hUSD += p.paid24hUSD || 0;
      }
      return acc;
    }, { netProfitPerHour: 0, nhTotalPaidUSD: 0, paid24hUSD: 0 });
  }, [profits]);



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
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "4px" }}>
                      <MiniStat label="Hashrate" value={ls.currentHashrate || "0"} color={accent} />
                      <MiniStat label="Workers" value={`${ls.workersOnline || 0}`} color="#94a3b8" />
                      <MiniStatUSD label="Pending" value={ps.pendingBalance || "0"} usd={pendingUsd} color="#f59e0b" />
                      <MiniStatUSD label="Paid (24h)" value={ps.paid24h || "0"} usd={paid24hUsd} color="#a78bfa" />
                    </div>

                    {/* Mining Projections */}
                    {(() => {
                      const paid24hNum = parseAmount(ps.paid24h || '0');
                      // Get BTC price from coinPrices (bitcoin entry) or use fallback
                      const btcPriceCoin = Object.values(coinPrices || {}).find(p => p.symbol?.toLowerCase() === 'btc')?.usd || 64500;
                      if (paid24hNum > 0) {
                        const daily = paid24hNum;
                        const weekly = daily * 7;
                        const monthly = daily * 30;
                        const fmtCoin = (v) => v >= 1000 ? v.toFixed(1) : v >= 1 ? v.toFixed(4) : v.toFixed(6);
                        const fmtBtc = (v) => (v * price / btcPriceCoin).toFixed(6);
                        const fmtUsd = (v) => (v * price).toFixed(2);
                        return (
                          <div style={{
                            background: "rgba(0,0,0,0.2)",
                            borderRadius: "6px",
                            padding: "6px 8px",
                            fontSize: "9px",
                            border: "1px solid rgba(148,163,184,0.08)",
                          }}>
                            <div style={{ color: "#94a3b8", marginBottom: "4px", fontWeight: 700, fontSize: "8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                              📈 Mining Projections
                            </div>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                              <thead>
                                <tr style={{ color: "#64748b", borderBottom: "1px solid rgba(148,163,184,0.08)" }}>
                                  <th style={{ padding: "2px 4px", textAlign: "left", fontWeight: 600 }}></th>
                                  <th style={{ padding: "2px 4px", textAlign: "right", fontWeight: 600 }}>{pair.coin}</th>
                                  <th style={{ padding: "2px 4px", textAlign: "right", fontWeight: 600 }}>USD</th>
                                  <th style={{ padding: "2px 4px", textAlign: "right", fontWeight: 600 }}>BTC</th>
                                </tr>
                              </thead>
                              <tbody>
                                {[
                                  { label: "Daily", value: daily },
                                  { label: "Weekly", value: weekly },
                                  { label: "Monthly", value: monthly },
                                ].map(r => (
                                  <tr key={r.label} style={{ borderBottom: "1px solid rgba(148,163,184,0.04)" }}>
                                    <td style={{ padding: "2px 4px", color: "#94a3b8", fontWeight: 700 }}>{r.label}</td>
                                    <td style={{ padding: "2px 4px", textAlign: "right", color: "#e2e8f0", fontFamily: "monospace" }}>{fmtCoin(r.value)}</td>
                                    <td style={{ padding: "2px 4px", textAlign: "right", color: (r.value * price) >= 1 ? "#fbbf24" : "#64748b", fontFamily: "monospace" }}>
                                      ${fmtUsd(r.value)}
                                    </td>
                                    <td style={{ padding: "2px 4px", textAlign: "right", color: "#34d399", fontFamily: "monospace", fontWeight: 700 }}>
                                      {fmtBtc(r.value)} <span style={{ color: "#64748b", fontSize: "8px" }}>BTC</span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <div style={{ fontSize: "8px", color: "#64748b", marginTop: "3px", fontStyle: "italic" }}>
                              Based on 24h paid average
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {/* Shares + Blocks */}
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#64748b", borderTop: "1px solid rgba(148,163,184,0.08)", paddingTop: "4px", marginTop: '2px' }}>
                      <span>Valid: {(ss.valid || 0).toLocaleString()} · Stale: {(ss.stale || 0).toLocaleString()}</span>
                      <span>⛓ {bs.totalBlocks || 0}</span>
                    </div>
                    <ProfitAlert
                      pair={pair}
                      onCall={onCall}
                      poolName="HeroMiners"
                      nhClient="VN"
                      onProfitUpdate={handleProfitUpdate}
                    />
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
