// src/hooks/useProfitCalculator.js
import { useState, useEffect, useCallback } from 'react';
import { getAlgoMapping } from '../core/mapping.js';

const orderCache = new Map();
const ORDER_CACHE_TTL = 15000;
const btcPriceCache = new Map();
const BTC_PRICE_CACHE_TTL = 60000;

const PROFIT_CHECK_INTERVAL = 60000;
const BTC_PRICE_UPDATE_INTERVAL = 300000;

export function useProfitCalculator({ 
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
      if (cached.price > 0) {
        setBtcPrice(cached.price);
      }
      return;
    }

    try {
      const result = await onCall('/api/v2/prices/coingecko', {
        query: { coinId: 'bitcoin' },
        silent: true
      });
      if (result?.data?.usd > 0) {
        setBtcPrice(result.data.usd);
        btcPriceCache.set(cacheKey, { price: result.data.usd, ts: Date.now() });
      }
    } catch (err) {
      console.warn('Failed to fetch BTC price:', err.message);
    }
  }, [onCall]);

  // Fetch HeroMiners stats
  const fetchStats = useCallback(async () => {
    if (!address || !coin) return null;
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await onCall('/api/v2/mining-stats/herominers/address', {
        query: { address, coin },
        silent: true
      });

      if (result?.success && result.data) {
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

  // Get algorithm for a coin
  const getCoinAlgorithm = useCallback((coinName) => {
    const coinUpper = coinName?.toUpperCase() || '';
    const algoMap = {
      'QRL': 'RANDOMXMONERO',
      'XMR': 'RANDOMXMONERO',
      'ZEPH': 'RANDOMXMONERO',
      'SALVIUM': 'RANDOMXMONERO',
      'CFX': 'OCTOPUS',
      'CONFLUX': 'OCTOPUS',
      'RVN': 'KAWPOW',
      'RAVENCOIN': 'KAWPOW',
      'KAS': 'KHEAVYHASH',
      'KASPA': 'KHEAVYHASH',
      'ERG': 'AUTOLYKOS2',
      'ERGO': 'AUTOLYKOS2',
      'ETC': 'ETCHASH',
      'ETHW': 'ETCHASH',
      'BEAM': 'BEAMV3',
      'FLUX': 'ZELHASH',
      'ALPH': 'BLAKE3',
      'ALEPHIUM': 'BLAKE3',
      'DYNEX': 'DYNEXSOLVE',
      'NEXA': 'NEXAPOW',
      'CLORE': 'KAWPOW',
      'AIPG': 'KAWPOW',
    };
    return algoMap[coinUpper] || coinUpper;
  }, []);

  // Get order unit
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
      if (['H', 'KH', 'MH', 'GH', 'TH', 'PH'].includes(unit)) {
        return unit;
      }
    }
    
    const algo = typeof order.algorithm === 'object' 
      ? order.algorithm.algorithm 
      : order.algorithm;
      
    if (algo?.toUpperCase() === 'RANDOMXMONERO' || algo?.toUpperCase() === 'RANDOMX') {
      return 'KH';
    }
    
    if (algo?.toUpperCase() === 'OCTOPUS') {
      return 'GH';
    }
    
    const mapping = getAlgoMapping(algo);
    return mapping.unit || 'GH';
  }, []);

  // ✅ FIXED: Get order speed from all possible fields
  const getOrderSpeed = useCallback((order) => {
    if (!order) return { speed: 0, unit: 'GH', field: null };
    
    // Try all possible speed fields
    const speedFields = [
      'acceptedCurrentSpeed',
      'currentSpeed',
      'speed',
      'acceptedSpeed',
      'hashrate',
      'currentHashrate',
      'rigsSpeed',
      'totalSpeed',
      'acceptedSpeed'
    ];
    
    let speed = 0;
    let speedField = null;
    
    for (const field of speedFields) {
      if (order[field] !== undefined && order[field] !== null) {
        const val = parseFloat(order[field]);
        if (val >= 0) {
          speed = val;
          speedField = field;
          break;
        }
      }
    }
    
    // ✅ If speed is 0 but rigsCount > 0, order is active but no miners connected
    if (speed === 0 && (order.rigsCount || 0) > 0) {
      console.log(`[ProfitCalc] Order has ${order.rigsCount} rigs but speed is 0 (no miners connected)`);
    }
    
    // ✅ Check if order is actually active
    const isActive = (order.status?.code || order.status) === 'ACTIVE';
    if (!isActive) {
      console.log(`[ProfitCalc] Order is NOT active: ${order.status?.code || order.status}`);
    }
    
    return { 
      speed, 
      unit: getOrderUnit(order), 
      field: speedField,
      isActive,
      rigsCount: order.rigsCount || 0,
    };
  }, [getOrderUnit]);

  // Convert to GH/s
  const convertToGH = useCallback((value, unit) => {
    const units = { 
      'H': 1e-9, 
      'KH': 1e-6, 
      'MH': 1e-3, 
      'GH': 1, 
      'TH': 1e3, 
      'PH': 1e6 
    };
    
    const normalizedUnit = unit?.toUpperCase().replace('/S', '') || 'GH';
    let result = value * (units[normalizedUnit] || 1);
    
    // Auto-detect if result is 0 but value > 0
    if (result === 0 && value > 0) {
      if (value >= 1 && value < 10000) {
        result = value / 1000;
      } else if (value >= 0.001 && value < 1) {
        result = value;
      } else if (value >= 10000) {
        result = value / 1000;
      }
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
          query: { client: nhClient },
          silent: true,
        });

        if (orderResult && !orderResult.error) {
          const order = orderResult.data || orderResult;
          const algo = getCoinAlgorithm(coin);
          const orderAlgo = typeof order.algorithm === 'object' ? order.algorithm.algorithm : order.algorithm;

          if (orderAlgo?.toUpperCase() === algo?.toUpperCase()) {
            orderToUse = order;
          }
        }
      } else {
        const cacheKey = `myOrders:${nhClient}`;
        const cached = orderCache.get(cacheKey);
        let ordersResult;

        if (cached && (Date.now() - cached.ts < ORDER_CACHE_TTL)) {
          ordersResult = cached.data;
        } else {
          ordersResult = await onCall('/api/v2/hashpower/myOrders', {
            query: { op: 'LE', limit: 100, client: nhClient },
            silent: true
          });
          if (ordersResult?.list || ordersResult?.myOrders) {
            orderCache.set(cacheKey, { data: ordersResult, ts: Date.now() });
          }
        }
        const orders = ordersResult?.list || ordersResult?.myOrders || [];
        const algo = getCoinAlgorithm(coin);
        
        orderToUse = orders.find(o => {
          const orderAlgo = typeof o.algorithm === 'object' ? o.algorithm.algorithm : o.algorithm;
          const isActive = (o.status?.code || o.status) === 'ACTIVE';
          return orderAlgo?.toUpperCase() === algo?.toUpperCase() && isActive;
        });
      }

      if (orderToUse) {
        const speedInfo = getOrderSpeed(orderToUse);
        console.log(`[ProfitCalc] Found order: ${orderToUse.id}, speed: ${speedInfo.speed} ${speedInfo.unit}/s (field: ${speedInfo.field}), active: ${speedInfo.isActive}`);
        return { order: orderToUse, speedInfo };
      }
      return null;
    } catch (err) {
      console.warn('Failed to sync NiceHash order:', err.message);
      return null;
    }
  }, [coin, nhClient, onCall, manualNiceHashOrderId, getCoinAlgorithm, getOrderSpeed]);

  // Calculate profit
  const calculateProfit = useCallback((statsData, btcPriceUsd, orderInfo) => {
    if (!statsData) return null;

    const paymentStats = statsData.paymentStats || {};
    const liveStats = statsData.liveStats || {};

    const parseAmount = (str) => {
      if (!str) return 0;
      const cleaned = str.replace(/[^0-9.]/g, '');
      return parseFloat(cleaned) || 0;
    };

    const paid24hCoin = parseAmount(paymentStats.paid24h || '0');
    const hourlyIncomeCoin = paid24hCoin / 24;
    
    const coinPrice = statsData.coinPrice || 0;
    const hourlyIncomeUSD = hourlyIncomeCoin * coinPrice;
    const grossBtcPerDay = paid24hCoin * coinPrice / btcPriceUsd;
    
    // ✅ Use the speed info
    const order = orderInfo?.order || null;
    const speedInfo = orderInfo?.speedInfo || { speed: 0, unit: 'GH', isActive: false };
    
    const orderPrice = parseFloat(order?.price || 0);

    // ✅ Use acceptedCurrentSpeed for cost calculation (the actual hashrate from miners).
    // order.limit is the BTC deposit amount — NOT hashrate — so using it produces wrong units.
    const actualSpeedRaw = speedInfo.speed;                      // in native unit (e.g. TH, GH)
    const actualUnit = speedInfo.unit;                           // e.g. 'TH', 'GH', 'KH'
    const actualSpeedInOrderUnit = convertToGH(actualSpeedRaw, actualUnit); // convert to GH/s
    const isActive = speedInfo.isActive || false;
    
    let costPerDay = 0;
    let costPerHour = 0;
    let costPerDayUSD = 0;
    let costPerHourUSD = 0;
    
    // The price from NH is in BTC per [speed unit] per day.
    // The order stores it per TH by default, so we need to convert:
    //   cost = price (BTC/TH/day) × speed_in_TH
    if (isActive && actualSpeedRaw > 0) {
      const actualSpeedInOrderNative = convertToGH(actualSpeedRaw, actualUnit) / 1000; // convert GH → TH
      costPerDay = orderPrice * actualSpeedInOrderNative;
      costPerHour = costPerDay / 24;
      costPerDayUSD = costPerDay * btcPriceUsd;
      costPerHourUSD = costPerHour * btcPriceUsd;
    }
    
    const totalPaidBTC = parseFloat(order?.payedAmount || 0);
    const totalPaidUSD = totalPaidBTC * btcPriceUsd;
    
    const netProfitPerHour = hourlyIncomeUSD - costPerHourUSD;
    const netProfitPerDay = netProfitPerHour * 24;
    const netProfitBTC = grossBtcPerDay - costPerDay;
    
    const roi = costPerHourUSD > 0 
      ? ((hourlyIncomeUSD - costPerHourUSD) / costPerHourUSD) * 100 
      : (hourlyIncomeUSD > 0 ? 100 : 0);

    return {
      hourlyIncomeCoin,
      hourlyIncomeUSD,
      paid24hCoin,
      paid24hUSD: paid24hCoin * coinPrice,
      grossBtcPerDay,
      
      niceHashPrice: orderPrice,
      orderedHashrate: convertToGH(actualSpeedRaw, actualUnit),
      orderSpeedRaw: actualSpeedRaw,
      orderUnit: actualUnit,
      orderIsActive: isActive,
      costPerHour,
      costPerDay,
      costPerHourUSD,
      costPerDayUSD,
      
      nhTotalPaidBTC: totalPaidBTC,
      nhTotalPaidUSD: totalPaidUSD,

      netProfitPerHour,
      netProfitPerDay,
      netProfitBTC,
      roi,
      
      hashrate: liveStats.currentHashrate || '0 H/s',
      workers: liveStats.workersOnline || 0,
      pendingBalance: paymentStats.pendingBalance || '0',
      totalPaid: paymentStats.totalPaid || '0',
      
      coinPrice,
      btcPrice: btcPriceUsd,
      timestamp: new Date().toISOString(),
      isProfitable: netProfitPerHour > 0,
    };
  }, [convertToGH, getOrderUnit]);

  // Check profit
  const checkProfit = useCallback(async () => {
    const [statsData, orderInfo] = await Promise.all([
      fetchStats(),
      syncNiceHashOrder()
    ]);

    if (!statsData) return null;

    const profit = calculateProfit(statsData, btcPrice, orderInfo);
    if (!profit) return null;

    // Update state
    const order = orderInfo?.order || null;
    const speedInfo = orderInfo?.speedInfo || { speed: 0, unit: 'GH', isActive: false };
    
    if (order) {
      setNiceHashOrderId(order.id);
      setNiceHashPriceBTC(parseFloat(order.price || 0));
      setOrderSpeedRaw(speedInfo.speed);
      setOrderUnit(speedInfo.unit);
      setOrderIsActive(speedInfo.isActive);
      
      // The cost is based on the order's limit, so orderedHashrateGH should reflect that.
      const orderedSpeed = parseFloat(order.limit || 0);
      const orderCostUnit = getOrderUnit(order);
      const orderedSpeedGH = convertToGH(orderedSpeed, orderCostUnit);
      const speedGH = convertToGH(speedInfo.speed, speedInfo.unit);
      setOrderedHashrateGH(orderedSpeedGH);
      setCurrentHashrateGH(speedGH);
      setOrderData(order);
    } else {
      setNiceHashOrderId(null);
      setNiceHashPriceBTC(0);
      setOrderedHashrateGH(0);
      setOrderData(null);
      setOrderIsActive(false);
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

    const btcInterval = setInterval(fetchBtcPrice, BTC_PRICE_UPDATE_INTERVAL);
    const profitInterval = setInterval(checkProfit, PROFIT_CHECK_INTERVAL);

    return () => {
      clearInterval(btcInterval);
      clearInterval(profitInterval);
    };
  }, [pair, checkProfit, fetchBtcPrice]);

  const latestProfit = profitHistory[profitHistory.length - 1] || null;

  return {
    stats,
    orderData,
    loading,
    error,
    btcPrice,
    profit: latestProfit,
    profitHistory,
    isProfitable,
    lastCheck,
    checkProfit,
    currentHashrateGH,
    niceHashOrderId,
    niceHashPriceBTC,
    orderedHashrateGH,
    orderSpeedRaw,
    orderUnit,
    orderIsActive,
    pair,
  };
}
