// KryptexCard.jsx - Address lookup card for Kryptex Pool
import { useState, useCallback, useMemo } from "react";
import KryptexProfitAlert from "./KryptexProfitAlert.jsx";

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


export default function KryptexCard({ onCall, coinPrices }) {
  const [coin, setCoin] = useState("etc");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [viewRaw, setViewRaw] = useState(false);

  const getPrice = useCallback((coinSymbol) => {
    if (!coinPrices || !coinSymbol) return 0;
    const symbol = coinSymbol.toLowerCase();
    // The prices object is keyed by coingecko ID, e.g., "conflux" for "CFX"
    // We need to find the right key.
    const priceData = Object.values(coinPrices).find(p => p.symbol?.toLowerCase() === symbol);
    return priceData?.usd || 0;
  }, [coinPrices]);

  const handleLookup = useCallback(async () => {
    if (!address || !coin) {
      setError("Coin and address are required.");
      return;
    }
    setLoading(true);
    setError("");
    setData(null);
    try {
      const result = await onCall("/api/v2/mining-stats/kryptex", {
        query: { coin: coin.trim().toLowerCase(), address: address.trim() },
        silent: true,
      });

      // Handle error response
      if (result?.error) {
        throw new Error(result.error);
      }

      // Response shape is { success: true, stats: {...}, coin, address, fetchedAt }
      if (result?.success && result?.stats) {
        setData(result);
        setLastUpdate(new Date());
      }
      // Handle wrapped shape { success: true, data: { stats: {...} } }
      else if (result?.success && result?.data?.stats) {
        setData(result.data);
        setLastUpdate(new Date());
      } else {
        throw new Error(result?.error || "Failed to fetch miner stats");
      }
    } catch (err) {
      setError(err.message);
      console.error("[KryptexCard] Error:", err.message);
    } finally {
      setLoading(false);
    }
  }, [address, coin, onCall]);

  const stats = data?.stats || {};
  const balance = stats.balance || {};
  const hashrate = stats.hashrate || {};
  const workers = stats.workers || {};

  const price = getPrice(coin);
  
  // Using Kryptex terminology: "Confirmed" is ready for payout, "Immature" is pending.
  const confirmed = (balance.unpaid || 0).toFixed(6);
  const confirmedUsd = formatUsd(parseAmount(confirmed) * price);
  const immature = (balance.immature || 0).toFixed(6);
  const immatureUsd = formatUsd(parseAmount(immature) * price);
  
  const totalPaid = (balance.totalPaid || 0).toFixed(6);
  const totalPaidUsd = formatUsd(parseAmount(totalPaid) * price);
  
  const reward7d = (balance.reward7d || 0).toFixed(6);
  const reward30d = (balance.reward30d || 0).toFixed(6);
  const reward30dUsd = formatUsd(parseAmount(reward30d) * price);

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h4 style={{ margin: 0, color: "#34d399", fontSize: "clamp(12px, 1vw, 14px)" }}>
            🟢 Kryptex Pool
          </h4>
          <div style={{ fontSize: "clamp(9px, 0.7vw, 11px)", color: "#94a3b8", marginTop: "2px" }}>
            Wallet address lookup
          </div>
        </div>
        {data && (
          <button
            className="btn-sm"
            onClick={() => setViewRaw(!viewRaw)}
            style={{ fontSize: "clamp(9px, 0.7vw, 11px)" }}
          >
            {viewRaw ? "Dashboard" : "Raw"}
          </button>
        )}
      </div>

      {/* Input Row */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <input
          value={coin}
          onChange={(e) => setCoin(e.target.value)}
          placeholder="Coin (e.g. etc)"
          style={{
            width: "100%",
            padding: "6px 10px",
            background: "rgba(0,0,0,0.25)",
            border: "1px solid rgba(148,163,184,0.15)",
            borderRadius: "6px",
            color: "#e2e8f0",
            fontSize: "clamp(10px, 0.8vw, 12px)",
            textTransform: "lowercase",
            boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", gap: "6px" }}>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Wallet address"
            style={{
              flex: "1",
              padding: "6px 10px",
              background: "rgba(0,0,0,0.25)",
              border: "1px solid rgba(148,163,184,0.15)",
              borderRadius: "6px",
              color: "#e2e8f0",
              fontSize: "clamp(10px, 0.8vw, 12px)",
            }}
          />
          <button className="btn-primary" onClick={handleLookup} disabled={loading} style={{ padding: "6px 14px", fontSize: "clamp(10px, 0.8vw, 12px)" }}>
            {loading ? "⏳" : "🔍"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ color: "#f87171", fontSize: "clamp(10px, 0.8vw, 12px)", padding: "4px 0" }}>
          ❌ {error}
        </div>
      )}

      {/* Profit Monitor — Kryptex-native, uses pool data instead of HeroMiners */}
      {data && !viewRaw && address && coin && (
        <KryptexProfitAlert
          pair={{ coin: coin.toUpperCase(), address }}
          onCall={onCall}
          nhClient="VN"
        />
      )}

      {/* Results Dashboard */}
      {data && !viewRaw && (
        <div style={{
          background: "rgba(0,0,0,0.18)",
          borderRadius: "8px",
          padding: "10px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}>          
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <MiniStat label="Current Hash" value={hashrate.current || "0 H/s"} color="#60a5fa" />
            <MiniStat label="Hashrate 24h" value={hashrate["24h"] || "0 H/s"} color="#34d399" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <MiniStatUSD label="Confirmed" value={confirmed} usd={confirmedUsd} color="#f59e0b" />
            <MiniStatUSD label="Immature" value={immature} usd={immatureUsd} color="#fbbf24" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <MiniStatUSD label="Total Paid" value={totalPaid} usd={totalPaidUsd} color="#34d399" />
            <MiniStatUSD label="30d Reward" value={reward30d} usd={reward30dUsd} color="#a78bfa" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <MiniStat label="Workers" value={`${workers.online || 0} online`} color="#94a3b8" />
            <MiniStat label="7d Reward" value={reward7d} color="#f472b6" />
          </div>

          {/* Workers table */}
          {stats.workerTable?.length > 0 && (
            <div>
              <div style={{ color: "#94a3b8", fontSize: "clamp(9px, 0.7vw, 11px)", marginBottom: "4px", fontWeight: 700 }}>
                Workers ({stats.workerTable.length})
              </div>
              <div style={{ maxHeight: "150px", overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "clamp(8px, 0.6vw, 10px)" }}>
                  <thead>
                    <tr style={{ color: "#64748b", borderBottom: "1px solid #334155" }}>
                      <th style={{ padding: "3px 4px", textAlign: "left" }}>Name</th>
                      <th style={{ padding: "3px 4px", textAlign: "right" }}>30m</th>
                      <th style={{ padding: "3px 4px", textAlign: "right" }}>24h</th>
                      <th style={{ padding: "3px 4px", textAlign: "right" }}>Valid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.workerTable.map((w, i) => (
                      <tr key={w.name || i} style={{ borderBottom: "1px solid #1e293b" }}>
                        <td style={{ padding: "2px 4px", color: "#e2e8f0" }}>{w.name}</td>
                        <td style={{ padding: "2px 4px", textAlign: "right", color: "#94a3b8" }}>{w.hashrate30m}</td>
                        <td style={{ padding: "2px 4px", textAlign: "right", color: "#94a3b8" }}>{w.hashrate24h}</td>
                        <td style={{ padding: "2px 4px", textAlign: "right", color: "#34d399" }}>{w.valid}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {lastUpdate && (
            <div style={{ fontSize: "clamp(8px, 0.6vw, 10px)", color: "#64748b", fontStyle: "italic" }}>
              Updated: {lastUpdate.toLocaleTimeString()}
            </div>
          )}
        </div>
      )}

      {/* Raw JSON */}
      {data && viewRaw && (
        <pre style={{
          background: "rgba(0,0,0,0.25)",
          borderRadius: "6px",
          padding: "10px",
          fontSize: "clamp(8px, 0.6vw, 10px)",
          maxHeight: "300px",
          overflow: "auto",
          color: "#94a3b8",
        }}>
          {JSON.stringify(data, null, 2)}
        </pre>
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
