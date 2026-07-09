// CoinPriceModal.jsx
import Modal from "../Modal";
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
    
    // --- Try CoinGecko via backend first ---
    try {
      const query = { 
        ids: coinId,
        vs_currency: "usd" 
      };
      const result = await onCall("/api/v2/prices/coingecko", { query, silent: true });
      const data = Array.isArray(result) ? result[0] : (result?.data?.[0] || result?.[0] || {});
      
      const price = data.price || data.usd || data.current_price || 0;
      const marketCap = data.marketCap || data.market_cap || 0;
      const volume24h = data.volume24h || data.total_volume || 0;
      const change24h = data.change24h || data.price_change_percentage_24h || 0;
      const high24h = data.high24h || data.high_24h || 0;
      const low24h = data.low24h || data.low_24h || 0;
      const supply = data.supply || data.circulating_supply || 0;
      const updatedAt = data.lastUpdated || data.last_updated || new Date().toISOString();
      
      if (price > 0 || marketCap > 0) {
        setPriceData({ price, marketCap, volume24h, change24h, high24h, low24h, supply, lastUpdated: updatedAt });
        setLastUpdated(updatedAt);
        setSource("coingecko");
        setLoading(false);
        return;
      }
    } catch (cgErr) {
      console.warn("CoinGecko backend fetch failed:", cgErr.message);
    }

    // --- Try CoinGecko DIRECT (client-side) as primary fallback ---
    // This works when the backend is not running (e.g. Vite dev only)
    try {
      // CoinGecko uses IDs like "ethereum-classic" for ETC, "ravencoin" for RVN
      const coinGeckoId = COINGECKO_IDS[coin.symbol?.toUpperCase()] || coinId;
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinGeckoId}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`;
      const resp = await fetch(url);
      if (resp.ok) {
        const json = await resp.json();
        const cgData = json[coinGeckoId];
        if (cgData && cgData.usd > 0) {
          setPriceData({
            price: cgData.usd,
            marketCap: cgData.usd_market_cap || 0,
            volume24h: cgData.usd_24h_vol || 0,
            change24h: cgData.usd_24h_change || 0,
            high24h: 0,
            low24h: 0,
            supply: 0,
            lastUpdated: new Date().toISOString(),
          });
          setLastUpdated(new Date().toISOString());
          setSource("coingecko (direct)");
          setLoading(false);
          return;
        }
      }
    } catch (directErr) {
      console.warn("Direct CoinGecko fetch failed:", directErr.message);
    }

    // --- Try Database as final fallback ---
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
          return;
        }
      } catch (dbErr) {
        console.warn(`DB lookup for '${id}' failed:`, dbErr.message);
      }
    }

    setError("No price data available. Start the backend or check connection.");
    setLoading(false);
  }, [coin, onCall]);
  
  // CoinGecko ID mapping for client-side fallback
  const COINGECKO_IDS = {
    BTC: "bitcoin",
    ETH: "ethereum",
    ETC: "ethereum-classic",
    LTC: "litecoin",
    DOGE: "dogecoin",
    RVN: "ravencoin",
    BCH: "bitcoin-cash",
    XMR: "monero",
    KAS: "kaspa",
    QRL: "qrl",
    BEAM: "beam",
    CFX: "conflux",
    ERGO: "ergo",
    ZEPH: "zephyr-protocol",
    IRON: "iron-fish",
    CLORE: "clore-ai",
    DYNEX: "dynex",
    BCN: "bytecoin",
    AEON: "aeon",
    XLA: "scala",
    ARQ: "arqma",
    WOW: "wownero",
    XHV: "haven",
    LOKI: "loki",
    XWP: "swap",
    TUBE: "bitcoin-tube",
    GRFT: "graft",
    ZANO: "zano",
    NAH: "northern",
    SUBS: "substratum",
    BCO: "bridgecoin",
    MBC: "micro-bitcoin",
    DERO: "dero",
    TON: "tokamak-network",
    NIM: "nimiq",
    PPC: "peercoin",
    SAL: "salvium",
  };

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
    <Modal isOpen={isOpen} onClose={onClose} title={`${coin?.symbol?.toUpperCase() || "Coin"} Price`} maxWidth="600px">
      <div className="modal-body">
        {/* Header Meta */}
        <div className="coin-price-header-meta" style={{ marginBottom: '1rem', fontSize: '0.8rem', opacity: 0.7 }}>
          Source:{" "}
          <span style={{ color: sourceColors[source] || "var(--text-muted)", fontWeight: 'bold' }}>
            {source.toUpperCase()}
          </span>
        </div>

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
    </Modal>
  );
}
