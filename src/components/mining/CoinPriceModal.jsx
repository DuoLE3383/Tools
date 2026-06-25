// CoinPriceModal.jsx
import { useState, useEffect, useCallback } from "react";

function formatPrice(value) {
  const num = Number(value);
  if (!num) return "$0.00";
  if (num >= 1) return `$${num.toFixed(2)}`;
  if (num >= 0.0001) return `$${num.toFixed(4)}`;
  if (num >= 0.000001) return `$${num.toFixed(8)}`;
  return `$${num.toFixed(12)}`;
}

function formatPercent(value) {
  const num = Number(value);
  if (!num) return "0.00%";
  return `${num > 0 ? "+" : ""}${num.toFixed(2)}%`;
}

function formatNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toLocaleString() : "0";
}

export default function CoinPriceModal({ 
  isOpen, 
  onClose, 
  coin, 
  onCall 
}) {
  const [loading, setLoading] = useState(false);
  const [priceData, setPriceData] = useState(null);
  const [error, setError] = useState(null);
  const [source, setSource] = useState("coingecko"); // default direct

  const fetchPrice = useCallback(async () => {
    if (!coin) return;
    setLoading(true);
    setError(null);

    try {
      let data = null;

      // 1) Try to fetch from the backend's database (if available)
      try {
        const dbResult = await onCall("/api/v2/price/db", {
          query: { symbol: coin.symbol },
          silent: true,
        });
        if (dbResult?.data) {
          data = dbResult.data;
          setSource("database");
        }
      } catch (dbErr) {
        // ignore – fall through to external
      }

      // 2) If not in DB, fetch directly from CoinGecko (public, no auth)
      if (!data) {
        const coinId = coin.coinId || coin.symbol.toLowerCase();
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true&include_last_updated_at=true`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`CoinGecko API error: ${res.status}`);
        const json = await res.json();
        const coinData = json[coinId];
        if (!coinData) throw new Error(`No data for coin: ${coinId}`);

        data = {
          price: coinData.usd || 0,
          marketCap: coinData.usd_market_cap || 0,
          volume24h: coinData.usd_24h_vol || 0,
          change24h: coinData.usd_24h_change || 0,
          high24h: 0, // not available from simple endpoint
          low24h: 0,
          supply: 0,
          lastUpdated: coinData.last_updated_at 
            ? new Date(coinData.last_updated_at * 1000).toISOString()
            : new Date().toISOString(),
        };
        setSource("coingecko (direct)");
      }

      // Set the final data
      setPriceData({
        price: data.price || 0,
        marketCap: data.marketCap || 0,
        volume24h: data.volume24h || 0,
        change24h: data.change24h || 0,
        high24h: data.high24h || 0,
        low24h: data.low24h || 0,
        supply: data.supply || 0,
        lastUpdated: data.lastUpdated || new Date().toISOString(),
      });
      setError(null);
    } catch (err) {
      setError(err.message || "Failed to fetch price");
    } finally {
      setLoading(false);
    }
  }, [coin, onCall]);

  useEffect(() => {
    if (isOpen && coin) fetchPrice();
  }, [isOpen, coin, fetchPrice]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(4px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "rgba(15,23,42,0.95)",
          border: "1px solid rgba(148,163,184,0.15)",
          borderRadius: "16px",
          maxWidth: "600px",
          width: "100%",
          maxHeight: "90vh",
          overflow: "auto",
          padding: "24px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "20px" }}>
          <div>
            <h2 style={{ margin: 0, color: "#e2e8f0", fontSize: "20px" }}>
              {coin?.symbol?.toUpperCase() || "Coin"} Price
            </h2>
            <div style={{ color: "#94a3b8", fontSize: "12px" }}>
              {source === "database" ? "Cached" : "Live (CoinGecko)"}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#94a3b8", fontSize: "24px", cursor: "pointer" }}>×</button>
        </div>

        {/* Refresh button */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
          <button
            onClick={fetchPrice}
            disabled={loading}
            style={{
              padding: "4px 16px",
              borderRadius: "20px",
              border: "1px solid rgba(52,211,153,0.3)",
              background: "rgba(52,211,153,0.1)",
              color: "#34d399",
              cursor: loading ? "default" : "pointer",
              fontSize: "12px",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "..." : "Refresh"}
          </button>
        </div>

        {loading && <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>Loading...</div>}
        
        {error && !loading && (
          <div style={{ padding: "16px", background: "rgba(248,113,113,0.1)", borderRadius: "12px", color: "#f87171", textAlign: "center" }}>
            {error}
            <button onClick={fetchPrice} style={{ marginTop: "8px", background: "transparent", border: "1px solid #f87171", color: "#f87171", padding: "2px 12px", borderRadius: "4px", cursor: "pointer" }}>Retry</button>
          </div>
        )}

        {!loading && !error && priceData && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
              <div style={{ padding: "16px", borderRadius: "12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(148,163,184,0.1)", textAlign: "center" }}>
                <div style={{ color: "#64748b", fontSize: "10px", textTransform: "uppercase" }}>Price</div>
                <div style={{ fontSize: "28px", fontWeight: 900, color: "#34d399" }}>{formatPrice(priceData.price)}</div>
              </div>
              <div style={{ padding: "16px", borderRadius: "12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(148,163,184,0.1)", textAlign: "center" }}>
                <div style={{ color: "#64748b", fontSize: "10px", textTransform: "uppercase" }}>24h Change</div>
                <div style={{ fontSize: "28px", fontWeight: 900, color: priceData.change24h > 0 ? "#34d399" : "#f87171" }}>{formatPercent(priceData.change24h)}</div>
              </div>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <tbody>
                {[
                  ["Market Cap", formatNumber(priceData.marketCap), "#e2e8f0"],
                  ["24h Volume", formatNumber(priceData.volume24h), "#e2e8f0"],
                  ["24h High", formatPrice(priceData.high24h), "#34d399"],
                  ["24h Low", formatPrice(priceData.low24h), "#f87171"],
                  ["Supply", formatNumber(priceData.supply), "#e2e8f0"],
                ].map(([label, value, color]) => (
                  <tr key={label} style={{ borderBottom: "1px solid rgba(148,163,184,0.08)" }}>
                    <td style={{ padding: "8px", color: "#94a3b8" }}>{label}</td>
                    <td style={{ padding: "8px", textAlign: "right", color, fontWeight: 600 }}>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}