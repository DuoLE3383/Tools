// CryptoRatePage.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useWebSocket } from './src/components/WebSocketContext';
import { COIN_ALIASES, COINS } from './src/core/coinGrecko.js';

function Sparkline({ data, width = 180, height = 80, color = "#60a5fa" }) {
  if (!data || !Array.isArray(data) || data.length < 2) {
    return (
      <div
        style={{
          width,
          height,
          background: "rgba(255,255,255,0.02)",
          borderRadius: "8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      />
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((val, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ overflow: "visible", filter: `drop-shadow(0 0 4px ${color}44)` }}
    >
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

export default function CryptoRatePage({ onCall, onPriceUpdate, onNavigateHome, coinPrices }) {
  const [prices, setPrices] = useState(coinPrices || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [amounts, setAmounts] = useState({ usd: "1000" });
  const [baseCoin, setBaseCoin] = useState("usd");
  const { isConnected: wsConnected, prices: wsPrices } = useWebSocket();

  const onValueChange = (id, val) => {
    setBaseCoin(id);
    setAmounts({ [id]: val });
  };

  useEffect(() => {
    if (coinPrices) setPrices(coinPrices);
  }, [coinPrices]);

  const formatPricesForRigCard = useCallback((data) => {
    const formatted = {};
    Object.keys(data).forEach(key => {
      const coinData = data[key];
      // Find the matching COIN entry
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

  // ✅ FIXED: Use 'prices' instead of 'data'
  const getCoinData = useCallback((coinOrId) => {
    if (!prices) return null;
    
    const coin = COINS.find((c) => c.id === coinOrId || c.symbol === coinOrId);
    const candidates = [
      coinOrId,
      coin?.id,
      coin?.symbol,
      coin?.symbol?.toLowerCase(),
      coin?.symbol?.replace(/[^a-z0-9]/gi, "").toLowerCase(),
      ...(coin?.id ? COIN_ALIASES[coin.id] || [] : []),
    ].filter(Boolean);

    for (const key of candidates) {
      if (prices[key]) return prices[key];
      const lowerKey = String(key).toLowerCase();
      if (prices[lowerKey]) return prices[lowerKey];
      const upperKey = String(key).toUpperCase();
      if (prices[upperKey]) return prices[upperKey];
    }

    return null;
  }, [prices]);

  useEffect(() => {
    if (wsPrices && Object.keys(wsPrices).length > 0) {
      setPrices(prev => {
        const merged = { ...prev, ...wsPrices };
        // Parent now handles updates via PriceManager
        return merged;
      });
    }
  }, [wsPrices]);

  const getPrice = (data) => data?.usd || (typeof data === "number" ? data : 0);

  const results = useMemo(() => {
    const currentInput = parseFloat(amounts[baseCoin]) || 0;
    const baseData = baseCoin === 'usd' ? null : getCoinData(baseCoin);
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
      <button
        className="btn-pro secondary"
        onClick={onNavigateHome}
        style={{
          position: "absolute",
          top: "12px",
          left: "12px",
          zIndex: 10,
        }}
      >
        ← Back
      </button>

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