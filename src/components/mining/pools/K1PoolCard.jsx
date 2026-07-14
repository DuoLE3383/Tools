// K1PoolCard.jsx - Address lookup card for K1Pool
import { useState, useCallback, useMemo } from "react";
import ProfitAlert from "../ProfitAlert.jsx";
import { loadStringFromStorage, saveStringToStorage } from "../../../core/storage.js";

const POOL_STORAGE_KEY = "k1pool_monitor_pool";
const ADDRESS_STORAGE_KEY = "k1pool_monitor_address";

// Re-implementing MiniStat and StatItem for consistent styling, similar to KryptexCard.
function MiniStat({ label, value, color }) {
  return (
    <div style={{
      padding: "6px 8px",
      borderRadius: "6px",
      background: "rgba(0,0,0,0.15)",
    }}>
      <div style={{
        color: '#64748b',
        fontSize: '9px',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}>
        {label}
      </div>
      <div style={{
        color: color || '#e2e8f0',
        fontSize: '13px',
        fontWeight: 800,
        marginTop: '2px',
        overflow: "hidden", textOverflow: "ellipsis"
      }}>
        {value}
      </div>
    </div>
  );
}

function StatItem({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 6px", fontSize: "clamp(10px, 0.8vw, 12px)", borderBottom: '1px solid rgba(148,163,184,0.05)' }}>
      <span style={{ color: "#94a3b8" }}>{label}</span>
      <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

export default function K1PoolCard({ onCall }) {
  const [pool, setPool] = useState(() => loadStringFromStorage(POOL_STORAGE_KEY, "quaikawpowsolo"));
  const [address, setAddress] = useState(() => loadStringFromStorage(ADDRESS_STORAGE_KEY, ""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [viewRaw, setViewRaw] = useState(false);

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

  // Derive a likely coin from pool slug (e.g., "quaikawpowsolo" -> "QUAI")
  const derivedCoin = useMemo(() => {
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
    // Default: try coin name at start (e.g., "cfxsolo" -> "CFX")
    const match = p.match(/^([a-z]+)/);
    if (match) return match[1].toUpperCase();
    return 'RVN';
  }, [pool]);

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
          <h4 style={{ margin: 0, color: "#a78bfa", fontSize: "clamp(12px, 1vw, 14px)" }}>
            🏛 K1Pool
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
          value={pool}
          onChange={(e) => {
            const newPool = e.target.value;
            setPool(newPool);
            saveStringToStorage(POOL_STORAGE_KEY, newPool);
          }}
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
            onChange={(e) => {
              const newAddress = e.target.value;
              setAddress(newAddress);
              saveStringToStorage(ADDRESS_STORAGE_KEY, newAddress);
            }}
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

      {/* Profit Monitor — same profit-alert pattern as HeroMinersLookup/KryptexCard */}
      {data && !viewRaw && address && (
        <ProfitAlert
          pair={{ coin: derivedCoin, address }}
          onCall={onCall}
          poolName="K1Pool"
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
            <MiniStat label="Hashrate" value={miner.curHashrateStr || "0 H/s"} color="#60a5fa" />
            <MiniStat label="Avg (3h)" value={miner.avgHashrateStr || "0 H/s"} color="#34d399" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <MiniStat label="Workers" value={`${workerStats.online} / ${workerStats.total}`} color="#e2e8f0" />
            <MiniStat label="Luck" value={miner.soloLuck ? `${miner.soloLuck}%` : "N/A"} color="#f472b6" />
          </div>

          <div style={{paddingTop: '4px'}}>
            <StatItem label="Immature" value={miner.immatureBalance?.toFixed(2) || "0"} />
            <StatItem label="Pending" value={miner.pendingBalance || "0"} />
            <StatItem label="Total Paid" value={miner.paidBalance?.toFixed(2) || "0"} />
            <StatItem label="24h Reward" value={miner["24hReward"] || "0"} />
            <StatItem label="Blocks Found" value={miner.totalBlocksFound || 0} />
          </div>

          {/* Last share */}
          {miner.lastShare && (
            <div style={{ fontSize: "clamp(8px, 0.6vw, 10px)", color: "#64748b", paddingTop: '4px', borderTop: '1px solid rgba(148,163,184,0.08)' }}>
              Last share: {new Date((miner.lastShare > 1e12 ? miner.lastShare : miner.lastShare * 1000)).toLocaleString()}
            </div>
          )}

          {lastUpdate && (
            <div style={{ fontSize: "clamp(8px, 0.6vw, 10px)", color: "#64748b", fontStyle: "italic", textAlign: "right" }}>
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
