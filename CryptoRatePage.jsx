// CryptoRatePage.jsx - FIXED

import React, { useState, useEffect, useCallback } from "react";

const COINS = [
  { id: "bitcoin", symbol: "BTC", name: "Bitcoin" },
  { id: "ethereum", symbol: "ETH", name: "Ethereum" },
  { id: "litecoin", symbol: "LTC", name: "Litecoin" },
  { id: "dogecoin", symbol: "DOGE", name: "Dogecoin" },
  { id: "monero", symbol: "XMR", name: "Monero" },
  { id: "ravencoin", symbol: "RVN", name: "Ravencoin" },
  { id: "kaspa", symbol: "KAS", name: "Kaspa" },
  { id: "bitcoin-cash", symbol: "BCH", name: "Bitcoin Cash" },
  { id: "ethereum-classic", symbol: "ETC", name: "Ethereum Classic" },
  { id: "zcash", symbol: "ZEC", name: "Zcash" },
];

// ✅ Alternative IDs for fallback
const COIN_IDS = [
  "bitcoin",
  "ethereum", 
  "litecoin",
  "dogecoin",
  "bitcoin-cash",
  "monero",
  "ravencoin",
  "kaspa",
  "ethereum-classic",
  "zcash"
];

export default function CryptoRatePage({ onCall, onNavigateHome }) {
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchPrices = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // ✅ Use the correct endpoint with proper IDs
      const ids = COIN_IDS.join(',');
      const result = await onCall("/api/v2/prices/coingecko", {
        query: {
          ids: ids,
          vs_currency: 'usd',
          include_24hr_change: 'true'
        },
        silent: true,
      });

      // ✅ Handle different response formats
      let priceData = {};
      
      if (result && result.data) {
        priceData = result.data;
      } else if (result && typeof result === 'object') {
        // Check if it's already in the right format
        if (result.bitcoin || result.ethereum) {
          priceData = result;
        } else {
          // Try to find data in nested structure
          const nestedData = result?.data?.data || result?.data || result;
          if (nestedData && typeof nestedData === 'object') {
            priceData = nestedData;
          }
        }
      }

      // ✅ Ensure bitcoin-cash is properly mapped
      if (priceData['bitcoin-cash'] && !priceData['bitcoincash']) {
        priceData['bitcoincash'] = priceData['bitcoin-cash'];
      }
      if (priceData['bitcoincash'] && !priceData['bitcoin-cash']) {
        priceData['bitcoin-cash'] = priceData['bitcoincash'];
      }

      // ✅ Check if we got data
      if (Object.keys(priceData).length === 0) {
        throw new Error('No price data received');
      }

      setPrices(priceData);
      setLastUpdated(new Date().toISOString());
      
      // ✅ Debug log to verify BCH
      if (priceData['bitcoin-cash']) {
        console.log('✅ BCH Price:', priceData['bitcoin-cash'].usd);
      } else {
        console.warn('⚠️ BCH not found in response:', Object.keys(priceData));
      }

    } catch (err) {
      console.error("Failed to fetch prices:", err);
      setError(err.message);
      
      // ✅ Fallback: Try individual requests for missing coins
      await fetchIndividualPrices();
    } finally {
      setLoading(false);
    }
  }, [onCall]);

  // ✅ Fallback: Fetch individual coin prices
  const fetchIndividualPrices = useCallback(async () => {
    console.log('[CryptoRate] Trying individual price fetch...');
    
    try {
      const results = await Promise.all(
        COIN_IDS.map(async (id) => {
          try {
            const result = await onCall("/api/v2/prices/coingecko", {
              query: { ids: id, vs_currency: 'usd' },
              silent: true,
            });
            
            let priceData = result?.data || result || {};
            return { id, data: priceData[id] || priceData };
          } catch (err) {
            console.warn(`[CryptoRate] Failed to fetch ${id}:`, err.message);
            return { id, data: null };
          }
        })
      );

      const newPrices = {};
      results.forEach(({ id, data }) => {
        if (data && typeof data === 'object') {
          newPrices[id] = data;
        }
      });

      if (Object.keys(newPrices).length > 0) {
        console.log('[CryptoRate] Individual fetch succeeded:', Object.keys(newPrices));
        setPrices(newPrices);
        setLastUpdated(new Date().toISOString());
        setError(null);
      }
    } catch (err) {
      console.error('[CryptoRate] Individual fetch failed:', err.message);
    }
  }, [onCall]);

  useEffect(() => {
    fetchPrices();
    const interval = setInterval(fetchPrices, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [fetchPrices]);

  // Format price display
  const formatPrice = (price) => {
    if (!price || price === 0) return "N/A";
    if (price >= 1) return `$${price.toFixed(2)}`;
    if (price >= 0.01) return `$${price.toFixed(4)}`;
    if (price >= 0.0001) return `$${price.toFixed(6)}`;
    return `$${price.toFixed(8)}`;
  };

  // Get coin display info
  const getCoinInfo = (coinId) => {
    const coin = COINS.find(c => c.id === coinId);
    return coin || { symbol: coinId.toUpperCase(), name: coinId };
  };

  // Get price change
  const getPriceChange = (data) => {
    return data?.usd_24h_change ?? data?.change ?? data?.price_change_24h ?? null;
  };

  return (
    <div className="crypto-rate-page" style={{ padding: "20px" }}>
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center", 
        marginBottom: "20px",
        flexWrap: "wrap",
        gap: "12px"
      }}>
        <div>
          <h2 style={{ margin: 0 }}>Live Crypto Rates</h2>
          {lastUpdated && (
            <span style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px", display: "block" }}>
              Last updated: {new Date(lastUpdated).toLocaleTimeString()}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button 
            className="btn-pro secondary" 
            onClick={fetchPrices} 
            disabled={loading}
            style={{ fontSize: "11px" }}
          >
            {loading ? "⏳" : "🔄 Refresh"}
          </button>
          <button className="btn-pro secondary" onClick={onNavigateHome} style={{ fontSize: "11px" }}>
            ← Back
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
          Loading prices...
        </div>
      )}

      {error && (
        <div style={{ 
          color: "#f87171", 
          padding: "12px", 
          background: "rgba(248,113,113,0.1)",
          borderRadius: "8px",
          border: "1px solid rgba(248,113,113,0.2)",
          marginBottom: "16px"
        }}>
          ⚠️ Error: {error}
          <button 
            onClick={fetchPrices} 
            style={{ marginLeft: "12px", background: "transparent", border: "1px solid #f87171", color: "#f87171", padding: "2px 12px", borderRadius: "4px", cursor: "pointer" }}
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && (
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", 
          gap: "16px" 
        }}>
          {COINS.map((coin) => {
            const data = prices[coin.id] || prices[coin.symbol.toLowerCase()] || {};
            const price = data?.usd || data?.price || 0;
            const change = getPriceChange(data);
            const hasData = price > 0;

            return (
              <div key={coin.id} style={{
                background: hasData ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.02)",
                padding: "16px",
                borderRadius: "12px",
                border: `1px solid ${hasData ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)'}`,
                opacity: hasData ? 1 : 0.6,
              }}>
                <div style={{ 
                  display: "flex", 
                  justifyContent: "space-between", 
                  alignItems: "center",
                  marginBottom: "4px"
                }}>
                  <div style={{ fontSize: "14px", fontWeight: "bold", color: "#e2e8f0" }}>
                    {coin.symbol}
                  </div>
                  <div style={{ fontSize: "11px", color: "#94a3b8" }}>
                    {coin.name}
                  </div>
                </div>
                <div style={{ 
                  fontSize: "22px", 
                  fontWeight: "bold", 
                  color: hasData ? "#fbbf24" : "#64748b",
                  marginTop: "8px" 
                }}>
                  {hasData ? formatPrice(price) : "N/A"}
                </div>
                {change !== null && change !== undefined && hasData && (
                  <div style={{ 
                    fontSize: "12px", 
                    color: change > 0 ? "#34d399" : change < 0 ? "#f87171" : "#94a3b8",
                    marginTop: "4px" 
                  }}>
                    {change > 0 ? "↑" : change < 0 ? "↓" : "—"} {Math.abs(change).toFixed(2)}% (24h)
                  </div>
                )}
                {!hasData && (
                  <div style={{ fontSize: "10px", color: "#64748b", marginTop: "4px" }}>
                    No data available
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}