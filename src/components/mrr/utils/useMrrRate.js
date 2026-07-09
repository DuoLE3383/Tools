// useMrrRate.js
import { useState, useEffect, useMemo } from 'react';
import { 
  getMrrAlgoKey, 
  isAsicBoost,
  normalizeAlgoForNiceHash 
} from "../../../core/mapping.js";
import { 
  convertPaidToBtc, 
  resolvePaidPrice 
} from "../utils/priceUtils.js";
import { 
  getRawHashrateValue 
} from "../utils/hashrateUtils.js";
import { parsePriceValueLocal } from "../../../core/mrrUtils.js";

export const useMrrRate = (algoName, info, rig, onCall, coinPrices) => {
  const [mrrMarketRate, setMrrMarketRate] = useState(0);
  const [isLoadingMrrRate, setIsLoadingMrrRate] = useState(false);
  const [mrrRateError, setMrrRateError] = useState(null);
  const [mrrUsedKey, setMrrUsedKey] = useState("");

  useEffect(() => {
    // Prioritize the most specific algo info from the rig/info objects first.
    const specificRawAlgo = info?.algo || rig.algo || rig.algorithm || rig.type || algoName;
    const normalizedAlgo = normalizeAlgoForNiceHash(specificRawAlgo);

    // Fallback to a calculated rate if we can't determine the algorithm.
    if (!normalizedAlgo || normalizedAlgo === "UNKNOWN") {
      if (info?.price?.paid && info?.hashrate?.advertised) {
        const paid = parseFloat(info.price.paid);
        const advertised = parseFloat(info.hashrate.advertised);
        const duration = parseFloat(info.duration || 0);
        if (paid > 0 && advertised > 0 && duration > 0) {
          const calculatedRate = paid / (duration / 24) / advertised;
          setMrrMarketRate(calculatedRate);
          setMrrUsedKey("calculated");
        }
      }
      return;
    }

    const fetchRate = async () => {
      setIsLoadingMrrRate(true);
      setMrrRateError(null);

      const primaryKey = getMrrAlgoKey(normalizedAlgo);
      if (!primaryKey || primaryKey === 'unknown') {
        setIsLoadingMrrRate(false);
        return;
      }

      let foundRate = 0;
      let usedKey = "";

      const fetchForKey = async (key) => {
        try {
          const data = await onCall(`/api/v2/mrr/info/algos/${key}`, {
            silent: true,
          });

          if (!data) {
            console.warn(`[MrrRigCard] No data returned for key "${key}"`);
            return;
          }

          if (data.error || data.success === false) {
            console.warn(`[MrrRigCard] API error for key "${key}":`, data.message || 'Unknown error');
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
        // Try the primary key first
        await fetchForKey(primaryKey);
      }

      if (foundRate > 0) {
        setMrrMarketRate(foundRate);
        setMrrUsedKey(usedKey);
        setMrrRateError(null);
      } else {
        // Fallback to calculated
        if (info?.price?.paid && info?.hashrate?.advertised) {
          const paid = parseFloat(info.price.paid);
          const advertised = parseFloat(info.hashrate.advertised);
          const duration = parseFloat(info.duration || 0);
          if (paid > 0 && advertised > 0 && duration > 0) {
            const calculatedRate = paid / (duration / 24) / advertised;
            setMrrMarketRate(calculatedRate);
            setMrrUsedKey("calculated");
            setMrrRateError(null);
          } else {
            setMrrRateError("No rate available");
          }
        } else {
          setMrrRateError("No rate available");
        }
      }
      setIsLoadingMrrRate(false);
    };

    fetchRate();
  }, [info?.algo, info?.price?.paid, info?.hashrate?.advertised, info?.duration, 
      rig.algo, rig.algorithm, rig.type, algoName, onCall]);

  const calculatedMrrRate = useMemo(() => {
    const paidPrice = resolvePaidPrice(
      info?.normalized?.price || info?.price || rig.price,
      info?.price_converted || rig.price_converted,
      algoName
    );
    const paidAmount = Number(paidPrice.amount || 0);
    const paidCurrency = paidPrice.currency || info?.currency || rig.currency || "BTC";
    const fallbackBtc = parsePriceValueLocal(
      info?.price_converted?.price ?? rig.price_converted?.price ?? 0,
    );
    const paidBtcAmount = convertPaidToBtc(paidAmount, paidCurrency, coinPrices || {}, fallbackBtc);
    
    const adsVal = info?.rawAds || 
      getRawHashrateValue(rig.hashrate?.advertised || rig.advertised) || 0;
    
    const durationHours = parseFloat(info?.duration ?? info?.hours ?? rig.duration ?? rig.hours ?? rig.length ?? 0);
    const durationDays = durationHours > 0 ? durationHours / 24 : 0;
    
    if (paidBtcAmount > 0 && adsVal > 0 && durationDays > 0) {
      return paidBtcAmount / durationDays / adsVal;
    }
    return 0;
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