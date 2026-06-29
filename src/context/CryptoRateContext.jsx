// src/context/CryptoRateContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { loadCryptoPriceCache, saveCryptoPriceCache, mergeCryptoPriceCatalog } from "../core/coinGrecko.js";

const CryptoRateContext = createContext();

// CoinGecko coin IDs mapping
const COINGECKO_IDS = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  LTC: 'litecoin',
  DOGE: 'dogecoin',
  BCH: 'bitcoin-cash',
};

function buildRatesFromCatalog(catalog = {}) {
  const nextRates = {
    BTC: { usd: 0, change24h: 0 },
    ETH: { usd: 0, change24h: 0 },
    LTC: { usd: 0, change24h: 0 },
    DOGE: { usd: 0, change24h: 0 },
    BCH: { usd: 0, change24h: 0 },
  };

  Object.keys(COINGECKO_IDS).forEach((symbol) => {
    const coinId = COINGECKO_IDS[symbol];
    const coinData = catalog?.[coinId] || catalog?.[symbol] || catalog?.[symbol.toLowerCase()];
    if (!coinData) return;
    nextRates[symbol] = {
      usd: coinData.usd || 0,
      change24h: coinData.usd_24h_change || coinData.change24h || 0,
      sparkline: coinData.sparkline_in_7d?.price || coinData.sparkline || [],
    };
  });

  return nextRates;
}

export function CryptoRateProvider({ children, onCall }) {
  const [rates, setRates] = useState(() => buildRatesFromCatalog(loadCryptoPriceCache()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [wsStatus, setWsStatus] = useState('disconnected');

  // Fetch rates from CoinGecko via your API
  const fetchRates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ids = Object.values(COINGECKO_IDS).join(',');
      const res = await onCall('/api/v2/prices/coingecko', {
        query: { ids, vs_currencies: 'usd', sparkline: true },
        silent: true,
      });

      const data = res?.data || res;
      
      if (data) {
        const newRates = buildRatesFromCatalog(data);
        setRates(newRates);
        saveCryptoPriceCache(data, { source: "CryptoRateContext.fetchRates" });
        return;
      }

      const cachedPrices = loadCryptoPriceCache();
      if (cachedPrices) {
        setRates(buildRatesFromCatalog(cachedPrices));
      }
    } catch (err) {
      console.error('[CryptoRate] Fetch failed:', err);
      setError(err.message);
      const cachedPrices = loadCryptoPriceCache();
      if (cachedPrices) {
        setRates(buildRatesFromCatalog(cachedPrices));
        setError(null);
      }
    } finally {
      setLoading(false);
    }
  }, [onCall]);

  // WebSocket connection for real-time updates
  useEffect(() => {
    let socket = null;
    let reconnectTimeout = null;
    let isMounted = true;
    let retryCount = 0;

    const connectWs = () => {
      if (!isMounted) return;

      if (socket) {
        socket.onclose = null;
        socket.close();
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/v2/prices/ws`;

      socket = new WebSocket(wsUrl);
      setWsStatus('connecting');

      socket.onopen = () => {
        if (isMounted) setWsStatus('connected');
      };

      socket.onmessage = (event) => {
        if (!isMounted) return;
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'price_update' && message.data) {
            setRates((prev) => {
              const newRates = { ...prev };
              Object.keys(message.data).forEach((key) => {
                const upperKey = key.toUpperCase();
                if (newRates[upperKey]) {
                  newRates[upperKey] = {
                    ...newRates[upperKey],
                    usd: message.data[key].usd || message.data[key] || 0,
                  };
                }
              });
              saveCryptoPriceCache(mergeCryptoPriceCatalog(loadCryptoPriceCache() || {}, message.data), {
                source: "CryptoRateContext.ws",
              });
              return newRates;
            });
          }
        } catch (err) {
          console.warn('[WS] Failed to parse price update', err);
        }
      };

      socket.onclose = () => {
        if (!isMounted) return;
        setWsStatus('disconnected');

        if (retryCount < 3) {
          const delay = Math.min(30000, 5000 * Math.pow(2, retryCount));
          reconnectTimeout = setTimeout(connectWs, delay);
          retryCount++;
        }
      };

      socket.onerror = () => {
        if (isMounted) setWsStatus('error');
      };
    };

    // Initial fetch
    fetchRates();

    // Connect WebSocket
    connectWs();

    // Polling fallback
    const pollInterval = setInterval(() => {
      if (wsStatus !== 'connected') {
        fetchRates();
      }
    }, 60000);

    return () => {
      isMounted = false;
      if (socket) socket.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      clearInterval(pollInterval);
    };
  }, [fetchRates, wsStatus]);

  // Get a specific rate
  const getRate = useCallback((symbol) => {
    const upperSymbol = String(symbol).toUpperCase();
    return rates[upperSymbol] || { usd: 0, change24h: 0 };
  }, [rates]);

  // Get price in USD
  const getPriceInUsd = useCallback((symbol) => {
    const rate = getRate(symbol);
    return rate.usd || 0;
  }, [getRate]);

  // Get BTC price in USD
  const getBtcPrice = useCallback(() => {
    return getPriceInUsd('BTC');
  }, [getPriceInUsd]);

  return (
    <CryptoRateContext.Provider
      value={{
        rates,
        loading,
        error,
        wsStatus,
        getRate,
        getPriceInUsd,
        getBtcPrice,
        fetchRates,
        refresh: fetchRates,
      }}
    >
      {children}
    </CryptoRateContext.Provider>
  );
}

// Hook to use crypto rates
export function useCryptoRates() {
  const context = useContext(CryptoRateContext);
  if (!context) {
    throw new Error('useCryptoRates must be used within a CryptoRateProvider');
  }
  return context;
}

export default CryptoRateProvider;
