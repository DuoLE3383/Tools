// KryptexCard.jsx - Multi-wallet monitor (HeroMinersLookup pattern)
import { useState, useCallback, useEffect, useRef } from "react";
import KryptexProfitAlert from "./KryptexProfitAlert.jsx";

const STORAGE_KEY = "kryptex_monitor_pairs";
const AUTO_REFRESH_KEY = "kryptex_auto_refresh";
const DEFAULT_COIN = "etc";

/** Must match VALID_COINS in server/miners/kryptex.js */
const SUPPORTED_COINS = ['etc', 'xmr', 'cfx', 'ergo', 'rvn', 'beam', 'flux', 'alephium', 'fb'];
const SUPPORTED_COINS_DISPLAY = SUPPORTED_COINS.map(c => c.toUpperCase()).join(', ');

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

const ACCENT_COLORS = ["#34d399", "#60a5fa", "#f59e0b", "#f472b6", "#a78bfa", "#38bdf8"];

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

function StatItem({ label, value, color }) {
  return (
    <div style={{ padding: "6px 8px", background: "rgba(0,0,0,0.15)", borderRadius: "6px" }}>
      <div style={{ color: "#64748b", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ color: color || "#e2e8f0", fontSize: "13px", fontWeight: 800, marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
    </div>
  );
}

function StatItemUSD({ label, value, usd, color }) {
  return (
    <div style={{ padding: "6px 8px", background: "rgba(0,0,0,0.15)", borderRadius: "6px" }}>
      <div style={{ color: "#64748b", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ color: color || "#e2e8f0", fontSize: "13px", fontWeight: 800, marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
      {usd && <div style={{ color: "#94a3b8", fontSize: "clamp(9px, 0.7vw, 11px)", marginTop: "2px" }}>{usd}</div>}
    </div>
  );
}

export default function KryptexCard({ onCall }) {
  const [pairs, setPairs] = useState(() => loadSavedPairs());
  const [coinInput, setCoinInput] = useState(DEFAULT_COIN);
  const [addressInput, setAddressInput] = useState("");
  const [results, setResults] = useState({});
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(new Set());
  const [autoRefresh, setAutoRefresh] = useState(() => loadAutoRefresh());
  const [lastFetched, setLastFetched] = useState(null);
  const pollTimerRef = useRef(null);

  const fetchAll = useCallback(async (forceRefresh = false) => {
    if (pairs.length === 0) return;
    setLoading(prev => new Set([...prev, ...pairs.map(p => p.id)]));
    const newResults = {};
    const newErrors = {};
    await Promise.all(pairs.map(async (pair) => {
      try {
        const result = await onCall("/api/v2/mining-stats/kryptex", {
          query: { coin: pair.coin, address: pair.address },
          silent: true,
        });
        if (result?.success && result?.stats) {
          newResults[pair.id] = result;
        } else if (result?.success && result?.data?.stats) {
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

  useEffect(() => {
    if (pairs.length > 0) fetchAll();
    if (autoRefresh && pairs.length > 0) {
      pollTimerRef.current = setInterval(() => fetchAll(), 30000);
    }
    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current); };
  }, [pairs.length, autoRefresh]);

  const addPair = useCallback(() => {
    const coin = coinInput.trim().toLowerCase();
    const address = addressInput.trim();
    if (!coin || !address) return;
    const id = `${coin}:${address}`;
    if (pairs.some(p => p.id === id)) return;
    const newPairs = [...pairs, { id, coin, address }];
    setPairs(newPairs);
    savePairs(newPairs);
    setCoinInput(DEFAULT_COIN);
    setAddressInput("");
    setLoading(prev => new Set([...prev, id]));
    onCall("/api/v2/mining-stats/kryptex", {
      query: { coin, address },
      silent: true,
    }).then(result => {
      if (result?.success && result?.stats) {
        setResults(prev => ({ ...prev, [id]: result }));
      } else if (result?.success && result?.data?.stats) {
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

  const toggleAutoRefresh = () => {
    setAutoRefresh(prev => { const next = !prev; saveAutoRefresh(next); return next; });
  };

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
          <h4 style={{ margin: 0, color: "#34d399", fontSize: "clamp(12px, 1vw, 14px)" }}>
            Kryptex Pool Monitor
          </h4>
          <div style={{ fontSize: "clamp(9px, 0.7vw, 11px)", color: "#94a3b8", marginTop: "2px" }}>
            {pairs.length} wallet{pairs.length !== 1 ? "s" : ""}
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
            <button className="btn-sm" onClick={() => fetchAll(true)} disabled={loading.size > 0} style={{ fontSize: "clamp(9px, 0.7vw, 11px)", padding: "3px 10px" }}>
              {loading.size > 0 ? "⏳" : "🔄"}
            </button>
            <button className="btn-sm" onClick={clearAll} style={{ fontSize: "clamp(9px, 0.7vw, 11px)", padding: "3px 10px", color: "#f87171" }}>
              ✕ Clear
            </button>
          </div>
        )}
      </div>

      {/* Add new pair */}
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        <input value={coinInput} onChange={(e) => setCoinInput(e.target.value.toLowerCase())}
          placeholder="Coin (e.g. etc)"
          style={{ flex: "0 0 70px", padding: "6px 10px", background: "rgba(0,0,0,0.25)",
            border: "1px solid rgba(148,163,184,0.15)", borderRadius: "6px", color: "#e2e8f0",
            fontSize: "clamp(10px, 0.8vw, 12px)" }} />
        <input value={addressInput} onChange={(e) => setAddressInput(e.target.value)}
          placeholder="Wallet address"
          style={{ flex: "1", minWidth: "160px", padding: "6px 10px", background: "rgba(0,0,0,0.25)",
            border: "1px solid rgba(148,163,184,0.15)", borderRadius: "6px", color: "#e2e8f0",
            fontSize: "clamp(10px, 0.8vw, 12px)" }}
          onKeyDown={(e) => { if (e.key === "Enter") addPair(); }} />
        <button className="btn-primary" onClick={addPair} disabled={!coinInput || !addressInput}
          style={{ padding: "6px 14px", fontSize: "clamp(10px, 0.8vw, 12px)" }}>
          + Add
        </button>
      </div>

      {pairs.length === 0 && (
        <div style={{ fontSize: "clamp(9px, 0.7vw, 11px)", color: "#64748b", padding: "8px", textAlign: "center", fontStyle: "italic" }}>
          Add coin + address pairs to monitor. E.g. <strong>etc</strong> + your wallet.
          {/* <div style={{ marginTop: "4px", color: "#34d399", fontSize: "8px" }}>
            Supported coins: {SUPPORTED_COINS_DISPLAY}
          </div> */}
        </div>
      )}

      {/* Dashboard grid */}
      {pairs.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "8px" }}>
          {pairs.map((pair, idx) => {
            const data = results[pair.id];
            const error = errors[pair.id];
            const isLoading = loading.has(pair.id);
            const accent = ACCENT_COLORS[idx % ACCENT_COLORS.length];

            const stats = data?.stats || {};
            const balance = stats.balance || {};
            const hashrate = stats.hashrate || {};
            const workers = stats.workers || {};

            const confirmed = (balance.unpaid || 0).toFixed(6);
            const totalPaid = (balance.totalPaid || 0).toFixed(6);
            const reward30d = (balance.reward30d || 0).toFixed(6);

            return (
              <div key={pair.id} style={{
                background: "rgba(0,0,0,0.25)",
                borderRadius: "8px",
                border: `1px solid ${accent}22`,
                padding: "10px",
                display: "flex", flexDirection: "column", gap: "6px",
              }}>
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ background: accent, color: "#000", fontWeight: 900, padding: "1px 8px", borderRadius: "4px", fontSize: "12px" }}>
                      {pair.coin.toUpperCase()}
                    </span>
                    <span style={{ color: "#64748b", fontSize: "10px", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {pair.address.slice(0, 10)}...{pair.address.slice(-4)}
                    </span>
                  </div>
                  <button onClick={() => removePair(pair.id)} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: "12px", padding: "0 4px" }}>
                    ✕
                  </button>
                </div>

                {isLoading && <div style={{ color: "#fbbf24", fontSize: "11px" }}>Loading...</div>}
                {error && !isLoading && <div style={{ color: "#f87171", fontSize: "10px" }}>⚠ {error}</div>}

                {data && !isLoading && (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "4px" }}>
                      <StatItem label="Hash" value={hashrate.current || "0 H/s"} color={accent} />
                      <StatItem label="24h" value={hashrate["24h"] || "0 H/s"} color="#60a5fa" />
                      <StatItemUSD label="Confirmed" value={confirmed} color="#f59e0b" />
                      <StatItemUSD label="30d Reward" value={reward30d} color="#a78bfa" />
                    </div>
                    <KryptexProfitAlert
                      pair={{ coin: pair.coin.toUpperCase(), address: pair.address }}
                      onCall={onCall}
                      nhClient="VN"
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
