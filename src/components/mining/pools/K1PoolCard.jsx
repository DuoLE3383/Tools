// K1PoolCard.jsx - Multi-wallet monitor (HeroMinersLookup pattern)
import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import ProfitAlert from "../ProfitAlert.jsx";
import { loadStringFromStorage, saveStringToStorage } from "../../../core/storage.js";

const STORAGE_KEY = "k1pool_monitor_pairs";
const AUTO_REFRESH_KEY = "k1pool_auto_refresh";
const DEFAULT_POOL = "quaikawpowsolo";

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

const ACCENT_COLORS = ["#a78bfa", "#34d399", "#f59e0b", "#f472b6", "#38bdf8", "#60a5fa"];

function deriveCoin(pool) {
  if (!pool) return "RVN";
  const p = pool.toLowerCase();
  if (p.includes('quai')) return 'QUAI';
  if (p.includes('kawpow')) return 'RVN';
  if (p.includes('nexa')) return 'NEXA';
  if (p.includes('kas')) return 'KAS';
  if (p.includes('beam')) return 'BEAM';
  if (p.includes('xmr') || p.includes('monero')) return 'XMR';
  if (p.includes('zeph')) return 'ZEPH';
  if (p.includes('eth') || p.includes('etchash')) return 'ETC';
  if (p.includes('octopus')) return 'CFX';
  const match = p.match(/^([a-z]+)/);
  if (match) return match[1].toUpperCase();
  return 'RVN';
}

function MiniStat({ label, value, color }) {
  return (
    <div style={{ padding: "6px 8px", borderRadius: "6px", background: "rgba(0,0,0,0.15)" }}>
      <div style={{ color: "#64748b", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ color: color || "#e2e8f0", fontSize: "13px", fontWeight: 800, marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
    </div>
  );
}

export default function K1PoolCard({ onCall }) {
  const [pairs, setPairs] = useState(() => loadSavedPairs());
  const [poolInput, setPoolInput] = useState(DEFAULT_POOL);
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
        const result = await onCall("/api/v2/mining-stats/k1pool", {
          query: { pool: pair.pool, address: pair.address },
          silent: true,
        });
        if (result?.success && result?.data) {
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
    const pool = poolInput.trim().toLowerCase();
    const address = addressInput.trim();
    if (!pool || !address) return;
    const id = `${pool}:${address}`;
    if (pairs.some(p => p.id === id)) return;
    const newPairs = [...pairs, { id, pool, address }];
    setPairs(newPairs);
    savePairs(newPairs);
    setPoolInput(DEFAULT_POOL);
    setAddressInput("");
    setLoading(prev => new Set([...prev, id]));
    onCall("/api/v2/mining-stats/k1pool", {
      query: { pool, address },
      silent: true,
    }).then(result => {
      if (result?.success && result?.data) {
        setResults(prev => ({ ...prev, [id]: result.data }));
      } else {
        setErrors(prev => ({ ...prev, [id]: result?.error || "Failed" }));
      }
      setLoading(prev => { const next = new Set(prev); next.delete(id); return next; });
    }).catch(err => {
      setErrors(prev => ({ ...prev, [id]: err.message }));
      setLoading(prev => { const next = new Set(prev); next.delete(id); return next; });
    });
  }, [poolInput, addressInput, pairs, onCall]);

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
          <h4 style={{ margin: 0, color: "#a78bfa", fontSize: "clamp(12px, 1vw, 14px)" }}>
            🏛 K1Pool Monitor
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
        <input value={poolInput} onChange={(e) => setPoolInput(e.target.value.toLowerCase())}
          placeholder="Pool (e.g. quaikawpowsolo)"
          style={{ flex: "0 0 100px", padding: "6px 10px", background: "rgba(0,0,0,0.25)",
            border: "1px solid rgba(148,163,184,0.15)", borderRadius: "6px", color: "#e2e8f0",
            fontSize: "clamp(10px, 0.8vw, 12px)" }} />
        <input value={addressInput} onChange={(e) => setAddressInput(e.target.value)}
          placeholder="Wallet address"
          style={{ flex: "1", minWidth: "160px", padding: "6px 10px", background: "rgba(0,0,0,0.25)",
            border: "1px solid rgba(148,163,184,0.15)", borderRadius: "6px", color: "#e2e8f0",
            fontSize: "clamp(10px, 0.8vw, 12px)" }}
          onKeyDown={(e) => { if (e.key === "Enter") addPair(); }} />
        <button className="btn-primary" onClick={addPair} disabled={!poolInput || !addressInput}
          style={{ padding: "6px 14px", fontSize: "clamp(10px, 0.8vw, 12px)" }}>
          + Add
        </button>
      </div>

      {pairs.length === 0 && (
        <div style={{ fontSize: "clamp(9px, 0.7vw, 11px)", color: "#64748b", padding: "8px", textAlign: "center", fontStyle: "italic" }}>
          Add pool + address pairs to monitor. E.g. <strong>quaikawpowsolo</strong> + your wallet.
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
            const miner = data?.miner || {};
            const workerStats = {
              total: miner.workersTotal || 0,
              online: miner.workersOnline || 0,
              offline: miner.workersOffline || 0,
            };
            const coin = deriveCoin(pair.pool);

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
                      {coin}
                    </span>
                    <span style={{ color: "#94a3b8", fontSize: "9px", maxWidth: "100px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {pair.pool}
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
                      <MiniStat label="Hashrate" value={miner.curHashrateStr || "0 H/s"} color={accent} />
                      <MiniStat label="Avg (3h)" value={miner.avgHashrateStr || "0 H/s"} color="#34d399" />
                      <MiniStat label="Workers" value={`${workerStats.online} / ${workerStats.total}`} color="#e2e8f0" />
                      <MiniStat label="Luck" value={miner.soloLuck ? `${miner.soloLuck}%` : "N/A"} color="#f472b6" />
                    </div>
                    <ProfitAlert
                      pair={{ coin, address: pair.address }}
                      onCall={onCall}
                      poolName={`K1Pool-${pair.pool}`}
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
