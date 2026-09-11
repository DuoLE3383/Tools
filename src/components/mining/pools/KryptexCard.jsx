// KryptexCard.jsx — Multi-wallet monitor rendered through the shared MiningPanel.
import { useState, useCallback, useEffect, useRef } from "react";
import KryptexProfitAlert from "./KryptexProfitAlert.jsx";
import { ChipIcon, TrashIcon, AlertIcon } from "../Icons.jsx";
import MiningPanel, { PanelActions, StatTile, StatGrid } from "../MiningPanel.jsx";

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
    <MiningPanel
      icon={<ChipIcon size={16} color="#34d399" />}
      accent="#34d399"
      title="Kryptex"
      subtitle={`${pairs.length} wallet${pairs.length !== 1 ? "s" : ""}${autoRefresh ? " · Auto 30s" : " · Manual"}${lastFetched ? ` · ${lastFetched.toLocaleTimeString()}` : ""}`}
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
        <input value={coinInput} onChange={(e) => setCoinInput(e.target.value.toLowerCase())}
          placeholder="Coin (e.g. etc)"
          style={{ flex: "0 0 80px", padding: "8px 10px", background: "rgba(0,0,0,0.25)",
            border: "1px solid rgba(148,163,184,0.15)", borderRadius: "8px", color: "#e2e8f0",
            fontSize: "12px" }} />
        <input value={addressInput} onChange={(e) => setAddressInput(e.target.value)}
          placeholder="Wallet address"
          style={{ flex: "1", minWidth: "160px", padding: "8px 10px", background: "rgba(0,0,0,0.25)",
            border: "1px solid rgba(148,163,184,0.15)", borderRadius: "8px", color: "#e2e8f0",
            fontSize: "12px" }}
          onKeyDown={(e) => { if (e.key === "Enter") addPair(); }} />
        <button className="btn-pro primary" onClick={addPair} disabled={!coinInput || !addressInput}
          style={{ padding: "8px 14px", fontSize: "12px" }}>
          + Add
        </button>
      </div>

      {pairs.length === 0 && (
        <div style={{ fontSize: "12px", color: "#64748b", padding: "12px", textAlign: "center", fontStyle: "italic" }}>
          Add coin + address pairs to monitor. E.g. <strong>etc</strong> + your wallet.
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
                border: `1px solid ${accent}33`,
                padding: "10px",
                display: "flex", flexDirection: "column", gap: "8px",
              }}>
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ background: accent, color: "#000", fontWeight: 900, padding: "2px 8px", borderRadius: "4px", fontSize: "12px" }}>
                      {pair.coin.toUpperCase()}
                    </span>
                    <span style={{ color: "#64748b", fontSize: "11px", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {pair.address.slice(0, 10)}...{pair.address.slice(-4)}
                    </span>
                  </div>
                  <button onClick={() => removePair(pair.id)} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", padding: "2px", display: "flex" }} title="Remove" aria-label="Remove">
                    <TrashIcon size={14} />
                  </button>
                </div>

                {isLoading && <div style={{ color: "#fbbf24", fontSize: "11px" }}>Loading...</div>}
                {error && !isLoading && (
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#f87171", fontSize: "11px" }}>
                    <AlertIcon size={13} /> {error}
                  </div>
                )}

                {data && !isLoading && (
                  <>
                    <StatGrid cols={2}>
                      <StatTile label="Hash" value={hashrate.current || "0 H/s"} color={accent} />
                      <StatTile label="24h" value={hashrate["24h"] || "0 H/s"} color="#60a5fa" />
                      <StatTile label="Confirmed" value={confirmed} color="#f59e0b" />
                      <StatTile label="30d Reward" value={reward30d} color="#a78bfa" />
                    </StatGrid>
                    <KryptexProfitAlert
                      pair={{ coin: pair.coin.toUpperCase(), address: pair.address }}
                      onCall={onCall}
                      nhClient="ALL"
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
