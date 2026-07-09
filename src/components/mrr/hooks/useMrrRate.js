import { useState, useEffect, useMemo } from 'react';
import { normalizeAlgoForNiceHash } from "../../../core/mapping.js";
import { getMrrAlgoKey, isAsicBoost } from "../../../core/mapping.js";
import { 
  convertPaidToBtc, 
  resolvePaidPrice 
} from "../utils/priceUtils.js";
import { 
  getRawHashrateValue 
} from "../utils/hashrateUtils.js";
import { parsePriceValueLocal } from "../../../core/mrrUtils.js";

// Algorithms that don't have dedicated MRR API endpoints
const SKIP_API_ALGOS = [
  // 'sha256', 'sha256asicboost', 'sha256ab',
  // 'etchash', 'etchashasicboost',
  // 'kawpow',
  // 'equihash',
  // 'randomx', 'randomxmonero',
  // 'neoscrypt',
  // 'lyra2rev3', 'lyra2z',
  // 'x16s', 'x16r', 'x16rv2',
  // 'blake2s',
  // 'cuckaroo29', 'cuckatoo31',
  // 'yespower',
  // 'argon2d',
  // 'handshake',
  // 'beamhash'
];

export const useMrrRate = (algoName, info, rig, onCall, coinPrices) => {
  const [mrrMarketRate, setMrrMarketRate] = useState(0);
  const [isLoadingMrrRate, setIsLoadingMrrRate] = useState(false);
  const [mrrRateError, setMrrRateError] = useState(null);
  const [mrrUsedKey, setMrrUsedKey] = useState("");

  // Helper to extract price from any object structure
  const extractPrice = (obj) => {
    if (!obj || typeof obj !== 'object') return null;
    
    // Check if this object has price/paid properties directly
    if (obj.price !== undefined || obj.paid !== undefined) {
      const val = parseFloat(obj.price ?? obj.paid ?? 0);
      if (val > 0) {
        return { amount: val, currency: obj.currency || 'BTC' };
      }
    }
    
    // Check for BTC nested object
    if (obj.BTC && typeof obj.BTC === 'object') {
      const btcVal = parseFloat(obj.BTC.price ?? obj.BTC.paid ?? obj.BTC.amount ?? 0);
      if (btcVal > 0) {
        return { amount: btcVal, currency: 'BTC' };
      }
    }
    
    // Check for amount field
    if (obj.amount !== undefined) {
      const val = parseFloat(obj.amount);
      if (val > 0) {
        return { amount: val, currency: obj.currency || 'BTC' };
      }
    }
    
    // Check for btc field
    if (obj.btc !== undefined) {
      const val = parseFloat(obj.btc);
      if (val > 0) {
        return { amount: val, currency: 'BTC' };
      }
    }
    
    // Check for btc_amount field
    if (obj.btc_amount !== undefined) {
      const val = parseFloat(obj.btc_amount);
      if (val > 0) {
        return { amount: val, currency: 'BTC' };
      }
    }
    
    // Check for total field
    if (obj.total !== undefined) {
      const val = parseFloat(obj.total);
      if (val > 0) {
        return { amount: val, currency: obj.currency || 'BTC' };
      }
    }
    
    // Recursively check all object properties for price-like values
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        const result = extractPrice(obj[key]);
        if (result) return result;
      }
    }
    
    return null;
  };

  // Helper to calculate rate from rental data
  const calculateRateFromRental = (info, rig) => {
    try {
      // Try to extract price from info, rig, or their nested objects
      let priceData = null;
      let priceAmount = 0;
      let priceCurrency = 'BTC';
      
      // Check info object
      if (info) {
        const extracted = extractPrice(info);
        if (extracted) {
          priceData = extracted;
          priceAmount = extracted.amount;
          priceCurrency = extracted.currency;
        }
      }
      
      // Check rig object if not found in info
      if (!priceData && rig) {
        const extracted = extractPrice(rig);
        if (extracted) {
          priceData = extracted;
          priceAmount = extracted.amount;
          priceCurrency = extracted.currency;
        }
      }
      
      // Check info.price specifically
      if (!priceData && info?.price) {
        if (typeof info.price === 'object') {
          // Check for BTC nested
          if (info.price.BTC?.price || info.price.BTC?.paid) {
            priceAmount = parseFloat(info.price.BTC.price || info.price.BTC.paid || 0);
            priceCurrency = 'BTC';
            priceData = { amount: priceAmount, currency: priceCurrency };
          } else {
            priceAmount = parseFloat(info.price.paid || info.price.price || 0);
            priceCurrency = info.price.currency || 'BTC';
            priceData = { amount: priceAmount, currency: priceCurrency };
          }
        } else {
          priceAmount = parseFloat(info.price);
          priceCurrency = info.currency || 'BTC';
          priceData = { amount: priceAmount, currency: priceCurrency };
        }
      }
      
      // Check normalized.price if available
      if (!priceData && info?.normalized?.price) {
        const extracted = extractPrice(info.normalized.price);
        if (extracted) {
          priceData = extracted;
          priceAmount = extracted.amount;
          priceCurrency = extracted.currency;
        }
      }
      
      // If still no price, use resolvePaidPrice as fallback
      if (!priceData || priceAmount === 0) {
        const paidPrice = resolvePaidPrice(
          info?.normalized?.price || info?.price || rig.price,
          info?.price_converted || rig.price_converted,
          algoName
        );
        priceAmount = Number(paidPrice.amount || 0);
        priceCurrency = paidPrice.currency || info?.currency || rig.currency || 'BTC';
      }
      
      // If price is still 0, check for hardcoded price in the rental data
      if (priceAmount === 0 && info?._rawRental) {
        const rawExtracted = extractPrice(info._rawRental);
        if (rawExtracted) {
          priceAmount = rawExtracted.amount;
          priceCurrency = rawExtracted.currency;
        }
      }
      
      const fallbackBtc = parsePriceValueLocal(
        info?.price_converted?.price ?? rig.price_converted?.price ?? 0,
      );
      
      const paidBtcAmount = convertPaidToBtc(priceAmount, priceCurrency, coinPrices || {}, fallbackBtc);
      
      const adsVal = info?.rawAds || 
        getRawHashrateValue(rig.hashrate?.advertised || rig.advertised) || 0;
      
      const durationHours = parseFloat(info?.duration ?? info?.hours ?? rig.duration ?? rig.hours ?? rig.length ?? 0);
      const durationDays = durationHours > 0 ? durationHours / 24 : 0;
      
      if (paidBtcAmount > 0 && adsVal > 0 && durationDays > 0) {
        return paidBtcAmount / durationDays / adsVal;
      }
      return 0;
    } catch (error) {
      console.warn('[MrrRigCard] Error calculating rate from rental:', error);
      return 0;
    }
  };

  useEffect(() => {
    // Prioritize the most specific algo info from the rig/info objects first.
    const specificRawAlgo = info?.algo || rig.algo || rig.algorithm || rig.type || algoName;
    const normalizedAlgo = normalizeAlgoForNiceHash(specificRawAlgo);

    // For SHA256, always try to calculate from rental data first
    const isSha256 = normalizedAlgo && (
      normalizedAlgo.toUpperCase().includes('SHA256') ||
      specificRawAlgo?.toUpperCase().includes('SHA256')
    );

    if (isSha256) {
      const calculatedRate = calculateRateFromRental(info, rig);
      if (calculatedRate > 0) {
        setMrrMarketRate(calculatedRate);
        setMrrUsedKey("calculated");
        setMrrRateError(null);
        setIsLoadingMrrRate(false);
        return;
      }
    }

    // Fallback to a calculated rate if we can't determine the algorithm.
    if (!normalizedAlgo || normalizedAlgo === "UNKNOWN") {
      const calculatedRate = calculateRateFromRental(info, rig);
      if (calculatedRate > 0) {
        setMrrMarketRate(calculatedRate);
        setMrrUsedKey("calculated");
      }
      return;
    }

    const fetchRate = async () => {
      setIsLoadingMrrRate(true);
      setMrrRateError(null);

      const primaryKey = getMrrAlgoKey(normalizedAlgo);
      
      // Skip API call for algorithms that don't have dedicated endpoints
      const algoKeyLower = (primaryKey || '').toLowerCase();
      const normalizedLower = normalizedAlgo.toLowerCase();
      const shouldSkipApi = SKIP_API_ALGOS.includes(algoKeyLower) || 
                           SKIP_API_ALGOS.includes(normalizedLower) ||
                           isSha256;
      
      if (!primaryKey || primaryKey === 'unknown' || shouldSkipApi) {
        const calculatedRate = calculateRateFromRental(info, rig);
        if (calculatedRate > 0) {
          setMrrMarketRate(calculatedRate);
          setMrrUsedKey("calculated");
          setMrrRateError(null);
        } else {
          setMrrRateError(`No rate available for ${normalizedAlgo}`);
        }
        setIsLoadingMrrRate(false);
        return;
      }

      let foundRate = 0;
      let usedKey = "";
      let apiAttempted = false;

      const fetchForKey = async (key) => {
        apiAttempted = true;
        try {
          const data = await onCall(`/api/v2/mrr/info/algos/${key}`, {
            silent: true,
          });

          if (!data) {
            console.warn(`[MrrRigCard] No data returned for key "${key}"`);
            return;
          }

          if (data.error || data.success === false || data.status === 404) {
            console.warn(`[MrrRigCard] API error for key "${key}":`, data.message || 'Not found');
            return;
          }

          let rate = 0;
          if (data.data?.suggested_price?.amount)
            rate = parseFloat(data.data.suggested_price.amount);
          else if (data.data?.stats?.prices?.lowest?.amount)
            rate = parseFloat(data.data.stats.prices.lowest.amount);
          else if (data.data?.stats?.prices?.average?.amount)
            rate = parseFloat(data.data.stats.prices.average.amount);
          else if (data.data?.stats?.prices?.last?.amount)
            rate = parseFloat(data.data.stats.prices.last.amount);
          else if (data.data?.stats?.prices?.last_10?.amount)
            rate = parseFloat(data.data.stats.prices.last_10.amount);
          else if (data.data?.price) rate = parseFloat(data.data.price);
          else if (data.data?.BTC) rate = parseFloat(data.data.BTC);
          else if (data.price) rate = parseFloat(data.price);
          else if (data.BTC) rate = parseFloat(data.BTC);
          
          if (rate > 0) {
            foundRate = rate;
            usedKey = key;
            console.log(`[MrrRigCard] Found rate ${rate} for key "${key}"`);
          } else {
            console.warn(`[MrrRigCard] No valid rate found for key "${key}"`);
          }
        } catch (err) {
          console.warn(`[MrrRigCard] Could not fetch MRR rate for key "${key}". Error: ${err.message}`);
        }
      };

      const isShaFamily = String(normalizedAlgo).toUpperCase() === "SHA256ASICBOOST";
 
      if (isShaFamily) {
        const primaryShaKey = isAsicBoost(normalizedAlgo) ? 'sha256ab' : 'sha256ab';
        await fetchForKey(primaryShaKey);
      } else {
        await fetchForKey(primaryKey);
      }

      if (foundRate > 0) {
        setMrrMarketRate(foundRate);
        setMrrUsedKey(usedKey);
        setMrrRateError(null);
      } else {
        const calculatedRate = calculateRateFromRental(info, rig);
        if (calculatedRate > 0) {
          setMrrMarketRate(calculatedRate);
          setMrrUsedKey("calculated");
          setMrrRateError(null);
        } else {
          setMrrRateError(apiAttempted ? `No rate available for ${normalizedAlgo}` : "No rate available");
        }
      }
      setIsLoadingMrrRate(false);
    };

    fetchRate();
  }, [info?.algo, info?.price?.paid, info?.hashrate?.advertised, info?.duration, 
      rig.algo, rig.algorithm, rig.type, algoName, onCall, coinPrices]);

  const calculatedMrrRate = useMemo(() => {
    return calculateRateFromRental(info, rig);
  }, [info, rig, algoName, coinPrices]);

  const infoMrrRate = useMemo(() => info?.mrrRate || info?.price?.rate || 0, [info]);

  const finalMrrRate = useMemo(() => {
    if (mrrMarketRate > 0) return mrrMarketRate;
    if (calculatedMrrRate > 0) return calculatedMrrRate;
    if (infoMrrRate > 0) return infoMrrRate;
    return 0;
  }, [mrrMarketRate, calculatedMrrRate, infoMrrRate]);

  const source = mrrMarketRate > 0
    ? `MRR API (${mrrUsedKey})`
    : calculatedMrrRate > 0
      ? "Calculated from rental"
      : infoMrrRate > 0
        ? "From rental info"
        : isLoadingMrrRate
          ? "Loading MRR API..."
          : "No MRR rate available";

  return {
    mrrMarketRate,
    isLoadingMrrRate,
    mrrRateError,
    mrrUsedKey,
    calculatedMrrRate,
    infoMrrRate,
    finalMrrRate,
    source
  };
};