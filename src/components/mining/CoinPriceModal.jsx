// CoinPriceModal.jsx
import { useState, useEffect, useCallback } from "react";

const COINGECKO_IDS = {
  BTC: "bitcoin",
  ETH: "ethereum",
  LTC: "litecoin",
  DOGE: "dogecoin",
  BCH: "bitcoin-cash",
};

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

function resolveCoinGeckoId(coin) {
  if (!coin) return "";
  const rawId = String(coin.coinId || "").trim().toLowerCase();
  if (rawId) {
    const knownIds = Object.values(COINGECKO_IDS);
    if (knownIds.includes(rawId)) return rawId;
  }

  const symbol = String(coin.symbol || "").trim().toUpperCase();
  if (COINGECKO_IDS[symbol]) return COINGECKO_IDS[symbol];

  const normalizedName = String(coin.name || "").trim().toLowerCase();
  const nameMap = {
    bitcoin: "bitcoin",
    ethereum: "ethereum",
    litecoin: "litecoin",
    dogecoin: "dogecoin",
    "bitcoin cash": "bitcoin-cash",
  };
  if (nameMap[normalizedName]) return nameMap[normalizedName];

  return rawId || symbol.toLowerCase() || normalizedName;
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function extractMarketEntry(payload, coinId, coin) {
  if (payload == null) return null;

  if (typeof payload === "number" || typeof payload === "string") {
    const num = Number(payload);
    return Number.isFinite(num) ? { usd: num } : null;
  }

  if (typeof payload !== "object") return null;

  const symbol = String(coin?.symbol || "").trim().toLowerCase();
  const name = String(coin?.name || "").trim().toLowerCase();

  const direct =
    payload[coinId] ||
    (symbol ? payload[symbol] : undefined) ||
    (name ? payload[name] : undefined);

  if (direct == null) return payload;

  if (typeof direct === "number" || typeof direct === "string") {
    const num = Number(direct);
    return Number.isFinite(num) ? { usd: num } : null;
  }

  return direct;
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
  const [source, setSource] = useState("coingecko");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [power] = useState("200");

  const fetchPrice = useCallback(async () => {
    if (!coin) return;
    setLoading(true);
    setError(null);
    
    const coinId = resolveCoinGeckoId(coin);
    
    // --- Try CoinGecko first (most reliable for 24h high/low) ---
    try {
      const endpoint = "/api/v2/prices/coingecko";
      const query = { 
        ids: coinId,
        vs_currencies: "usd,btc",
        sparkline: true,
      };
      const result = await onCall(endpoint, { query, silent: true });
      const data = result?.data ?? result ?? {};
      const coinData = extractMarketEntry(data, coinId, coin);
      
      // CoinGecko response structure
      const price = toNumber(coinData?.usd ?? coinData?.price ?? coinData?.current_price ?? coinData);
      const marketCap = toNumber(coinData?.usd_market_cap ?? coinData?.marketCap ?? coinData?.market_cap);
      const volume24h = toNumber(coinData?.usd_24h_vol ?? coinData?.volume24h ?? coinData?.total_volume);
      const change24h = toNumber(coinData?.usd_24h_change ?? coinData?.change24h ?? coinData?.price_change_percentage_24h);
      const high24h = toNumber(coinData?.high_24h ?? coinData?.high24h);
      const low24h = toNumber(coinData?.low_24h ?? coinData?.low24h);
      const supply = toNumber(coinData?.circulating_supply ?? coinData?.supply);
      const updatedAt = coinData.lastUpdated || coinData.last_updated || new Date().toISOString();
      
      // Check if we got valid data from CoinGecko
      if (price > 0 || marketCap > 0 || volume24h > 0) {
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
        const data = dbResult?.data ?? dbResult;
        if (data && typeof data === "object") {
          const dbData = data.success === false ? null : data;
          const priceUsd = toNumber(dbData?.price_usd ?? dbData?.usd ?? dbData?.price);
          if (priceUsd > 0 || dbData?.market_cap > 0 || dbData?.volume_24h > 0) {
            setPriceData({
              price: priceUsd,
              marketCap: toNumber(dbData.market_cap),
              volume24h: toNumber(dbData.volume_24h),
              change24h: toNumber(dbData.price_change_24h ?? dbData.change24h),
              high24h: toNumber(dbData.high_24h),
              low24h: toNumber(dbData.low_24h),
              supply: toNumber(dbData.circulating_supply),
              lastUpdated: dbData.captured_at || dbData.last_updated || new Date().toISOString(),
            });
            setSource("database");
            return; // Success, exit the fetch function
          }
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
      const quote = data.quote?.USD || data.quote || {};
      const price = toNumber(quote.price ?? data.price);
      const marketCap = toNumber(quote.market_cap ?? data.market_cap);
      const volume24h = toNumber(quote.volume_24h ?? data.volume_24h);
      const change24h = toNumber(quote.percent_change_24h ?? data.percent_change_24h);
      const high24h = toNumber(quote.high_24h ?? data.high_24h);
      const low24h = toNumber(quote.low_24h ?? data.low_24h);
      const supply = toNumber(quote.circulating_supply ?? data.circulating_supply);
      const updatedAt = quote.last_updated || data.last_updated || new Date().toISOString();
      
      if (price > 0 || marketCap > 0 || volume24h > 0) {
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
        return;
      }
    } catch (cmcErr) {
      console.warn("CMC fetch failed:", cmcErr.message);
      setError("Failed to fetch price data from all sources");
    } finally {
      setLoading(false);
    }
  }, [coin, onCall]);

  useEffect(() => {
    if (!(isOpen && coin)) return;
    const timer = setTimeout(() => {
      void fetchPrice();
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen, coin, fetchPrice]);

  if (!isOpen) return null;

  // Source color mapping
  const sourceColors = {
    coingecko: "#38bdf8",
    cmc: "#f0b90b",
    database: "#34d399"
  };

  return (
    <div
      className="coin-price-modal"
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
        className="coin-price-modal__dialog"
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
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "20px" }}>
          <div>
            <h2 style={{ margin: 0, color: "#e2e8f0", fontSize: "20px" }}>
              {coin?.symbol?.toUpperCase() || "Coin"} Price
            </h2>
            <div style={{ color: "#94a3b8", fontSize: "12px" }}>
              Source: <span style={{ color: sourceColors[source] || "#94a3b8", fontWeight: "bold" }}>
                {source.toUpperCase()}
              </span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#94a3b8", fontSize: "24px", cursor: "pointer" }}>×</button>
        </div>

        {/* Refresh Button */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
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

        {/* Content */}
        {loading && <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>Loading...</div>}
        
        {error && !loading && (
          <div style={{ padding: "16px", background: "rgba(248,113,113,0.1)", borderRadius: "12px", color: "#f87171", textAlign: "center" }}>
            {error}
            <button onClick={fetchPrice} style={{ marginTop: "8px", background: "transparent", border: "1px solid #f87171", color: "#f87171", padding: "2px 12px", borderRadius: "4px", cursor: "pointer" }}>Retry</button>
          </div>
        )}

        {!loading && !error && priceData && (
          <div>
            {/* Main Price */}
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

            {/* Profitability Calculator */}
            <div style={{ 
              marginBottom: "16px", 
              padding: "12px 16px", 
              borderRadius: "12px", 
              background: "rgba(255,255,255,0.02)", 
              border: "1px solid rgba(56, 189, 248, 0.2)"
            }}>
              {/* <div style={{ color: "#38bdf8", fontSize: "10px", textTransform: "uppercase", marginBottom: "8px", fontWeight: "bold" }}>Profitability Calculator</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", alignItems: "flex-end", marginBottom: "12px" }}>
                <div>
                  <label style={{ color: "#94a3b8", fontSize: "9px" }}>Hashrate</label>
                  <input type="number" value={hashrate} onChange={e => setHashrate(e.target.value)} style={{ width: "100%", background: "rgba(0,0,0,0.2)", border: "1px solid #334155", borderRadius: "4px", color: "white", padding: "4px 8px", fontSize: "12px" }} />
                </div>
                <div>
                  <label style={{ color: "#94a3b8", fontSize: "9px" }}>Unit</label>
                  <select value={unit} onChange={e => setUnit(e.target.value)} style={{ width: "100%", background: "rgba(0,0,0,0.2)", border: "1px solid #334155", borderRadius: "4px", color: "white", padding: "4px 8px", fontSize: "12px" }}>
                    <option>H</option>
                    <option>KH</option>
                    <option>MH</option>
                    <option>GH</option>
                    <option>TH</option>
                  </select>
                </div>
                <div>
                  <label style={{ color: "#94a3b8", fontSize: "9px" }}>Power (W)</label>
                  <input type="number" value={power} onChange={e => setPower(e.target.value)} style={{ width: "100%", background: "rgba(0,0,0,0.2)", border: "1px solid #334155", borderRadius: "4px", color: "white", padding: "4px 8px", fontSize: "12px" }} />
                </div>
              </div> */}
              
              {/* Results */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <div style={{ background: "rgba(255,255,255,0.03)", padding: "8px", borderRadius: "6px" }}>
                  <div style={{ color: "#94a3b8", fontSize: "9px" }}>Est. Coins/Day</div>
                  <div style={{ color: "#e2e8f0", fontSize: "14px", fontWeight: 600 }}>
                    {/* Placeholder for actual calculation */}
                    {(priceData.price > 0 ? (1 / priceData.price) * 2.5 : 0).toFixed(4)} {coin?.symbol?.toUpperCase()}
                  </div>
                </div>
                <div style={{ background: "rgba(255,255,255,0.03)", padding: "8px", borderRadius: "6px" }}>
                  <div style={{ color: "#94a3b8", fontSize: "9px" }}>Est. Profit/Day</div>
                  <div style={{ color: "#34d399", fontSize: "14px", fontWeight: 600 }}>
                    {/* Placeholder for actual calculation */}
                    ${(2.5 - (power / 1000 * 24 * 0.1)).toFixed(2)}
                  </div>
                </div>
                <div style={{ background: "rgba(255,255,255,0.03)", padding: "8px", borderRadius: "6px" }}>
                  <div style={{ color: "#94a3b8", fontSize: "9px" }}>Last 24h Avg Profit</div>
                  <div style={{ color: "#fbbf24", fontSize: "14px", fontWeight: 600 }}>
                    {/* Placeholder */}
                    ${(2.5 - (power / 1000 * 24 * 0.1) * (1 + priceData.change24h / 100)).toFixed(2)}
                  </div>
                </div>
                <div style={{ background: "rgba(255,255,255,0.03)", padding: "8px", borderRadius: "6px" }}>
                  <div style={{ color: "#94a3b8", fontSize: "9px" }}>Next 24h Est. Profit</div>
                  <div style={{ color: "#a78bfa", fontSize: "14px", fontWeight: 600 }}>
                    {/* Placeholder */}
                     ${(2.5 - (power / 1000 * 24 * 0.1)).toFixed(2)}
                  </div>
                </div>
              </div>
            </div>

            {/* Details */}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <tbody>
                {[
                  ["Market Cap", formatNumber(priceData.marketCap), "#e2e8f0"],
                  ["24h Volume", formatNumber(priceData.volume24h), "#e2e8f0"],
                  ["Circulating Supply", formatNumber(priceData.supply), "#e2e8f0"],
                  ["Updated At", formatTimestamp(lastUpdated), "#64748b"],
                ].map(([label, value, color]) => (
                  <tr key={label} style={{ borderBottom: "1px solid rgba(148,163,184,0.08)" }}>
                    <td style={{ padding: "8px", color: "#94a3b8" }}>{label}</td>
                    <td style={{ 
                      padding: "8px", 
                      textAlign: "right", 
                      color, 
                      fontWeight: label === "Updated At" ? 400 : 600,
                      fontSize: label === "Updated At" ? "12px" : "13px"
                    }}>
                      {value}
                    </td>
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
