// CryptoRatePage.jsx - FIXED

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useWebSocket } from "./src/components/WebSocketContext";

const COINS = [
  { id: "bitcoin", symbol: "BTC", name: "Bitcoin" },
  { id: "ethereum", symbol: "ETH", name: "Ethereum" },
  { id: "litecoin", symbol: "LTC", name: "Litecoin" },
  { id: "dogecoin", symbol: "DOGE", name: "Dogecoin" },
  { id: "bitcoin-cash", symbol: "BCH", name: "Bitcoin Cash" },
  { id: "kaspa", symbol: "KAS", name: "Kaspa" },
  { id: "ravencoin", symbol: "RVN", name: "Ravencoin" },
];

export default function CryptoRatePage({ onCall, onNavigateHome, coinPrices: initialCoinPrices, onPriceUpdate }) {
  const [coins] = useState(COINS);
  const [prices, setPrices] = useState(initialCoinPrices || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  // ✅ Use the central WebSocket context for live updates
  const { prices: wsPrices, isConnected: wsIsConnected } = useWebSocket();

  const allCoinIds = useMemo(() => coins.map(c => c.id), [coins]);

  const formatPricesForRigCard = useCallback((data) => {
    if (!data) return {};
    const formatted = {};
    Object.keys(data).forEach(key => {
        const coinData = data[key];
        const coin = coins.find(c => c.id === key || c.symbol.toLowerCase() === key.toLowerCase());
        if (coin) {
            formatted[coin.symbol] = {
                usd: coinData?.usd || 0,
                btc: coinData?.btc || 0,
            };
        }
    });
    return formatted;
  }, [coins]);

  const fetchPrices = useCallback(async () => {
    if (allCoinIds.length === 0) return;
    setLoading(true);
    setError(null);

    try {
      const ids = allCoinIds.join(',');
      const result = await onCall("/api/v2/prices/coingecko", {
        query: {
          ids: ids,
          vs_currencies: 'usd,btc', // Fetch both USD and BTC
          include_24hr_change: 'true',
          include_market_cap: 'true',
          include_24hr_vol: 'true',
        },
        silent: true,
      });

      // ✅ Handle different response formats
      let priceData = {};
      
      if (result && result.data) {
        priceData = result.data;
      } else if (result && typeof result === 'object' && !result.error) {
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

      if (Object.keys(priceData).length === 0) {
        throw new Error('No price data received from bulk fetch.');
      }

      setPrices(priceData);
      setLastUpdated(new Date().toISOString());
      if (onPriceUpdate) {
        onPriceUpdate(formatPricesForRigCard(priceData));
      }

    } catch (err) {
      console.error("Failed to fetch prices:", err);
      setError(err.message);
      
      // ✅ Fallback: Try individual requests for missing coins
      await fetchIndividualPrices();
    } finally {
      setLoading(false);
    }
  }, [onCall, onPriceUpdate, formatPricesForRigCard, allCoinIds]);

  // ✅ Fallback: Fetch individual coin prices
  const fetchIndividualPrices = useCallback(async () => {
    console.log('[CryptoRate] Trying individual price fetch...');
    if (allCoinIds.length === 0) return;
    
    try {
      const existingPrices = prices || {};
      const missingCoins = allCoinIds.filter(id => !existingPrices[id]);
      if (missingCoins.length === 0) return;

      const results = await Promise.all(
        missingCoins.map(async (id) => {
          try {
            const result = await onCall("/api/v2/prices/coingecko", {
              query: { ids: id, vs_currencies: 'usd,btc', include_24hr_change: 'true' },
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

      const newPrices = { ...existingPrices };
      let fetchedNew = false;
      results.forEach(({ id, data }) => {
        if (data && typeof data === 'object') {
          newPrices[id] = data;
          fetchedNew = true;
        }
      });

      if (fetchedNew) {
        console.log('[CryptoRate] Individual fetch succeeded:', Object.keys(newPrices));
        setPrices(newPrices);
        setLastUpdated(new Date().toISOString());
        setError(null);
        if (onPriceUpdate) {
          onPriceUpdate(formatPricesForRigCard(newPrices));
        }
      }
    } catch (err) {
      console.error('[CryptoRate] Individual fetch failed:', err.message);
    }
  }, [onCall, prices, onPriceUpdate, formatPricesForRigCard, allCoinIds]);

  // ✅ Merge prices from WebSocket into the local state
  useEffect(() => {
    if (wsPrices && Object.keys(wsPrices).length > 0) {
      setPrices(prev => ({ ...prev, ...wsPrices }));
    }
  }, [wsPrices]);

  useEffect(() => {
    if (coins.length > 0) {
      fetchPrices();
      // Only poll if WebSocket is not connected
      const interval = setInterval(() => {
        if (!wsIsConnected) {
          fetchPrices();
        }
      }, 60000); // Poll every 60 seconds as requested
      return () => clearInterval(interval);
    }
  }, [coins, fetchPrices, wsIsConnected, onPriceUpdate]);

  // Format price display
  const formatPrice = (price) => {
    if (!price || price === 0) return "N/A";
    if (price >= 1) return `$${price.toFixed(2)}`;
    if (price >= 0.01) return `$${price.toFixed(4)}`;
    if (price >= 0.0001) return `$${price.toFixed(6)}`;
    return `$${price.toFixed(8)}`;
  };

  // Get coin display info
  const getCoinData = useCallback((coinId) => {
    if (!prices) return {};    

    const possibleIds = [coinId, coinId.toLowerCase(), coinId.toUpperCase()];
    for (const id of possibleIds) {
      if (prices[id]) return prices[id];
      if (prices[id.toLowerCase()]) return prices[id.toLowerCase()];
      if (prices[id.toUpperCase()]) return prices[id.toUpperCase()];
    }

    return {};
  }, [prices, coins]);

  // Get price change
  const getPriceChange = (data) => {
    return data?.usd_24h_change ?? data?.change ?? data?.price_change_percentage_24h ?? null;
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
          {coins.map((coin) => {
            const data = getCoinData(coin.id);
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