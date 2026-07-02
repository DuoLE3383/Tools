// CryptoRatePage.jsx - Add callback to share prices
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  loadCryptoPriceCache,
  saveCryptoPriceCache,
  mergeCryptoPriceCatalog,
} from "../core/coinGrecko.js";

const COINS = [
  { id: "bitcoin", symbol: "BTC", name: "Bitcoin" },
  { id: "ethereum", symbol: "ETH", name: "Ethereum" },
  { id: "litecoin", symbol: "LTC", name: "Litecoin" },
  { id: "dogecoin", symbol: "DOGE", name: "Dogecoin" },
  { id: "bitcoin-cash", symbol: "BCH", name: "Bitcoin Cash" },
];

const COIN_ALIASES = {
  bitcoin: ["bitcoin", "BTC", "btc"],
  ethereum: ["ethereum", "ETH", "eth"],
  litecoin: ["litecoin", "LTC", "ltc"],
  dogecoin: ["dogecoin", "DOGE", "doge"],
  "bitcoin-cash": ["bitcoin-cash", "bitcoin_cash", "bitcoincash", "BCH", "bch"],
};

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

export default function CryptoRatePage({ onCall, onPriceUpdate }) {
  const [prices, setPrices] = useState(() => loadCryptoPriceCache());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [wsStatus, setWsStatus] = useState("disconnected");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [amounts, setAmounts] = useState({ usd: "1000" });
  const [baseCoin, setBaseCoin] = useState("usd");

  const onValueChange = (id, val) => {
    setBaseCoin(id);
    setAmounts({ [id]: val });
  };

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

  const resolveCoinData = useCallback((data, coinOrId) => {
    if (!data) return null;
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
      if (data[key]) return data[key];
      const lowerKey = String(key).toLowerCase();
      if (data[lowerKey]) return data[lowerKey];
      const upperKey = String(key).toUpperCase();
      if (data[upperKey]) return data[upperKey];
    }
    return null;
  }, []);

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
      if (data && (data.bitcoin || data.BTC || data.btc || data["bitcoin-cash"] || data.BCH || data.bch)) {
        setPrices(data);
        setLastUpdated(new Date());
        saveCryptoPriceCache(data, { source: "CryptoRatePage.fetchPrices" });
        if (onPriceUpdate) {
          onPriceUpdate(formatPricesForRigCard(data));
        }
      } else {
        const isSystemConfig = data && data.environments && data.default_client;
        const detail = isSystemConfig
          ? "Backend Routing Error: Market API obscured by System Config."
          : typeof res === "string"
            ? res.includes("<!DOCTYPE html>") ? "Cloudflare Intercept" : `API Error: ${res.slice(0, 100)}`
            : res?.error || res?.message || `Format Mismatch (Keys: ${res ? Object.keys(res).join(",") : "null"})`;
        const cachedPrices = loadCryptoPriceCache();
        if (cachedPrices) {
          setPrices(cachedPrices);
          if (cachedPrices.timestamp) setLastUpdated(new Date(cachedPrices.timestamp));
          if (onPriceUpdate) onPriceUpdate(formatPricesForRigCard(cachedPrices));
          setError(`Live market data unavailable. Showing cached prices. ${detail}`);
          return;
        }
        if (!prices) setError(`Market data unavailable. ${detail}`);
        throw new Error(detail);
      }
    } catch (err) {
      console.error(`[CryptoRate] REST fetch failed: ${err.message}`);
      const cachedPrices = loadCryptoPriceCache();
      if (cachedPrices) {
        setPrices(cachedPrices);
        if (cachedPrices.timestamp) setLastUpdated(new Date(cachedPrices.timestamp));
        if (onPriceUpdate) onPriceUpdate(formatPricesForRigCard(cachedPrices));
        setError(`Live market data unavailable. Showing cached prices.`);
      } else if (!prices) {
        setError(`Market data unavailable. ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  }, [onCall, onPriceUpdate, formatPricesForRigCard]);

  useEffect(() => {
    fetchPrices();
  }, [fetchPrices]);

  // Use refs to hold stable references to callbacks inside the WebSocket effect
  const onPriceUpdateRef = useRef(onPriceUpdate);
  const formatPricesForRigCardRef = useRef(formatPricesForRigCard);
  useEffect(() => {
    onPriceUpdateRef.current = onPriceUpdate;
    formatPricesForRigCardRef.current = formatPricesForRigCard;
  });
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    let ws = null;
    let reconnectTimeout = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;

    const connectWebSocket = () => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/v2/prices/ws?token=${encodeURIComponent(token)}`;
        
        console.log('[WebSocket] Connecting to:', wsUrl.replace(/token=[^&]+/, 'token=***'));
        
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log('[WebSocket] Connected successfully');
          setWsStatus("connected");
          reconnectAttempts = 0;
          // Send a ping to keep the connection alive
          const pingInterval = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ping' }));
            } else {
              clearInterval(pingInterval);
            }
          }, 30000);
          ws._pingInterval = pingInterval;
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'price_update' && data.data) {
              setPrices((prev) => {
                const merged = mergeCryptoPriceCatalog(prev, data.data);
                saveCryptoPriceCache(merged, { source: "CryptoRatePage.ws" }); // Keep saving cache
                if (onPriceUpdateRef.current) {
                  onPriceUpdateRef.current(formatPricesForRigCardRef.current(data.data));
                }
                setLastUpdated(new Date());
                return merged;
              });
            } else if (data.type === 'pong') {
              // Heartbeat response, ignore
            }
          } catch (err) {
            console.error('[WebSocket] Failed to parse message:', err);
          }
        };

        ws.onerror = (error) => {
          console.error('[WebSocket] Error:', error);
          setWsStatus("error");
        };

        ws.onclose = (event) => {
          console.log(`[WebSocket] Closed: ${event.code} - ${event.reason}`);
          setWsStatus("disconnected");
          
          if (ws && ws._pingInterval) clearInterval(ws._pingInterval);
          
          if (reconnectAttempts < maxReconnectAttempts) {
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
            reconnectAttempts++;
            console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${maxReconnectAttempts})`);
            
            reconnectTimeout = setTimeout(connectWebSocket, delay);
          } else {
            console.error('[WebSocket] Max reconnect attempts reached');
          }
        };
      } catch (err) {
        console.error('[WebSocket] Connection error:', err);
      }
    };

    connectWebSocket();

    // Cleanup
    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) {
        if (ws._pingInterval) clearInterval(ws._pingInterval);
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close(1000, 'Component unmounting');
        }
      }
    };
  }, []); // This effect should only run once on mount to establish the connection.

  useEffect(() => {
    const pollTimer = setInterval(() => {
      if (wsStatus !== "connected" && !loading) {
        fetchPrices();
      }
    }, 60000);
    return () => clearInterval(pollTimer);
  }, [fetchPrices, wsStatus, loading]);

  const getCoinData = (id) => resolveCoinData(prices, id);
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
        usdValue,
      };
    });
  }, [prices, amounts, baseCoin]);

  return (
    <div
      className="crypto-rate-page"
      style={{
        padding: "10px 14px",
        color: "#f8fafc",
        background: "transparent",
        fontFamily: "sans-serif",
        overflow: "hidden",
        boxSizing: "border-box",
        width: "60%",
        maxWidth: "60%",
      }}
    >
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
              background: wsStatus === "connected" ? "#10b981" : "#f59e0b",
            }}
          />
          <span style={{ opacity: 0.4, fontSize: "0.6rem", fontWeight: "600", textTransform: "uppercase" }}>
            {wsStatus === "connected" ? "LIVE" : "POLLING"}
          </span>
          {lastUpdated && <span style={{ opacity: 0.5, fontSize: '0.6rem', marginLeft: '6px' }}>
          Updated at {lastUpdated.toLocaleTimeString()}
          </span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "1rem", color: "#60a5fa", fontWeight: "700" }}>$</span>
          <input
            type="number"
            value={baseCoin === "usd" ? amounts.usd : (results[0]?.usdValue || 0).toFixed(2)}
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: "10px",
          maxWidth: "400px",
          margin: "0 auto",
          padding: "0 14px",
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
              <span style={{ fontWeight: "800", color: "#d660fa", fontSize: "0.85rem" }}>{coin.symbol}</span>
              <span style={{ color: coin.change >= 0 ? "#10b981" : "#f87171", fontWeight: "600", fontSize: "0.85rem" }}>
                {coin.change >= 0 ? "▲" : "▼"} {Math.abs(coin.change).toFixed(1)}%
              </span>
            </div>
            <div style={{ margin: "8px 0" }}>
              <input
                type="number"
                value={baseCoin === coin.id ? amounts[coin.id] : coin.calculated > 0 ? coin.calculated.toFixed(6) : "0.000000"}
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
            <div style={{ fontSize: "0.75rem", fontFamily: "monospace", color: "rgba(255,255,255,0.35)", textAlign: "center" }}>
              $ {coin.price.toFixed(2)}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div style={{ fontSize: "0.75rem", color: "#f87171", textAlign: "center", marginTop: "10px" }}>
          {error}
        </div>
      )}
    </div>
  );
}
