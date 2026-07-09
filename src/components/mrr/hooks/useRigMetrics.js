import { useMemo, useCallback } from 'react';
import { getRawHashrateValue } from '../utils/hashrateUtils.js';
import { 
  convertPaidToBtc, 
  getUsdtAmountDirect, 
  resolvePaidPrice,
  getUsdPrice 
} from '../utils/priceUtils.js';
import { formatHashrateWithUnit } from '../utils/hashrateUtils.js';
import { parsePriceValueLocal } from "../../../core/mrrUtils.js";

const extractPrice = (obj) => {
  if (!obj || typeof obj !== 'object') return null;
  
  if (obj.price !== undefined || obj.paid !== undefined) {
    const val = parseFloat(obj.price ?? obj.paid ?? 0);
    if (val > 0) return { amount: val, currency: obj.currency || 'BTC' };
  }
  
  if (obj.BTC && typeof obj.BTC === 'object') {
    const btcVal = parseFloat(obj.BTC.price ?? obj.BTC.paid ?? obj.BTC.amount ?? 0);
    if (btcVal > 0) return { amount: btcVal, currency: 'BTC' };
  }
  
  if (obj.amount !== undefined) {
    const val = parseFloat(obj.amount);
    if (val > 0) return { amount: val, currency: obj.currency || 'BTC' };
  }
  
  if (obj.btc !== undefined) {
    const val = parseFloat(obj.btc);
    if (val > 0) return { amount: val, currency: 'BTC' };
  }
  
  if (obj.btc_amount !== undefined) {
    const val = parseFloat(obj.btc_amount);
    if (val > 0) return { amount: val, currency: 'BTC' };
  }
  
  if (obj.total !== undefined) {
    const val = parseFloat(obj.total);
    if (val > 0) return { amount: val, currency: obj.currency || 'BTC' };
  }
  
  if (obj.cost !== undefined) {
    const val = parseFloat(obj.cost);
    if (val > 0) return { amount: val, currency: obj.currency || 'BTC' };
  }
  
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      const result = extractPrice(obj[key]);
      if (result) return result;
    }
  }
  
  return null;
};

export const useRigMetrics = (rig, info, algo, coinPrices) => {
  const adsVal = useMemo(() => {
    const val = info?.rawAds || getRawHashrateValue(rig.hashrate?.advertised || rig.advertised) || 0;
    return typeof val === 'number' ? val : parseFloat(val) || 0;
  }, [info?.rawAds, rig.hashrate?.advertised, rig.advertised]);

  const avgVal = useMemo(() => {
    const val = info?.rawAvg || getRawHashrateValue(rig.hashrate?.average || rig.average || rig.hash) || 0;
    return typeof val === 'number' ? val : parseFloat(val) || 0;
  }, [info?.rawAvg, rig.hashrate?.average, rig.average, rig.hash]);

  const currentVal = useMemo(() => {
    const rawCur = info?.rawCur || rig.hashrate?.current || 0;
    const val = Number.isFinite(parseFloat(rawCur)) ? parseFloat(rawCur) : 0;
    return val;
  }, [info?.rawCur, rig.hashrate?.current]);

  const paidPrice = useMemo(() => {
    let extracted = null;
    
    const sources = [
      info,
      info?.price,
      info?.normalized,
      info?.normalized?.price,
      rig,
      rig?.price,
      info?._rawRental,
    ];
    
    for (const source of sources) {
      if (source) {
        const result = extractPrice(source);
        if (result && result.amount > 0) {
          extracted = result;
          break;
        }
      }
    }
    
    if (!extracted) {
      const paidPriceResult = resolvePaidPrice(
        info?.normalized?.price || info?.price || rig.price,
        info?.price_converted || rig.price_converted,
        algo?.normalized
      );
      const amount = Number(paidPriceResult.amount || 0);
      const currency = paidPriceResult.currency || info?.currency || rig.currency || 'BTC';
      if (amount > 0) extracted = { amount, currency };
    }
    
    if (!extracted && info?.pools?.length > 0) {
      for (const pool of info.pools) {
        if (pool.price) {
          const val = parseFloat(pool.price);
          if (val > 0) {
            extracted = { amount: val, currency: pool.currency || 'BTC' };
            break;
          }
        }
      }
    }
    
    return extracted || { amount: 0, currency: 'BTC' };
  }, [info, rig, algo]);

  const paidAmount = Number(paidPrice.amount || 0);
  const paidCurrency = paidPrice.currency || 'BTC';
  
  const paidLabel = paidAmount > 0 
    ? `${paidAmount.toFixed(8)} ${String(paidCurrency).toUpperCase()}`
    : null;

  const fallbackBtc = parsePriceValueLocal(
    info?.price_converted?.price ?? rig.price_converted?.price ?? 0,
  );
  
  const paidBtcAmount = convertPaidToBtc(
    paidAmount,
    paidCurrency,
    coinPrices || {},
    fallbackBtc,
  );

  const paidUsdtAmount = useMemo(
    () => getUsdtAmountDirect(paidAmount, paidCurrency, coinPrices || {}),
    [paidAmount, paidCurrency, coinPrices],
  );

  const usdValue = useMemo(() => {
    if (!paidAmount || paidAmount <= 0) return 0;
    const price = getUsdPrice(paidCurrency, coinPrices || {});
    return paidAmount * price;
  }, [paidAmount, paidCurrency, coinPrices]);

  const hashUnit = info?.hashrate?.suffix ||
    rig.hashrate?.advertised?.type ||
    info?.hashrate_unit ||
    info?.unit ||
    algo?.mrrUnit ||
    "H";

  const formatHash = useCallback((value, unit) => {
    const numValue = typeof value === 'number' ? value : parseFloat(value) || 0;
    if (numValue > 0) {
      return formatHashrateWithUnit(numValue, unit || hashUnit);
    }
    return "0 N/A";
  }, [hashUnit]);

  return {
    adsVal,
    avgVal,
    currentVal,
    paidAmount,
    paidCurrency,
    paidLabel,
    paidBtcAmount,
    paidUsdtAmount,
    usdValue,
    hashUnit,
    formatHash
  };
};