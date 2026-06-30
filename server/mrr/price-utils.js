// ==========================
//  LIB: PRICE UTILITIES
//  Price calculation and comparison
// ==========================

import { normalizeAlgoForNiceHash, getMrrAlgorithmUnit, calculatePriceComparison } from '../../src/core/mapping.js';
import { getBtcPriceData } from '../../src/core/priceUtils.js';
import { convertHashrateValue } from './hashrate-utils.js';

/**
 * Calculate price ROI
 */
export function calculatePriceROI(rental, info, acct, nhPriceCache, nhPriceErrorCache, nhOrdersCache, getNhActiveOrders) {
  let priceRoi = null;
  
  try {
    const nhAlgo = normalizeAlgoForNiceHash(info.algo);
    if (!nhAlgo || nhAlgo === 'UNKNOWN' || nhAlgo === 'N/A') {
      throw new Error('Unsupported algorithm');
    }

    const cacheKey = `${nhAlgo}:${acct}`;
    const cachedError = nhPriceErrorCache.get(cacheKey);
    const now = Date.now();
    
    if (cachedError && now - cachedError.ts < 10 * 60 * 1000) {
      throw new Error(cachedError.message);
    }

    let nhP = nhPriceCache.get(cacheKey);

    if (!nhP) {
      const activeOrders = await getNhActiveOrders(acct);
      const matchedOrder = activeOrders.find(order => 
        normalizeAlgoForNiceHash(order?.algorithm || order?.algo || order?.type) === nhAlgo
      );
      
      if (!matchedOrder) {
        throw new Error(`No active NiceHash order found for ${nhAlgo}`);
      }

      nhP = {
        price: parseFloat(matchedOrder?.price ?? matchedOrder?.marketPrice ?? matchedOrder?.fixedPrice ?? 0) || 0,
        unit: getMrrAlgorithmUnit(nhAlgo)
      };
      
      if (nhP.price <= 0) throw new Error('NiceHash price unavailable');
      nhPriceCache.set(cacheKey, nhP);
      nhPriceErrorCache.delete(cacheKey);
    }

    const mrrBtcData = getBtcPriceData(rental.price || info.price);
    const mrrUnit = getMrrAlgorithmUnit(info.algo);
    const advertised = parseFloat(info.hashrate.advertised);
    const advertisedInMrrUnit = convertHashrateValue(advertised, info.hashrate.suffix || mrrUnit, mrrUnit);
    const durationHours = Number.parseFloat(info.duration) || 0;
    
    const mrrPriceNorm = Number.isFinite(advertisedInMrrUnit) && 
                         advertisedInMrrUnit > 0 && 
                         Number.isFinite(durationHours) && 
                         durationHours > 0
      ? mrrBtcData.value / (durationHours / 24) / advertisedInMrrUnit
      : mrrBtcData.value;

    if (mrrPriceNorm > 0 && nhP.price > 0) {
      priceRoi = calculatePriceComparison(mrrPriceNorm, mrrUnit, nhP.price, nhP.unit);
    }
  } catch (err) {
    // Log error but don't throw
    console.warn(`[price] ROI calculation failed for ${info.algo}: ${err.message}`);
  }

  return priceRoi;
}