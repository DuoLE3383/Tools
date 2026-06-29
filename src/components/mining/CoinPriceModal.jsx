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

function formatTimestamp(dateString) {
  if (!dateString) return "N/A";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "N/A";
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    
    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return date.toLocaleString();
  } catch {
    return "N/A";
  }
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
  const [source, setSource] = useState("coingecko" || "cmc" || "database");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [hashrate, setHashrate] = useState("100");
  const [unit, setUnit] = useState("MH");
  const [power, setPower] = useState("200");

  const fetchPrice = useCallback(async () => {
    if (!coin) return;
    setLoading(true);
    setError(null);
    
    const coinId = coin.coinId || coin.symbol?.toLowerCase() || coin.name?.toLowerCase();
    
    // --- Try CoinGecko first (most reliable for 24h high/low) ---
    try {
      const endpoint = "/api/v2/prices/coingecko";
      const query = { 
        ids: coinId, // Use 'ids' to match the backend endpoint
        vs_currency: "usd" 
      };
      const result = await onCall(endpoint, { query, silent: true });
      const data = result?.data || result || {};
      
      // CoinGecko response structure
      const price = data.price || data.usd || data.current_price || 0;
      const marketCap = data.marketCap || data.market_cap || 0;
      const volume24h = data.volume24h || data.total_volume || 0;
      const change24h = data.change24h || data.price_change_percentage_24h || 0;
      const high24h = data.high24h || data.high_24h || 0;
      const low24h = data.low24h || data.low_24h || 0;
      const supply = data.supply || data.circulating_supply || 0;
      const updatedAt = data.lastUpdated || data.last_updated || new Date().toISOString();
      
      // Check if we got valid data from CoinGecko
      if (price > 0 || marketCap > 0) {
        setPriceData({
          price,
          marketCap,
          volume24h,
          change24h,
          high24h,
          low24h,
          supply,
          lastUpdated: updatedAt,
        });
        setLastUpdated(updatedAt);
        setSource("coingecko");
        setLoading(false);
        return;
      }
    } catch (cgErr) {
      console.warn("CoinGecko fetch failed, trying fallback:", cgErr.message);
    }

    // --- Try Database as the PRIMARY fallback ---
    const identifiers = [...new Set([
      coinId,
      coin.symbol?.toLowerCase(),
      coin.name?.toLowerCase()
    ].filter(Boolean))];

    for (const id of identifiers) {
      try {
        const dbResult = await onCall(`/api/v2/prices/db/${id}`, { silent: true });
        if (dbResult?.success && dbResult.data) {
          const data = dbResult.data;
          setPriceData({
            price: data.price_usd || 0,
            marketCap: data.market_cap || 0,
            volume24h: data.volume_24h || 0,
            change24h: data.price_change_24h || 0,
            high24h: data.high_24h || 0,
            low24h: data.low_24h || 0,
            supply: data.circulating_supply || 0,
            lastUpdated: data.captured_at || new Date().toISOString(),
          });
          setSource("database");
          setLoading(false);
          return; // Success, exit the fetch function
        }
      } catch (dbErr) {
        console.warn(`DB lookup for '${id}' failed:`, dbErr.message);
      }
    }

    // --- Try CoinMarketCap as fallback ---
    try {
      const endpoint = "/api/v2/prices/cmc";
      const query = { 
        symbol: coin.symbol?.toUpperCase() || coinId 
      };
      const result = await onCall(endpoint, { query, silent: true });
      const data = result?.data || result || {};
      
      // CMC response structure
      const quote = data.quote?.USD || data.quote || {};
      const price = quote.price || data.price || 0;
      const marketCap = quote.market_cap || data.market_cap || 0;
      const volume24h = quote.volume_24h || data.volume_24h || 0;
      const change24h = quote.percent_change_24h || data.percent_change_24h || 0;
      const high24h = quote.high_24h || data.high_24h || 0;
      const low24h = quote.low_24h || data.low_24h || 0;
      const supply = quote.circulating_supply || data.circulating_supply || 0;
      const updatedAt = quote.last_updated || data.last_updated || new Date().toISOString();
      
      setPriceData({
        price,
        marketCap,
        volume24h,
        change24h,
        high24h,
        low24h,
        supply,
        lastUpdated: updatedAt,
      });
      setLastUpdated(updatedAt);
      setSource("cmc");
    } catch (cmcErr) {
      console.warn("CMC fetch failed:", cmcErr.message);
      setError("Failed to fetch price data from all sources");
    } finally {
      setLoading(false);
    }
  }, [coin, onCall]);

  useEffect(() => {
    if (isOpen && coin) fetchPrice();
  }, [isOpen, coin, fetchPrice]);

  if (!isOpen) return null;

  // Source color mapping
  const sourceColors = {
    coingecko: "#38bdf8",
    cmc: "#f0b90b",
    database: "#34d399"
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 10000 }}>
      <div className="modal-content" style={{ maxWidth: "600px" }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div>
            <h2>{coin?.symbol?.toUpperCase() || "Coin"} Price</h2>
            <div className="coin-price-header-meta">
              Source: <span style={{ color: sourceColors[source] || "var(--text-muted)" }}>{source.toUpperCase()}</span>
            </div>
          </div>
          <button onClick={onClose} className="modal-close-btn">×</button>
        </div>

        <div className="modal-body">
          {/* Content */}
          {loading && <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>Loading price data...</div>}
          
          {error && !loading && (
            <div className="panel" style={{ background: "rgba(248,113,113,0.1)", borderColor: 'var(--danger-color)', color: "var(--danger-color)", textAlign: "center" }}>
              {error}
              <button onClick={fetchPrice} className="btn-pro secondary" style={{ marginTop: "1rem", borderColor: "var(--danger-color)", color: "var(--danger-color)" }}>Retry</button>
            </div>
          )}

          {!loading && !error && priceData && (
            <div>
              {/* Main Price */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
                <div className="panel" style={{ padding: "1rem", textAlign: "center", background: 'rgba(0,0,0,0.1)' }}>
                  <div className="label">Price</div>
                  <div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--success-color)" }}>{formatPrice(priceData.price)}</div>
                </div>
                <div className="panel" style={{ padding: "1rem", textAlign: "center", background: 'rgba(0,0,0,0.1)' }}>
                  <div className="label">24h Change</div>
                  <div style={{ fontSize: "2rem", fontWeight: 700, color: priceData.change24h > 0 ? "var(--success-color)" : "var(--danger-color)" }}>{formatPercent(priceData.change24h)}</div>
                </div>
              </div>

              {/* Profitability Calculator */}
              <div className="panel" style={{ marginBottom: "1.5rem", border: "1px solid rgba(56, 189, 248, 0.2)" }}>
                {/* Results */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "0.75rem" }}>
                  <div style={{ background: "rgba(0,0,0,0.1)", padding: "0.5rem", borderRadius: "6px" }}>
                    <div className="label" style={{ fontSize: "0.65rem" }}>Est. Coins/Day</div>
                    <div style={{ color: "var(--text-light)", fontSize: "0.9rem", fontWeight: 600 }}>{(priceData.price > 0 ? (1 / priceData.price) * 2.5 : 0).toFixed(4)} {coin?.symbol?.toUpperCase()}</div>
                  </div>
                  <div style={{ background: "rgba(0,0,0,0.1)", padding: "0.5rem", borderRadius: "6px" }}>
                    <div className="label" style={{ fontSize: "0.65rem" }}>Est. Profit/Day</div>
                    <div style={{ color: "var(--success-color)", fontSize: "0.9rem", fontWeight: 600 }}>${(2.5 - (power / 1000 * 24 * 0.1)).toFixed(2)}</div>
                  </div>
                  <div style={{ background: "rgba(0,0,0,0.1)", padding: "0.5rem", borderRadius: "6px" }}>
                    <div className="label" style={{ fontSize: "0.65rem" }}>Last 24h Avg</div>
                    <div style={{ color: "var(--warning-color)", fontSize: "0.9rem", fontWeight: 600 }}>${(2.5 - (power / 1000 * 24 * 0.1) * (1 + priceData.change24h / 100)).toFixed(2)}</div>
                  </div>
                  <div style={{ background: "rgba(0,0,0,0.1)", padding: "0.5rem", borderRadius: "6px" }}>
                    <div className="label" style={{ fontSize: "0.65rem" }}>Next 24h Est.</div>
                    <div style={{ color: "var(--secondary-accent)", fontSize: "0.9rem", fontWeight: 600 }}>${(2.5 - (power / 1000 * 24 * 0.1)).toFixed(2)}</div>
                  </div>
                </div>
              </div>

              {/* Details */}
              <table className="pro-table">
                <tbody>
                  {[
                    ["Market Cap", formatNumber(priceData.marketCap), "var(--text-light)"],
                    ["24h Volume", formatNumber(priceData.volume24h), "var(--text-light)"],
                    ["Circulating Supply", formatNumber(priceData.supply), "var(--text-light)"],
                    ["Updated At", formatTimestamp(lastUpdated), "var(--text-muted)"],
                  ].map(([label, value, color]) => (
                    <tr key={label}>
                      <td>{label}</td>
                      <td style={{ textAlign: "right", color, fontWeight: label === "Updated At" ? 400 : 600, fontSize: label === "Updated At" ? "0.75rem" : "0.8rem" }}>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)'}}>
            <button onClick={fetchPrice} disabled={loading} className="btn-pro secondary" style={{ opacity: loading ? 0.6 : 1 }}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
        </div>
      </div>
    </div>
  );
}