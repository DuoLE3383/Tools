// HeroMinersLookup.jsx — Wallet address lookup with multi-coin monitoring dashboard.
// Rendered through the shared MiningPanel shell for a consistent look.
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import ProfitAlert from './ProfitAlert.jsx';
import { PinIcon, TrashIcon, AlertIcon, TrendingUpIcon, BlocksIcon } from './Icons.jsx';
import MiningPanel, { PanelActions, StatTile, StatGrid } from './MiningPanel.jsx';

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
const COIN_GECKO_IDS = {
  CFX: ["conflux-token"],
  CONFLUX: ["conflux-token"],
  QRL: ["quantum-resistant-ledger"],
};

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
    const coinGeckoIds = COIN_GECKO_IDS[coinSymbol.toUpperCase()] || [coinSymbol.toLowerCase()];
    const priceData = coinGeckoIds.map((id) => coinPrices[id]).find((data) => Number(data?.usd) > 0) ||
      coinPrices[coinSymbol.toUpperCase()] || coinPrices[coinSymbol.toLowerCase()] ||
      Object.values(coinPrices).find(p => p.symbol?.toLowerCase() === symbol);
    const price = Number(priceData?.usd) || 0;
    console.debug(`[HeroMiners price] ${coinSymbol.toUpperCase()} -> ${coinGeckoIds.join(', ')} -> $${price}`, priceData);
    return price;
  }, [coinPrices]);

  const handleProfitUpdate = useCallback((pairId, profitData) => {
    setProfits(prev => ({ ...prev, [pairId]: profitData }));
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
    <MiningPanel
      icon={<PinIcon size={16} color="#60a5fa" />}
      accent="#60a5fa"
      title="HeroMiners"
      subtitle={`${pairs.length} coin${pairs.length !== 1 ? "s" : ""}${autoRefresh ? " · Auto 30s" : " · Manual"}${lastFetched ? ` · ${lastFetched.toLocaleTimeString()}` : ""}`}
      actions={
        <PanelActions
          autoRefresh={autoRefresh}
          onToggleAuto={toggleAutoRefresh}
          onRefresh={() => fetchAll(true)}
          loading={loading.size > 0}
          onClear={clearAll}
        />
      }
    >
      {/* Add new pair */}
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        <input value={coinInput} onChange={(e) => setCoinInput(e.target.value.toUpperCase())}
          placeholder="Coin (e.g. CFX)"
          style={{ flex: "0 0 80px", padding: "8px 10px", background: "rgba(0,0,0,0.25)",
            border: "1px solid rgba(148,163,184,0.15)", borderRadius: "8px", color: "#e2e8f0",
            fontSize: "10px" }} />
        <input value={addressInput} onChange={(e) => setAddressInput(e.target.value)}
          placeholder="Wallet address"
          style={{ flex: "1", minWidth: "160px", padding: "8px 10px", background: "rgba(0,0,0,0.25)",
            border: "1px solid rgba(148,163,184,0.15)", borderRadius: "8px", color: "#e2e8f0",
            fontSize: "10px" }}
          onKeyDown={(e) => { if (e.key === "Enter") addPair(); }} />
        <button className="btn-pro primary" onClick={addPair}
          disabled={!coinInput || !addressInput}
          style={{ padding: "8px 14px", fontSize: "10px" }}>
          + Add
        </button>
      </div>

      {/* Quick-start hints */}
      {pairs.length === 0 && (
        <div style={{ fontSize: "10px", color: "#64748b", padding: "12px", textAlign: "center", fontStyle: "italic" }}>
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

            const price = Number(data?.coinPrice) || getPrice(pair.coin);

            const pendingUsd = ps.pendingUSD || formatUsd(parseAmount(ps.pendingBalance) * price);
            const totalPaidUsd = ps.totalPaidUSD || formatUsd(parseAmount(ps.totalPaid) * price);
            const paid24hUsd = formatUsd(parseAmount(ps.paid24h) * price);

            return (
              <div key={pair.id} style={{
                background: "rgba(0,0,0,0.25)",
                borderRadius: "8px",
                border: `1px solid ${accent}33`,
                padding: "10px",
                display: "flex", flexDirection: "column", gap: "8px",
              }}>
                {/* Coin Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{
                      background: accent, color: "#000", fontWeight: 900,
                      padding: "2px 8px", borderRadius: "4px", fontSize: "10px",
                    }}>{pair.coin}</span>
                    <span style={{ color: "#94a3b8", fontSize: "10px", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {pair.address.slice(0, 12)}...{pair.address.slice(-6)}
                    </span>
                  </div>
                  <button onClick={() => removePair(pair.id)}
                    style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", padding: "2px", display: "flex" }}
                    title="Remove"
                    aria-label="Remove">
                    <TrashIcon size={14} />
                  </button>
                </div>

                {isLoading && <div style={{ color: "#fbbf24", fontSize: "10px" }}>Loading...</div>}
                {error && !isLoading && (
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#f87171", fontSize: "10px" }}>
                    <AlertIcon size={13} /> {error}
                  </div>
                )}

                {data && !isLoading && (
                  <>
                    {/* Hashrate row */}
                    <StatGrid cols={2}>
                      <StatTile label="Hashrate" value={ls.currentHashrate || "0"} color={accent} />
                      <StatTile label="Workers" value={`${ls.workersOnline || 0}`} color="#94a3b8" />
                      <StatTile label="Pending" value={ps.pendingBalance || "0"} sub={pendingUsd} color="#f59e0b" />
                      <StatTile label="Paid (24h)" value={ps.paid24h || "0"} sub={paid24hUsd} color="#a78bfa" />
                    </StatGrid>

                    {/* Mining Projections */}
                    {(() => {
                      const paid24hNum = parseAmount(ps.paid24h || '0');
                      const btcPriceCoin = Number(coinPrices?.bitcoin?.usd || coinPrices?.BTC?.usd || 0);
                      if (paid24hNum > 0) {
                        const daily = paid24hNum;
                        const weekly = daily * 7;
                        const monthly = daily * 30;
                        const fmtCoin = (v) => v >= 1000 ? v.toFixed(1) : v >= 1 ? v.toFixed(4) : v.toFixed(6);
                        const fmtBtc = (v) => btcPriceCoin > 0 ? `${(v * price / btcPriceCoin).toFixed(6)} BTC` : "N/A";
                        const fmtUsd = (v) => price > 0 ? `$${(v * price).toFixed(2)}` : "N/A";
                        return (
                          <div style={{
                            background: "rgba(0,0,0,0.2)",
                            borderRadius: "8px",
                            padding: "8px 10px",
                            fontSize: "10px",
                            border: "1px solid rgba(148,163,184,0.08)",
                          }}>
                            <div style={{ color: "#94a3b8", marginBottom: "6px", fontWeight: 700, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: "5px" }}>
                              <TrendingUpIcon size={12} /> Mining Projections
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
                                  { label: "Hourly", value: daily / 24 },
                                  { label: "Daily", value: daily },
                                  { label: "Weekly", value: weekly },
                                  { label: "Monthly", value: monthly },
                                ].map(r => (
                                  <tr key={r.label} style={{ borderBottom: "1px solid rgba(148,163,184,0.04)" }}>
                                    <td style={{ padding: "2px 4px", color: "#94a3b8", fontWeight: 700 }}>{r.label}</td>
                                    <td style={{ padding: "2px 4px", textAlign: "right", color: "#e2e8f0", fontFamily: "monospace" }}>{fmtCoin(r.value)}</td>
                                    <td style={{ padding: "2px 4px", textAlign: "right", color: (r.value * price) >= 1 ? "#fbbf24" : "#64748b", fontFamily: "monospace" }}>
                                      {fmtUsd(r.value)}
                                    </td>
                                    <td style={{ padding: "2px 4px", textAlign: "right", color: "#34d399", fontFamily: "monospace", fontWeight: 700 }}>
                                      {fmtBtc(r.value)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <div style={{ fontSize: "9px", color: "#64748b", marginTop: "4px", fontStyle: "italic" }}>
                              Based on 24h paid average
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {/* Shares + Blocks */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "10px", color: "#64748b", borderTop: "1px solid rgba(148,163,184,0.08)", paddingTop: "6px", marginTop: "2px" }}>
                      <span>Valid: {(ss.valid || 0).toLocaleString()} · Stale: {(ss.stale || 0).toLocaleString()}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        <BlocksIcon size={12} /> {bs.totalBlocks || 0}
                      </span>
                    </div>
                    <ProfitAlert
                      pair={pair}
                      onCall={onCall}
                      poolName="HeroMiners"
                      nhClient="ALL"
                      onProfitUpdate={handleProfitUpdate}
                    />
                  </>
                )}
                {!data && !isLoading && !error && (
                  <div style={{ color: "#64748b", fontSize: "11px", fontStyle: "italic", textAlign: "center", padding: "10px" }}>
                    Awaiting first fetch...
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </MiningPanel>
  );
}
