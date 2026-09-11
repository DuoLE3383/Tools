// ==========================
//  LIB: PRICE UTILITIES
//  Price calculation and comparison
// ==========================

import { normalizeAlgoForNiceHash, getMrrAlgorithmUnit, calculatePriceComparison } from '../../src/core/mapping.js';
import { getBtcPriceData } from '../../src/core/priceUtils.js';
import { convertHashrateValue } from './hashrate-utils.js';
// Import aggregator only if we want to use it, but we'll conditionally import to avoid dependency
// However, we can import directly because it's exported from rental-monitor.
import { getAllNhActiveOrders } from '../../server/mrr/rental-monitor.js';

/**
 * Calculate price ROI.
 * 
 * @param {object} rental - rental object
 * @param {object} info - extracted rental info
 * @param {string} acct - account name (unused when useAllProviders=true)
 * @param {Map} nhPriceCache - cache for NiceHash prices
 * @param {Map} nhPriceErrorCache - cache for errors
 * @param {Map} nhOrdersCache - cache for orders (not used when useAllProviders)
 * @param {Function} getNhActiveOrders - function to fetch orders for a specific provider (ignored when useAllProviders=true)
 * @param {boolean} useAllProviders - if true, fetch from all providers via aggregator
 * @returns {Promise<number|null>} - ROI value, or null if cannot be calculated
 */
export async function calculatePriceROI(
  rental,
  info,
  acct,
  nhPriceCache,
  nhPriceErrorCache,
  nhOrdersCache,
  getNhActiveOrders,
  useAllProviders = false
) {
  let priceRoi = null;
  
  try {
    const nhAlgo = normalizeAlgoForNiceHash(info.algo);
    if (!nhAlgo || nhAlgo === 'UNKNOWN' || nhAlgo === 'N/A') {
      throw new Error('Unsupported algorithm');
    }

    // Use a cache key without account if we use all providers, else include account
    const cacheKey = useAllProviders ? nhAlgo : `${nhAlgo}:${acct}`;
    const cachedError = nhPriceErrorCache.get(cacheKey);
    const now = Date.now();
    
    // If we recently failed, don't retry immediately
    if (cachedError && now - cachedError.ts < 5 * 60 * 1000) {
      throw new Error(cachedError.message);
    }

    let nhP = nhPriceCache.get(cacheKey);

    // Fetch NiceHash price if not in cache
    if (!nhP) {
      let activeOrders;
      if (useAllProviders) {
        activeOrders = await getAllNhActiveOrders();
      } else {
        // Use the provided function (should fetch per account)
        if (!getNhActiveOrders) throw new Error('getNhActiveOrders not provided');
        activeOrders = await getNhActiveOrders(acct);
      }

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
      
      // Update caches
      nhPriceCache.set(cacheKey, nhP);
      nhPriceErrorCache.delete(cacheKey);
    }

    // Now we have a valid nhP
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
    // Log error but don't throw – ROI remains null
    console.warn(`[price] ROI calculation failed for ${info.algo}: ${err.message}`);
  }

  return priceRoi;
}