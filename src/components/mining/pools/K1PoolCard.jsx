// K1PoolCard.jsx - Address lookup card for K1Pool
import { useState, useCallback, useMemo } from "react";

export default function K1PoolCard({ onCall }) {
  const [pool, setPool] = useState("quaikawpowsolo");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  const handleLookup = useCallback(async () => {
    if (!address || !pool) {
      setError("Pool and address are required.");
      return;
    }
    setLoading(true);
    setError("");
    setData(null);
    try {
      const result = await onCall("/api/v2/mining-stats/k1pool", {
        query: { pool: pool.trim(), address: address.trim() },
        silent: true,
      });
      if (result?.success && result?.data) {
        setData(result.data);
        setLastUpdate(new Date());
      } else {
        throw new Error(result?.error || "Failed to fetch miner stats");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [address, pool, onCall]);

  const miner = data?.miner || {};
  const workerStats = useMemo(() => ({
    total: miner.workersTotal || 0,
    online: miner.workersOnline || 0,
    offline: miner.workersOffline || 0,
  }), [miner]);

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
      <div>
        <h4 style={{ margin: 0, color: "#a78bfa", fontSize: "clamp(12px, 1vw, 14px)" }}>
          🏛 K1Pool
        </h4>
        <div style={{ fontSize: "clamp(9px, 0.7vw, 11px)", color: "#94a3b8", marginTop: "2px" }}>
          Wallet address lookup
        </div>
      </div>

      {/* Input Row */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <input
          value={pool}
          onChange={(e) => setPool(e.target.value)}
          placeholder="Pool slug (e.g. quaikawpowsolo)"
          style={{
            width: "100%",
            padding: "6px 10px",
            background: "rgba(0,0,0,0.25)",
            border: "1px solid rgba(148,163,184,0.15)",
            borderRadius: "6px",
            color: "#e2e8f0",
            fontSize: "clamp(10px, 0.8vw, 12px)",
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

      {/* Results Dashboard */}
      {data && (
        <div style={{
          background: "rgba(0,0,0,0.18)",
          borderRadius: "8px",
          padding: "10px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}>
          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))", gap: "6px" }}>
            <MiniBlock label="Workers" value={`${workerStats.online}/${workerStats.total}`} tone="#34d399" />
            <MiniBlock label="Hashrate" value={miner.curHashrateStr || "0 H/s"} tone="#60a5fa" />
            <MiniBlock label="Avg (3h)" value={miner.avgHashrateStr || "0 H/s"} tone="#fbbf24" />
            <MiniBlock label="Day Avg" value={miner.dayHashrateStr || "0 H/s"} tone="#818cf8" />
          </div>

          {/* Balance & Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "6px" }}>
            <StatItem label="Immature" value={miner.immatureBalance?.toFixed(2) || "0"} />
            <StatItem label="Paid (total)" value={miner.paidBalance?.toFixed(2) || "0"} />
            <StatItem label="Pending" value={miner.pendingBalance || "0"} />
            <StatItem label="24h Reward" value={miner["24hReward"] || "0"} />
            <StatItem label="Blocks" value={miner.totalBlocksFound || 0} />
            <StatItem label="Luck" value={miner.soloLuck ? `${miner.soloLuck}%` : "N/A"} />
          </div>

          {/* Last share */}
          {miner.lastShare && (
            <div style={{ fontSize: "clamp(8px, 0.6vw, 10px)", color: "#64748b" }}>
              Last share: {new Date((miner.lastShare > 1e12 ? miner.lastShare : miner.lastShare * 1000)).toLocaleString()}
            </div>
          )}

          {lastUpdate && (
            <div style={{ fontSize: "clamp(8px, 0.6vw, 10px)", color: "#64748b", fontStyle: "italic" }}>
              Updated: {lastUpdate.toLocaleTimeString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MiniBlock({ label, value, tone }) {
  return (
    <div style={{
      padding: "8px",
      borderRadius: "6px",
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(148,163,184,0.08)",
      textAlign: "center",
    }}>
      <div style={{ color: "#64748b", fontSize: "clamp(8px, 0.6vw, 10px)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </div>
      <div style={{ color: tone, fontSize: "clamp(12px, 1vw, 14px)", fontWeight: 800, marginTop: "3px" }}>
        {value}
      </div>
    </div>
  );
}

function StatItem({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 6px", fontSize: "clamp(9px, 0.7vw, 11px)" }}>
      <span style={{ color: "#94a3b8" }}>{label}</span>
      <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{value}</span>
    </div>
  );
}
