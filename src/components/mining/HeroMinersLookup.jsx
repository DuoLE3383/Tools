// HeroMinersLookup.jsx - Wallet address lookup only (split from HeroMinersCard)
import { useState, useCallback } from "react";

export default function HeroMinersLookup({ onCall }) {
  const [coin, setCoin] = useState("PPC");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [viewRaw, setViewRaw] = useState(false);

  const handleLookup = useCallback(async () => {
    if (!address || !coin) { setError("Coin and address are required."); return; }
    setLoading(true); setError(""); setData(null);
    try {
      const result = await onCall("/api/v2/mining-stats/herominers/address", {
        query: { address: address.trim(), coin: coin.trim().toUpperCase() },
        silent: true,
      });
      if (result?.success) {
        setData(result.data);
        setLastUpdate(new Date());
        localStorage.setItem("herominers_last_address", JSON.stringify({ address: address.trim(), coin: coin.trim().toUpperCase() }));
      } else throw new Error(result?.error || "Failed to fetch");
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [address, coin, onCall]);

  const stats = data || {};
  const live = stats.liveStats || {};
  const payment = stats.paymentStats || {};
  const mining = stats.miningDetails || {};
  const block = stats.blockStats || {};

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
          <h4 style={{ margin: 0, color: "#60a5fa", fontSize: "clamp(12px, 1vw, 14px)" }}>🔍 HeroMiners</h4>
          <div style={{ fontSize: "clamp(9px, 0.7vw, 11px)", color: "#94a3b8", marginTop: "2px" }}>Wallet address lookup</div>
        </div>
        {data && (
          <button className="btn-sm" onClick={() => setViewRaw(!viewRaw)} style={{ fontSize: "clamp(9px, 0.7vw, 11px)" }}>
            {viewRaw ? "Dashboard" : "Raw"}
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        <input value={coin} onChange={(e) => setCoin(e.target.value.toUpperCase())} placeholder="Coin" style={{ flex: "0 0 60px", padding: "6px 10px", background: "rgba(0,0,0,0.25)", border: "1px solid rgba(148,163,184,0.15)", borderRadius: "6px", color: "#e2e8f0", fontSize: "clamp(10px, 0.8vw, 12px)" }} />
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Wallet address" style={{ flex: "1", minWidth: "180px", padding: "6px 10px", background: "rgba(0,0,0,0.25)", border: "1px solid rgba(148,163,184,0.15)", borderRadius: "6px", color: "#e2e8f0", fontSize: "clamp(10px, 0.8vw, 12px)" }} />
        <button className="btn-primary" onClick={handleLookup} disabled={loading} style={{ padding: "6px 14px", fontSize: "clamp(10px, 0.8vw, 12px)" }}>{loading ? "⏳" : "🔍"}</button>
      </div>

      {error && <div style={{ color: "#f87171", fontSize: "clamp(10px, 0.8vw, 12px)", padding: "4px 0" }}>❌ {error}</div>}

      {data && !viewRaw && (
        <div style={{ background: "rgba(0,0,0,0.18)", borderRadius: "8px", padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))", gap: "6px" }}>
            <MiniBlock label="Hashrate" value={live.currentHashrate || "0 H/s"} tone="#60a5fa" />
            <MiniBlock label="Avg 15m" value={live.avg15m || "0 H/s"} tone="#fbbf24" />
            <MiniBlock label="Avg 1h" value={live.avg1h || "0 H/s"} tone="#818cf8" />
            <MiniBlock label="Avg 24h" value={live.avg24h || "0 H/s"} tone="#34d399" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "6px" }}>
            <StatItem label="Pending" value={payment.pendingBalance || "0"} />
            <StatItem label="Total Paid" value={payment.totalPaid || "0"} />
            <StatItem label="24h Paid" value={payment.paid24h || "0"} />
            <StatItem label="Workers" value={`${live.workersOnline || 0}/${live.workersTotal || 0}`} />
            <StatItem label="Blocks" value={block.totalBlocks || mining.blocksFound || 0} />
            <StatItem label="Efficiency" value={mining.efficiency || "0%"} />
          </div>
          {lastUpdate && <div style={{ fontSize: "clamp(8px, 0.6vw, 10px)", color: "#64748b", fontStyle: "italic" }}>Updated: {lastUpdate.toLocaleTimeString()}</div>}
        </div>
      )}

      {data && viewRaw && (
        <pre style={{ background: "rgba(0,0,0,0.25)", borderRadius: "6px", padding: "10px", fontSize: "clamp(8px, 0.6vw, 10px)", maxHeight: "300px", overflow: "auto", color: "#94a3b8" }}>
          {JSON.stringify(data, null, 2)}
        </pre>
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
