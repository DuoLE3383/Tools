// src/context/CryptoRateContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useWebSocket } from './WebSocketContext'; // Import the new hook

const CryptoRateContext = createContext();

// CoinGecko coin IDs mapping
const COINGECKO_IDS = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  LTC: 'litecoin',
  DOGE: 'dogecoin',
  BCH: 'bitcoin-cash',
};

export function CryptoRateProvider({ children, onCall }) {
  const [rates, setRates] = useState({
    BTC: { usd: 0, change24h: 0 },
    ETH: { usd: 0, change24h: 0 },
    LTC: { usd: 0, change24h: 0 },
    DOGE: { usd: 0, change24h: 0 },
    BCH: { usd: 0, change24h: 0 },
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Get status from the central provider
  const { status: wsStatus, subscribe, unsubscribe } = useWebSocket();

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
        const newRates = {};
        Object.keys(COINGECKO_IDS).forEach((symbol) => {
          const coinId = COINGECKO_IDS[symbol];
          const coinData = data[coinId];
          if (coinData) {
            newRates[symbol] = {
              usd: coinData.usd || 0,
              change24h: coinData.usd_24h_change || 0,
              sparkline: coinData.sparkline_in_7d?.price || [],
            };
          }
        });
        setRates(newRates);
      }
    } catch (err) {
      console.error('[CryptoRate] Fetch failed:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [onCall]);

  // Subscribe to WebSocket updates
  useEffect(() => {
    const handleMessage = (message) => {
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
          return newRates;
        });
      }
    };

    fetchRates();
    subscribe('crypto-rate-context', handleMessage);

    // Polling fallback
    const pollInterval = setInterval(() => {
      if (wsStatus !== 'connected') {
        fetchRates();
      }
    }, 60000);

    return () => {
      unsubscribe('crypto-rate-context');
      clearInterval(pollInterval);
    };
  }, [fetchRates, subscribe, unsubscribe, wsStatus]);

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