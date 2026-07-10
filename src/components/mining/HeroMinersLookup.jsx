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
    <div style={{ padding: "12px", background: "#1e1e2e", border: "3px solid #000", boxShadow: "6px 6px 0px #000", display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h4 style={{ margin: 0, color: "#60a5fa", fontSize: "14px", fontWeight: 900, textTransform: "uppercase" }}>🔍 HEROMINERS</h4>
          <div style={{ fontSize: "9px", color: "#94a3b8", fontWeight: 700 }}>WALLET LOOKUP</div>
        </div>
        {data && (
          <button onClick={() => setViewRaw(!viewRaw)} style={{
            fontSize: "9px", fontWeight: 900, padding: "2px 8px",
            background: "#2d2d3d", border: "2px solid #000", color: "#f5f5f5", cursor: "pointer",
          }}>{viewRaw ? "DASHBOARD" : "RAW"}</button>
        )}
      </div>

      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        <input value={coin} onChange={(e) => setCoin(e.target.value.toUpperCase())} placeholder="Coin"
          style={{ flex: "0 0 50px", padding: "6px 8px", background: "#2d2d3d", border: "2px solid #000", color: "#f5f5f5", fontSize: "11px", fontWeight: 700, outline: "none" }} />
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Wallet address"
          style={{ flex: "1", minWidth: "120px", padding: "6px 8px", background: "#2d2d3d", border: "2px solid #000", color: "#f5f5f5", fontSize: "11px", fontWeight: 700, outline: "none" }} />
        <button onClick={handleLookup} disabled={loading} style={{
          padding: "6px 14px", fontSize: "11px", fontWeight: 900,
          background: "#60a5fa", border: "2px solid #000", color: "#000", cursor: "pointer",
        }}>{loading ? "⏳" : "🔍"}</button>
      </div>

      {error && <div style={{ color: "#f87171", fontSize: "10px", fontWeight: 700 }}>⚠ {error}</div>}

      {data && !viewRaw && (
        <div style={{ background: "#16161e", border: "2px solid #000", padding: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "4px" }}>
            <MiniBlock label="HASHRATE" value={live.currentHashrate || "0 H/s"} color="#60a5fa" />
            <MiniBlock label="15M" value={live.avg15m || "0 H/s"} color="#fbbf24" />
            <MiniBlock label="1H" value={live.avg1h || "0 H/s"} color="#818cf8" />
            <MiniBlock label="24H" value={live.avg24h || "0 H/s"} color="#34d399" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "3px" }}>
            <Row label="PENDING" value={payment.pendingBalance || "0"} />
            <Row label="PAID" value={payment.totalPaid || "0"} />
            <Row label="24H PAID" value={payment.paid24h || "0"} />
            <Row label="WORKERS" value={`${live.workersOnline || 0}/${live.workersTotal || 0}`} />
            <Row label="BLOCKS" value={block.totalBlocks || mining.blocksFound || 0} />
            <Row label="EFF" value={mining.efficiency || "0%"} />
          </div>
          {lastUpdate && <div style={{ fontSize: "8px", color: "#64748b", fontWeight: 700 }}>UPDATED: {lastUpdate.toLocaleTimeString()}</div>}
        </div>
      )}

      {data && viewRaw && (
        <pre style={{ background: "#16161e", border: "2px solid #000", padding: "8px", fontSize: "8px", maxHeight: "200px", overflow: "auto", color: "#94a3b8" }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

function MiniBlock({ label, value, color }) {
  return (
    <div style={{ padding: "4px", background: "#1e1e2e", border: "2px solid #000", textAlign: "center" }}>
      <div style={{ color: "#64748b", fontSize: "7px", fontWeight: 900 }}>{label}</div>
      <div style={{ color, fontSize: "10px", fontWeight: 900, marginTop: "1px" }}>{value}</div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 4px", borderBottom: "1px solid #000", fontSize: "9px" }}>
      <span style={{ color: "#94a3b8", fontWeight: 700 }}>{label}</span>
      <span style={{ color: "#f5f5f5", fontWeight: 900 }}>{value}</span>
    </div>
  );
}
