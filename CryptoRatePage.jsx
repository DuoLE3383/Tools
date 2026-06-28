// CryptoRatePage.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import "./src/components/CryptoRatePage.css"; // Import the new CSS file
 
const COINS = [
  { id: "bitcoin", symbol: "BTC", name: "Bitcoin" },
  { id: "ethereum", symbol: "ETH", name: "Ethereum" },
  { id: "litecoin", symbol: "LTC", name: "Litecoin" },
  { id: "dogecoin", symbol: "DOGE", name: "Dogecoin" },
  { id: "bitcoin-cash", symbol: "BCH", name: "Bitcoin Cash" },
];

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

export default function CryptoRatePage({ onCall, onPriceUpdate, onNavigateHome }) {
  const [prices, setPrices] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [wsStatus, setWsStatus] = useState("disconnected");
  const [wsEnabled, setWsEnabled] = useState(true);
  const [amounts, setAmounts] = useState({ usd: "1000" });
  const [baseCoin, setBaseCoin] = useState("usd");

  const onValueChange = (id, val) => {
    setBaseCoin(id);
    setAmounts({ [id]: val });
  };

  // ✅ Function to format prices for MrrRigCard
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

  const fetchPrices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ids = COINS.map((c) => c.id).join(",");
      const res = await onCall("/api/v2/prices/coingecko", { // CMC endpoint is deprecated
        query: { ids, vs_currencies: "usd,btc", sparkline: true },
        silent: true,
      });

      const data = res?.data || (res && typeof res === "object" && !res.error ? res : null);

      if (data && (data.bitcoin || data.BTC || data.btc)) {
        setPrices(data);
        // ✅ Send formatted prices to parent
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

        if (isSystemConfig) setWsEnabled(false);
        if (!prices) setError(`Market data unavailable. ${detail}`);
        throw new Error(detail);
      }
    } catch (err) {
      console.error(`[CryptoRate] REST fetch failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [onCall, onPriceUpdate, formatPricesForRigCard]);

  useEffect(() => {
    fetchPrices();

    let socket = null;
    let reconnectTimeout = null;
    let isComponentMounted = true;
    let retryCount = 0;

    const connectWs = () => {
      if (!isComponentMounted || !wsEnabled) return;

      if (socket) {
        socket.onclose = null;
        socket.close();
      }

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/api/v2/prices/ws`;

      socket = new WebSocket(wsUrl);
      if (isComponentMounted) setWsStatus("connecting");

      socket.onopen = () => {
        if (isComponentMounted) setWsStatus("connected");
      };

      socket.onmessage = (event) => {
        if (!isComponentMounted) return;
        try {
          const message = JSON.parse(event.data);
          if (message.type === "price_update" && message.data) {
            setPrices((prev) => ({ ...prev, ...message.data }));
            // ✅ Send updated prices to parent
            if (onPriceUpdate) {
              const formatted = formatPricesForRigCard(message.data);
              onPriceUpdate(formatted);
            }
          }
        } catch (err) {
          console.warn("[WS] Failed to parse price update", err);
        }
      };

      socket.onclose = () => {
        if (!isComponentMounted) return;
        setWsStatus("disconnected");

        if (retryCount < 2 && wsEnabled) {
          const delay = Math.min(30000, 5000 * Math.pow(2, retryCount));
          reconnectTimeout = setTimeout(connectWs, delay);
          retryCount++;
        } else {
          setWsEnabled(false);
          console.warn("[WS] Maximum reconnection attempts reached.");
        }
      };

      socket.onerror = () => {
        if (isComponentMounted) setWsStatus("error");
      };
    };

    if (wsEnabled) connectWs();

    return () => {
      isComponentMounted = false;
      if (socket) socket.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [fetchPrices, wsEnabled, onPriceUpdate, formatPricesForRigCard]);

  // Polling fallback
  useEffect(() => {
    const pollTimer = setInterval(() => {
      if (wsStatus !== "connected" && !loading) {
        console.log("[CryptoRate] WS inactive, polling for updates...");
        fetchPrices();
      }
    }, 60000);
    return () => clearInterval(pollTimer);
  }, [fetchPrices, wsStatus, loading]);

  const getCoinData = (id) => {
    const coin = COINS.find((c) => c.id === id);
    return prices?.[id] || prices?.[coin?.symbol] || prices?.[coin?.symbol?.toLowerCase()];
  };

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
  }, [prices, amounts, baseCoin]);

  return (
    <div
      className="crypto-rate-page" // Styles are now in CryptoRatePage.css
    >
      <button
        className="btn-pro secondary btn-back"
        onClick={onNavigateHome}
      >
        ← Back
      </button>

      {/* Header */}
      <div className="crypto-rate-header">
        <div className="crypto-rate-header-title">
          <span className="title-text">
            LIVE <span className="title-text-highlight">CONVERTER</span>
          </span>
          <div
            className={`status-indicator ${wsStatus === "connected" ? "connected" : "disconnected"}`}
          />
          <span className="status-label">LIVE</span>
        </div>
        <div className="crypto-rate-header-input-group">
          <span className="usd-symbol">$</span>
          <input
            type="number"
            className="usd-input"
            value={
              baseCoin === "usd"
                ? amounts.usd
                : (results[0]?.usdValue || 0).toFixed(2)
            }
            onChange={(e) => onValueChange("usd", e.target.value)}
            placeholder="0"
          />
          <button onClick={fetchPrices} className="refresh-btn">
            ⟳
          </button>
        </div>
      </div>

      {/* Square Grid */}
      <div className="crypto-grid">
        {results.map((coin) => (
          <div
            key={coin.id}
            className={`crypto-card ${baseCoin === coin.id ? "active" : ""}`}
          >
            <div className="crypto-card-header">
              <span className="crypto-card-symbol">{coin.symbol}</span>
              <span
                className={`crypto-card-change ${coin.change >= 0 ? "positive" : "negative"}`}
              >
                {coin.change >= 0 ? "▲" : "▼"} {Math.abs(coin.change).toFixed(1)}%
              </span>
            </div>

            <div className="crypto-card-input-wrapper">
              <input
                type="number"
                className="crypto-card-input"
                value={
                  baseCoin === coin.id
                    ? amounts[coin.id]
                    : coin.calculated > 0 ? coin.calculated.toFixed(6) : "0.000000"
                }
                onChange={(e) => onValueChange(coin.id, e.target.value)}
              />
            </div>

            <div className="crypto-card-price">
              $ {coin.price.toFixed(2)}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="crypto-rate-error">{error}</div>
      )}
    </div>
  );
}