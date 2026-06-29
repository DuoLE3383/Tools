// CryptoRatePage.jsx - FIXED (remove direct WebSocket)

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useWebSocket } from "./WebSocketContext"; // ✅ Use the context

const COINS = [
  { id: "bitcoin", symbol: "BTC", name: "Bitcoin" },
  { id: "ethereum", symbol: "ETH", name: "Ethereum" },
  { id: "litecoin", symbol: "LTC", name: "Litecoin" },
  { id: "dogecoin", symbol: "DOGE", name: "Dogecoin" },
  { id: "bitcoin-cash", symbol: "BCH", name: "Bitcoin Cash" },
];

// ✅ Map for alternate IDs
const COIN_ID_MAP = {
  'bitcoin-cash': ['bitcoin-cash', 'bitcoincash', 'bch'],
  'bitcoin': ['bitcoin', 'btc'],
  'ethereum': ['ethereum', 'eth'],
  'litecoin': ['litecoin', 'ltc'],
  'dogecoin': ['dogecoin', 'doge'],
};

function Sparkline({ data, width = 180, height = 80, color = "#60a5fa" }) {
  // ... same as before
}

export default function CryptoRatePage({ onCall, onPriceUpdate }) {
  const [prices, setPrices] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [amounts, setAmounts] = useState({ usd: "1000" });
  const [baseCoin, setBaseCoin] = useState("usd");

  // ✅ Use the WebSocket context instead of creating your own connection
  const { isConnected: wsConnected, prices: wsPrices } = useWebSocket();

  const onValueChange = (id, val) => {
    setBaseCoin(id);
    setAmounts({ [id]: val });
  };

  // ✅ Function to format prices for MrrRigCard
  const formatPricesForRigCard = useCallback((data) => {
    const formatted = {};
    Object.keys(data).forEach(key => {
      const coinData = data[key];
      const coin = COINS.find(c => c.id === key);
      const symbol = coin?.symbol || key.toUpperCase();

      formatted[symbol] = {
        usd: coinData?.usd || 0,
        btc: coinData?.btc || 0,
        change24h: coinData?.usd_24h_change || 0,
        marketCap: coinData?.usd_market_cap || 0,
        volume24h: coinData?.usd_24h_vol || 0,
      };
    });
    return formatted;
  }, []);

  // ✅ Improved getCoinData with fallback for BCH
  const getCoinData = useCallback((id) => {
    if (!prices) return null;
    
    if (prices[id]) return prices[id];
    
    const coin = COINS.find(c => c.id === id);
    if (coin && prices[coin.symbol]) return prices[coin.symbol];
    if (coin && prices[coin.symbol.toLowerCase()]) return prices[coin.symbol.toLowerCase()];
    
    // Special handling for bitcoin-cash (BCH)
    if (id === 'bitcoin-cash') {
      const bchVariants = ['bitcoin-cash', 'bitcoincash', 'bch', 'BCH'];
      for (const variant of bchVariants) {
        if (prices[variant]) return prices[variant];
      }
    }
    
    // Try all variants from the map
    const variants = COIN_ID_MAP[id] || [id];
    for (const variant of variants) {
      if (prices[variant]) return prices[variant];
      if (prices[variant.toLowerCase()]) return prices[variant.toLowerCase()];
      if (prices[variant.toUpperCase()]) return prices[variant.toUpperCase()];
    }
    
    return null;
  }, [prices]);

  const fetchPrices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ids = COINS.map((c) => c.id).join(",");
      const res = await onCall("/api/v2/prices/coingecko", {
        query: { ids, vs_currencies: "usd,btc", sparkline: true },
        silent: true,
      });

      const data = res?.data || (res && typeof res === "object" && !res.error ? res : null);

      const hasData = data && (
        data.bitcoin || 
        data['bitcoin-cash'] || 
        data.bitcoincash || 
        data.BCH || 
        data.bch ||
        data.ethereum ||
        data.litecoin ||
        data.dogecoin
      );

      if (hasData) {
        setPrices(data);
        if (onPriceUpdate) {
          const formatted = formatPricesForRigCard(data);
          onPriceUpdate(formatted);
        }
      } else {
        const isSystemConfig = data && data.environments && data.default_client;
        const detail = isSystemConfig
          ? "Backend Routing Error: Market API obscured by System Config."
          : typeof res === "string"
            ? res.includes("<!DOCTYPE html>")
              ? "Cloudflare Intercept"
              : `API Error: ${res.slice(0, 100)}`
            : res?.error ||
            res?.message ||
            `Format Mismatch (Keys: ${res ? Object.keys(res).join(",") : "null"})`;

        if (!prices) setError(`Market data unavailable. ${detail}`);
        throw new Error(detail);
      }
    } catch (err) {
      console.error(`[CryptoRate] REST fetch failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [onCall, onPriceUpdate, formatPricesForRigCard]);

  // ✅ Update prices from WebSocket
  useEffect(() => {
    if (wsPrices && Object.keys(wsPrices).length > 0) {
      setPrices(prev => {
        const merged = { ...prev, ...wsPrices };
        if (onPriceUpdate) {
          const formatted = formatPricesForRigCard(wsPrices);
          onPriceUpdate(formatted);
        }
        return merged;
      });
    }
  }, [wsPrices, onPriceUpdate, formatPricesForRigCard]);

  // ✅ Initial fetch and polling (no WebSocket connection)
  useEffect(() => {
    fetchPrices();

    // Polling fallback
    const pollTimer = setInterval(() => {
      if (!wsConnected) {
        console.log("[CryptoRate] WS inactive, polling for updates...");
        fetchPrices();
      }
    }, 60000);
    
    return () => clearInterval(pollTimer);
  }, [fetchPrices, wsConnected]);

  const getPrice = (data) => data?.usd || (typeof data === "number" ? data : 0);

  const results = useMemo(() => {
    const currentInput = parseFloat(amounts[baseCoin]) || 0;
    const baseData = baseCoin === "usd" ? null : getCoinData(baseCoin);
    const usdValue = baseCoin === "usd" ? currentInput : currentInput * getPrice(baseData);

    return COINS.map((coin) => {
      const data = getCoinData(coin.id);
      const price = getPrice(data);
      return {
        ...coin,
        price,
        change: data?.usd_24h_change || 0,
        history: data?.sparkline_in_7d?.price || data?.sparkline || null,
        calculated: price > 0 ? usdValue / price : 0,
        usdValue: usdValue,
      };
    });
  }, [prices, amounts, baseCoin, getCoinData]);

  return (
    <div
      className="crypto-rate-page"
      style={{
        padding: "10px 14px",
        color: "#f8fafc",
        background: "transparent",
        fontFamily: "sans-serif",
        maxWidth: "100%",
        overflow: "hidden",
        boxSizing: "border-box",
        width: "600px",
        height: "500px"
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
          marginBottom: "12px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          paddingBottom: "8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "1.3rem", fontWeight: "900" }}>
            LIVE <span style={{ color: "#60a5fa" }}>CONVERTER</span>
          </span>
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: wsConnected ? "#10b981" : "#f59e0b",
            }}
          />
          <span
            style={{
              opacity: 0.4,
              fontSize: "0.6rem",
              fontWeight: "600",
              textTransform: "uppercase",
            }}
          >
            {wsConnected ? "LIVE" : "POLLING"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "1rem", color: "#60a5fa", fontWeight: "700" }}>
            $
          </span>
          <input
            type="number"
            value={
              baseCoin === "usd"
                ? amounts.usd
                : (results[0]?.usdValue || 0).toFixed(2)
            }
            onChange={(e) => onValueChange("usd", e.target.value)}
            style={{
              width: "120px",
              background: "rgba(30,41,59,0.3)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: "8px",
              padding: "4px 8px",
              fontSize: "1.3rem",
              color: "#fff",
              fontFamily: "monospace",
              outline: "none",
              textAlign: "right",
            }}
            placeholder="0"
          />
          <button
            onClick={fetchPrices}
            style={{
              background: "rgba(96,165,250,0.08)",
              border: "1px solid rgba(96,165,250,0.1)",
              borderRadius: "4px",
              padding: "4px 10px",
              color: "#60a5fa",
              fontSize: "0.8rem",
              fontWeight: "600",
              cursor: "pointer",
              fontFamily: "sans-serif",
              whiteSpace: "nowrap",
            }}
          >
            ⟳
          </button>
        </div>
      </div>

      {/* Square Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
          gap: "8px",
        }}
      >
        {results.map((coin) => (
          <div
            key={coin.id}
            style={{
              aspectRatio: "2 / 1",
              background: baseCoin === coin.id ? "rgba(96,165,250,0.06)" : "rgba(30,41,59,0.12)",
              border: baseCoin === coin.id ? "1px solid rgba(96,165,250,0.15)" : "1px solid rgba(255,255,255,0.03)",
              borderRadius: "10px",
              padding: "14px 12px 12px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              transition: "all 0.2s ease",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: "800", color: "#d660fa", fontSize: "0.85rem" }}>
                {coin.symbol}
              </span>
              <span
                style={{
                  color: coin.change >= 0 ? "#10b981" : "#f87171",
                  fontWeight: "600",
                  fontSize: "0.85rem",
                }}
              >
                {coin.change >= 0 ? "▲" : "▼"} {Math.abs(coin.change).toFixed(1)}%
              </span>
            </div>

            <div style={{ margin: "8px 0" }}>
              <input
                type="number"
                value={
                  baseCoin === coin.id
                    ? amounts[coin.id]
                    : coin.calculated > 0 ? coin.calculated.toFixed(6) : "0.000000"
                }
                onChange={(e) => onValueChange(coin.id, e.target.value)}
                style={{
                  width: "100%",
                  background: "rgba(0,0,0,0.25)",
                  border: "1px solid rgba(255,255,255,0.05)",
                  borderRadius: "6px",
                  padding: "6px 8px",
                  fontSize: "1.2rem",
                  color: "#fff",
                  fontFamily: "monospace",
                  outline: "none",
                  textAlign: "center",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div
              style={{
                fontSize: "0.75rem",
                fontFamily: "monospace",
                color: "rgba(255,255,255,0.35)",
                textAlign: "center",
              }}
            >
              $ {coin.price.toFixed(2)}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div
          style={{
            fontSize: "0.75rem",
            color: "#f87171",
            textAlign: "center",
            marginTop: "10px",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}