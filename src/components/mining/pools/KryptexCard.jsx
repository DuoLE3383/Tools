// KryptexCard.jsx - Address lookup card for Kryptex Pool
import { useState, useCallback } from "react";

export default function KryptexCard({ onCall }) {
  const [coin, setCoin] = useState("etc");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [viewRaw, setViewRaw] = useState(false);

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
      if (result?.success) {
        setData(result);
        setLastUpdate(new Date());
      } else {
        throw new Error(result?.error || "Failed to fetch miner stats");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [address, coin, onCall]);

  const stats = data?.stats || {};
  const balance = stats.balance || {};
  const hashrate = stats.hashrate || {};
  const workers = stats.workers || {};

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
          {/* Hashrate grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: "6px" }}>
            <MiniBlock label="Hash 30m" value={hashrate["30min"] || "0 H/s"} tone="#60a5fa" />
            <MiniBlock label="Hash 3h" value={hashrate["3h"] || "0 H/s"} tone="#fbbf24" />
            <MiniBlock label="Hash 24h" value={hashrate["24h"] || "0 H/s"} tone="#818cf8" />
          </div>

          {/* Workers */}
          {workers.total > 0 && (
            <div style={{ fontSize: "clamp(10px, 0.8vw, 12px)", color: "#94a3b8" }}>
              Workers: <span style={{ color: "#34d399", fontWeight: 700 }}>{workers.online || 0}</span> online /{" "}
              <span style={{ color: "#f87171", fontWeight: 700 }}>{workers.offline || 0}</span> offline
            </div>
          )}

          {/* Balance */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "4px" }}>
            <StatItem label="Unpaid" value={balance.unpaid?.toFixed(4) || "0"} />
            <StatItem label="Total Paid" value={balance.totalPaid?.toFixed(4) || "0"} />
            <StatItem label="7d Reward" value={balance.reward7d?.toFixed(4) || "0"} />
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
