// src/hooks/useProfitCalculator.js
import { useState, useEffect, useCallback, useMemo } from 'react';

const PROFIT_CHECK_INTERVAL = 60000; // Check every minute
const BTC_PRICE_UPDATE_INTERVAL = 300000; // Update BTC price every 5 minutes

export function useProfitCalculator({ 
  coin, 
  address, 
  niceHashCostBTC, 
  durationHours = 24,
  electricityCostPerKWh = 0.12,
  powerWatts = 0,
  onCall 
}) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [btcPrice, setBtcPrice] = useState(60000);
  const [profitHistory, setProfitHistory] = useState([]);
  const [isProfitable, setIsProfitable] = useState(null);
  const [lastCheck, setLastCheck] = useState(null);

  // Fetch BTC price
  const fetchBtcPrice = useCallback(async () => {
    try {
      if (typeof onCall === 'function') {
        const result = await onCall('/api/v2/prices/coingecko', {
          query: { coinId: 'bitcoin' },
          silent: true
        });
        if (result?.data?.usd > 0) {
          setBtcPrice(result.data.usd);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch BTC price:', err.message);
    }
  }, [onCall]);

  // Fetch miner stats
  const fetchStats = useCallback(async () => {
    if (!address || !coin) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await onCall('/api/v2/mining-stats/herominers/address', {
        query: { address, coin },
        silent: true
      });

      if (result?.success && result?.data) {
        setStats(result.data);
        setLastCheck(new Date());
        return result.data;
      } else {
        throw new Error(result?.error || 'Failed to fetch stats');
      }
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [address, coin, onCall]);

  // Calculate profit
  const calculateProfit = useCallback((statsData, btcPriceUsd) => {
    if (!statsData) return null;

    const paymentStats = statsData.paymentStats || {};
    const liveStats = statsData.liveStats || {};
    const shareStats = statsData.shareStats?.total || {};

    // Parse amounts from formatted strings
    const parseAmount = (str) => {
      if (!str) return 0;
      const cleaned = str.replace(/[^0-9.]/g, '');
      return parseFloat(cleaned) || 0;
    };

    // Get 24h paid in coin
    const paid24hCoin = parseAmount(paymentStats.paid24h || '0');
    
    // Calculate hourly income in coin
    const hourlyIncomeCoin = paid24hCoin / 24;
    
    // Calculate hourly income in USD
    const hourlyIncomeUSD = hourlyIncomeCoin * (statsData.coinPrice || 0);
    
    // NiceHash cost per hour
    const niceHashCostPerHour = (niceHashCostBTC * btcPriceUsd) / durationHours;
    
    // Electricity cost per hour
    const electricityCostPerHour = (powerWatts / 1000) * electricityCostPerKWh;
    
    // Total cost per hour
    const totalCostPerHour = niceHashCostPerHour + electricityCostPerHour;
    
    // Net profit per hour
    const netProfitPerHour = hourlyIncomeUSD - totalCostPerHour;
    
    // Gross income in BTC per day
    const grossBtcPerDay = paid24hCoin * (statsData.coinPrice || 0) / btcPriceUsd;
    
    // ROI percentage
    const roi = totalCostPerHour > 0 
      ? ((hourlyIncomeUSD - totalCostPerHour) / totalCostPerHour) * 100 
      : 0;

    return {
      // Income
      hourlyIncomeCoin,
      hourlyIncomeUSD,
      paid24hCoin,
      paid24hUSD: paid24hCoin * (statsData.coinPrice || 0),
      
      // Costs
      niceHashCostPerHour,
      niceHashCostPerDay: niceHashCostPerHour * 24,
      electricityCostPerHour,
      electricityCostPerDay: electricityCostPerHour * 24,
      totalCostPerHour,
      totalCostPerDay: totalCostPerHour * 24,
      
      // Profit
      netProfitPerHour,
      netProfitPerDay: netProfitPerHour * 24,
      grossBtcPerDay,
      roi,
      
      // Metrics
      hashrate: liveStats.currentHashrate || '0 H/s',
      workers: liveStats.workersOnline || 0,
      efficiency: shareStats.efficiency || '0%',
      pendingBalance: paymentStats.pendingBalance || '0',
      
      // Timestamp
      timestamp: new Date().toISOString(),
      
      // Is profitable?
      isProfitable: netProfitPerHour > 0,
    };
  }, [niceHashCostBTC, durationHours, powerWatts, electricityCostPerKWh]);

  // Check profit and send alert if negative
  const checkProfit = useCallback(async () => {
    const statsData = await fetchStats();
    if (!statsData) return null;

    const profit = calculateProfit(statsData, btcPrice);
    if (!profit) return null;

    // Update history
    setProfitHistory(prev => [...prev, profit].slice(-100));
    setIsProfitable(profit.isProfitable);

    return profit;
  }, [fetchStats, calculateProfit, btcPrice]);

  // Auto-check on interval
  useEffect(() => {
    // Initial fetch
    checkProfit();
    fetchBtcPrice();

    // BTC price update interval
    const btcInterval = setInterval(fetchBtcPrice, BTC_PRICE_UPDATE_INTERVAL);
    
    // Profit check interval
    const profitInterval = setInterval(checkProfit, PROFIT_CHECK_INTERVAL);

    return () => {
      clearInterval(btcInterval);
      clearInterval(profitInterval);
    };
  }, [checkProfit, fetchBtcPrice]);

  // Get latest profit
  const latestProfit = profitHistory[profitHistory.length - 1] || null;

  return {
    stats,
    loading,
    error,
    btcPrice,
    profit: latestProfit,
    profitHistory,
    isProfitable,
    lastCheck,
    checkProfit,
    fetchStats,
    calculateProfit,
  };
}