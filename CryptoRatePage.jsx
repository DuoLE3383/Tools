// CryptoRatePage.jsx
import { useState, useCallback, useMemo } from 'react';
import { useWebSocket } from './src/components/WebSocketContext';
import { COIN_ALIASES, COINS } from './src/core/coinGrecko.js';

export default function CryptoRatePage({ onNavigateHome, coinPrices }) {
  const [amounts, setAmounts] = useState({ usd: "1000" });
  const [baseCoin, setBaseCoin] = useState("usd");
  const { isConnected: wsConnected, prices: wsPrices } = useWebSocket();

  const onValueChange = (id, val) => {
    setBaseCoin(id);
    // ✅ Merge instead of replace so switching base coins keeps prior amounts
    // (e.g. the USD amount isn't wiped when you select a coin as the base).
    setAmounts(prev => ({ ...prev, [id]: val }));
  };

  // ✅ Clicking a coin card selects it as the base currency. If the user hasn't
  // entered an amount for that coin yet, seed it with its current calculated
  // value so the input is immediately editable and the conversion stays consistent.
  const handleSelectBase = (coin) => {
    const existing = amounts[coin.id];
    const hasExisting = existing !== undefined && existing !== null && existing !== '';
    const baseVal = hasExisting
      ? existing
      : coin.calculated > 0
        ? coin.calculated.toFixed(6)
        : '0';
    setBaseCoin(coin.id);
    setAmounts(prev => ({ ...prev, [coin.id]: baseVal }));
  };

  // Derive the effective price map from the parent-provided REST snapshot
  // (coinPrices) merged with the live WebSocket prices. Deriving via useMemo
  // avoids setState-inside-effect cascading renders.
  const prices = useMemo(() => {
    const base = coinPrices ? { ...coinPrices } : null;
    if (wsPrices && Object.keys(wsPrices).length > 0) {
      return { ...(base || {}), ...wsPrices };
    }
    return base;
  }, [coinPrices, wsPrices]);

  // ✅ Use derived 'prices' instead of a stale 'data' variable
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

  const getPrice = (data) => data?.usd ?? (typeof data === "number" ? data : 0);

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
        calculated: price > 0 ? usdValue / price : 0,
        usdValue: usdValue,
      };
    });
  }, [amounts, baseCoin, getCoinData]);

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
          <span style={{ fontSize: "0.8rem", color: "#60a5fa", fontWeight: "700" }}>
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
              fontSize: "1.5rem",
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
            onClick={() => handleSelectBase(coin)}
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
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: "800", color: "#d660fa", fontSize: "1rem" }}>
                {coin.symbol}
              </span>
              <span
                style={{
                  color: coin.change >= 0 ? "#10b981" : "#f87171",
                  fontWeight: "600",
                  fontSize: "1rem",
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
                  padding: "4px 6px",
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
    </div>
  );
}
