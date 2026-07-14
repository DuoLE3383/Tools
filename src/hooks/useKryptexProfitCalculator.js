// src/hooks/useKryptexProfitCalculator.js — Profit calculator for Kryptex pool
// Mirrors useProfitCalculator.js but uses Kryptex API for miner stats instead of HeroMiners
import { useState, useEffect, useCallback } from 'react';
import { getAlgoMapping } from '../core/mapping.js';

const orderCache = new Map();
const ORDER_CACHE_TTL = 15000;
const btcPriceCache = new Map();
const BTC_PRICE_CACHE_TTL = 120000;
const PROFIT_CHECK_INTERVAL = 60000;

const COIN_TO_ALGO = {
  'ETC': 'ETCHASH',
  'XMR': 'RANDOMXMONERO',
  'CFX': 'OCTOPUS',
  'ERG': 'AUTOLYKOS2',
  'RVN': 'KAWPOW',
  'BEAM': 'BEAMV3',
  'FLUX': 'ZELHASH',
  'ALPH': 'BLAKE3',
};

export function useKryptexProfitCalculator({
  pair,
  onCall,
  nhClient = 'VN',
  manualNiceHashOrderId = null,
}) {
  const [stats, setStats] = useState(null);
  const [orderData, setOrderData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [btcPrice, setBtcPrice] = useState(60000);
  const [profitHistory, setProfitHistory] = useState([]);
  const [isProfitable, setIsProfitable] = useState(null);
  const [lastCheck, setLastCheck] = useState(null);
  const [currentHashrateGH, setCurrentHashrateGH] = useState(0);
  const [niceHashOrderId, setNiceHashOrderId] = useState(null);
  const [niceHashPriceBTC, setNiceHashPriceBTC] = useState(0);
  const [orderedHashrateGH, setOrderedHashrateGH] = useState(0);
  const [orderSpeedRaw, setOrderSpeedRaw] = useState(0);
  const [orderUnit, setOrderUnit] = useState('GH');
  const [orderIsActive, setOrderIsActive] = useState(false);

  const { coin, address } = pair || {};

  // Fetch BTC price
  const fetchBtcPrice = useCallback(async () => {
    const cacheKey = 'btcPrice';
    const cached = btcPriceCache.get(cacheKey);
    if (cached && (Date.now() - cached.ts < BTC_PRICE_CACHE_TTL)) {
      if (cached.price > 0) setBtcPrice(cached.price);
      return;
    }
    try {
      const result = await onCall('/api/v2/prices/coingecko', {
        query: { coinId: 'bitcoin' },
        silent: true,
      });
      if (result?.data?.usd > 0) {
        setBtcPrice(result.data.usd);
        btcPriceCache.set(cacheKey, { price: result.data.usd, ts: Date.now() });
      }
    } catch (err) {
      console.warn('[KryptexProfit] Failed to fetch BTC price:', err.message);
    }
  }, [onCall]);

  // Fetch miner stats from Kryptex API
  const fetchStats = useCallback(async () => {
    if (!address || !coin) return null;
    setLoading(true);
    setError(null);
    try {
      const result = await onCall('/api/v2/mining-stats/kryptex', {
        query: { coin: coin.toLowerCase(), address },
        silent: true,
      });
      if (result?.success && result?.stats) {
        setStats(result);
        setLastCheck(new Date());
        return result;
      }
      throw new Error(result?.error || 'Failed to fetch Kryptex stats');
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [address, coin, onCall]);

  // Get algorithm for a coin on Kryptex
  const getCoinAlgorithm = useCallback((coinName) => {
    return COIN_TO_ALGO[coinName?.toUpperCase()] || coinName?.toUpperCase() || 'UNKNOWN';
  }, []);

  const getOrderUnit = useCallback((order) => {
    if (!order) return 'GH';
    if (order.algorithm?.displayMarketFactor) {
      const factor = order.algorithm.displayMarketFactor;
      if (factor >= 1e9) return 'GH';
      if (factor >= 1e6) return 'MH';
      if (factor >= 1e3) return 'KH';
      return 'H';
    }
    if (order.priceUnit) {
      const unit = order.priceUnit.toUpperCase().replace('/S', '');
      if (['H', 'KH', 'MH', 'GH', 'TH', 'PH'].includes(unit)) return unit;
    }
    const algo = typeof order.algorithm === 'object' ? order.algorithm.algorithm : order.algorithm;
    if (algo?.toUpperCase() === 'RANDOMXMONERO' || algo?.toUpperCase() === 'RANDOMX') return 'KH';
    const mapping = getAlgoMapping(algo);
    return mapping.unit || 'GH';
  }, []);

  const getOrderSpeed = useCallback((order) => {
    if (!order) return { speed: 0, unit: 'GH', field: null };
    const speedFields = ['acceptedCurrentSpeed', 'currentSpeed', 'speed', 'acceptedSpeed', 'hashrate', 'currentHashrate', 'rigsSpeed', 'totalSpeed'];
    let speed = 0, speedField = null;
    for (const field of speedFields) {
      if (order[field] !== undefined && order[field] !== null) {
        const val = parseFloat(order[field]);
        if (val >= 0) { speed = val; speedField = field; break; }
      }
    }
    const isActive = (order.status?.code || order.status) === 'ACTIVE';
    return { speed, unit: getOrderUnit(order), field: speedField, isActive, rigsCount: order.rigsCount || 0 };
  }, [getOrderUnit]);

  const convertToGH = useCallback((value, unit) => {
    const units = { 'H': 1e-9, 'KH': 1e-6, 'MH': 1e-3, 'GH': 1, 'TH': 1e3, 'PH': 1e6 };
    const normalizedUnit = unit?.toUpperCase().replace('/S', '') || 'GH';
    let result = value * (units[normalizedUnit] || 1);
    if (result === 0 && value > 0) {
      if (value >= 1 && value < 10000) result = value / 1000;
      else if (value >= 0.001 && value < 1) result = value;
      else if (value >= 10000) result = value / 1000;
    }
    return result;
  }, []);

  // Sync NiceHash order
  const syncNiceHashOrder = useCallback(async () => {
    if (!coin) return null;
    try {
      let orderToUse = null;
      if (manualNiceHashOrderId) {
        const orderResult = await onCall(`/api/v2/hashpower/order/${manualNiceHashOrderId}`, {
          query: { client: nhClient }, silent: true,
        });
        if (orderResult && !orderResult.error) {
          const order = orderResult.data || orderResult;
          const algo = getCoinAlgorithm(coin);
          const orderAlgo = typeof order.algorithm === 'object' ? order.algorithm.algorithm : order.algorithm;
          if (orderAlgo?.toUpperCase() === algo?.toUpperCase()) orderToUse = order;
        }
      } else {
        const cacheKey = `myOrders:${nhClient}`;
        const cached = orderCache.get(cacheKey);
        let ordersResult;
        if (cached && (Date.now() - cached.ts < ORDER_CACHE_TTL)) {
          ordersResult = cached.data;
        } else {
          ordersResult = await onCall('/api/v2/hashpower/myOrders', {
            query: { op: 'LE', limit: 100, client: nhClient }, silent: true,
          });
          if (ordersResult?.list || ordersResult?.myOrders) {
            orderCache.set(cacheKey, { data: ordersResult, ts: Date.now() });
          }
        }
        const orders = ordersResult?.list || ordersResult?.myOrders || [];
        const algo = getCoinAlgorithm(coin);
        orderToUse = orders.find(o => {
          const orderAlgo = typeof o.algorithm === 'object' ? o.algorithm.algorithm : o.algorithm;
          return orderAlgo?.toUpperCase() === algo?.toUpperCase() && (o.status?.code || o.status) === 'ACTIVE';
        });
      }
      if (orderToUse) {
        const speedInfo = getOrderSpeed(orderToUse);
        return { order: orderToUse, speedInfo };
      }
      return null;
    } catch (err) {
      console.warn('[KryptexProfit] Failed to sync NH order:', err.message);
      return null;
    }
  }, [coin, nhClient, onCall, manualNiceHashOrderId, getCoinAlgorithm, getOrderSpeed]);

  // Calculate profit from Kryptex data
  const calculateProfit = useCallback((kryptexResult, btcPriceUsd, orderInfo) => {
    if (!kryptexResult?.stats) return null;

    const stats = kryptexResult.stats;
    const balance = stats.balance || {};
    const hashrate = stats.hashrate || {};
    const workers = stats.workers || {};
    const workerTable = stats.workerTable || [];

    // Parse hashrate to H/s
    const parseHashrate = (str) => {
      if (!str) return 0;
      const cleaned = str.replace(/[^0-9.eE-]/g, '');
      const num = parseFloat(cleaned) || 0;
      if (str.includes('TH')) return num * 1e12;
      if (str.includes('GH')) return num * 1e9;
      if (str.includes('MH')) return num * 1e6;
      if (str.includes('KH')) return num * 1e3;
      return num;
    };

    const currentHashH = parseHashrate(hashrate.current || '0 H/s');
    const currentHashGH = currentHashH / 1e9;
    const paid24hCoin = balance.reward7d || 0; // 7d reward as approximation for 24h paid
    const hourlyIncomeCoin = paid24hCoin / 24;

    // Try to get coin price
    const coinSymbol = coin?.toLowerCase() || '';
    const coinPrice = stats.coinPrice || 0;

    const grossBtcPerDay = coinPrice > 0 ? (paid24hCoin * coinPrice / btcPriceUsd) : 0;
    const hourlyIncomeUSD = hourlyIncomeCoin * coinPrice;

    const order = orderInfo?.order || null;
    const speedInfo = orderInfo?.speedInfo || { speed: 0, unit: 'GH', isActive: false };
    const orderPrice = parseFloat(order?.price || 0);

    // Use order.limit for cost calculation, not current speed.
    const orderedSpeed = parseFloat(order?.limit || 0);
    const orderUnit = getOrderUnit(order);
    const isActive = speedInfo.isActive || false;

    let costPerDay = 0, costPerHour = 0, costPerDayUSD = 0, costPerHourUSD = 0;
    if (isActive && orderedSpeed > 0) {
      costPerDay = orderPrice * orderedSpeed;
      costPerHour = costPerDay / 24;
      costPerDayUSD = costPerDay * btcPriceUsd;
      costPerHourUSD = costPerHour * btcPriceUsd;
    }

    const totalPaidBTC = parseFloat(order?.payedAmount || 0);
    const totalPaidUSD = totalPaidBTC * btcPriceUsd;
    const netProfitPerHour = hourlyIncomeUSD - costPerHourUSD;
    const netProfitPerDay = netProfitPerHour * 24;
    const netProfitBTC = grossBtcPerDay - costPerDay;
    const roi = costPerHourUSD > 0 ? ((hourlyIncomeUSD - costPerHourUSD) / costPerHourUSD) * 100 : (hourlyIncomeUSD > 0 ? 100 : 0);

    return {
      hourlyIncomeCoin, hourlyIncomeUSD,
      paid24hCoin, paid24hUSD: paid24hCoin * coinPrice,
      grossBtcPerDay,
      niceHashPrice: orderPrice,
      orderedHashrate: convertToGH(orderedSpeed, orderUnit),
      orderSpeedRaw: speedInfo.speed, // Current speed
      orderUnit: speedInfo.unit,
      orderIsActive: isActive,
      costPerHour, costPerDay, costPerHourUSD, costPerDayUSD,
      nhTotalPaidBTC: totalPaidBTC, nhTotalPaidUSD: totalPaidUSD,
      netProfitPerHour, netProfitPerDay, netProfitBTC, roi,
      hashrate: hashrate.current || '0 H/s',
      workers: workers.online || 0,
      pendingBalance: `${(balance.unpaid || 0).toFixed(6)} ${coin?.toUpperCase() || ''}`,
      totalPaid: `${(balance.totalPaid || 0).toFixed(6)} ${coin?.toUpperCase() || ''}`,
      coinPrice, btcPrice: btcPriceUsd,
      timestamp: new Date().toISOString(),
      isProfitable: netProfitPerHour > 0,
    };
  }, [coin, convertToGH, getOrderUnit]);

  // Check profit
  const checkProfit = useCallback(async () => {
    const [statsData, orderInfo] = await Promise.all([fetchStats(), syncNiceHashOrder()]);
    if (!statsData) return null;
    const profit = calculateProfit(statsData, btcPrice, orderInfo);
    if (!profit) return null;

    const order = orderInfo?.order || null;
    const speedInfo = orderInfo?.speedInfo || { speed: 0, unit: 'GH', isActive: false };
    if (order) {
      setNiceHashOrderId(order.id);
      setNiceHashPriceBTC(parseFloat(order.price || 0));
      setOrderSpeedRaw(speedInfo.speed);
      setOrderUnit(speedInfo.unit);
      setOrderIsActive(speedInfo.isActive);

      const orderedSpeed = parseFloat(order.limit || 0);
      const orderCostUnit = getOrderUnit(order);
      const orderedSpeedGH = convertToGH(orderedSpeed, orderCostUnit);
      const speedGH = convertToGH(speedInfo.speed, speedInfo.unit);
      setOrderedHashrateGH(orderedSpeedGH);
      setCurrentHashrateGH(speedGH);
      setOrderData(order);
    } else {
      setNiceHashOrderId(null); setNiceHashPriceBTC(0); setOrderedHashrateGH(0); setOrderData(null); setOrderIsActive(false);
    }
    setProfitHistory(prev => [...prev, profit].slice(-100));
    setIsProfitable(profit.isProfitable);
    return profit;
  }, [fetchStats, syncNiceHashOrder, calculateProfit, btcPrice, convertToGH, getOrderUnit]);

  // Auto-check on interval
  useEffect(() => {
    if (!pair) return;
    checkProfit();
    fetchBtcPrice();
    const btcInterval = setInterval(fetchBtcPrice, BTC_PRICE_CACHE_TTL);
    const profitInterval = setInterval(checkProfit, PROFIT_CHECK_INTERVAL);
    return () => { clearInterval(btcInterval); clearInterval(profitInterval); };
  }, [pair, checkProfit, fetchBtcPrice]);

  const latestProfit = profitHistory[profitHistory.length - 1] || null;

  return {
    stats, orderData, loading, error, btcPrice,
    profit: latestProfit, profitHistory, isProfitable,
    lastCheck, checkProfit, currentHashrateGH,
    niceHashOrderId, niceHashPriceBTC, orderedHashrateGH,
    orderSpeedRaw, orderUnit, orderIsActive, pair,
  };
}
