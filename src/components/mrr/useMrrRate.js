import { useState, useEffect, useMemo } from "react";
import { getMrrAlgoKey } from "./helpers";
import { normalizeAlgoForNiceHash } from "../../core/mapping.js";

export const useMrrRate = ({
  info,
  rig,
  algoName,
  mrrApiKey,
  mrrUnit,
  paidBtcAmount,
  adsInMrrUnit,
  durationDays,
  isRented,
  displayId,
}) => {
  const [mrrMarketRate, setMrrMarketRate] = useState(0);
  const [isLoadingMrrRate, setIsLoadingMrrRate] = useState(false);
  const [mrrRateError, setMrrRateError] = useState(null);
  const [mrrUsedKey, setMrrUsedKey] = useState("");

  // Calculate rate directly from rental data FIRST
  const calculatedMrrRate = useMemo(() => {
    if (isRented && paidBtcAmount > 0 && adsInMrrUnit > 0 && durationDays > 0) {
      return paidBtcAmount / durationDays / adsInMrrUnit;
    }
    return 0;
  }, [isRented, paidBtcAmount, adsInMrrUnit, durationDays]);

  const infoMrrRate = useMemo(
    () => {
      const tryParse = (val) => {
        if (val !== null && val !== undefined) {
          const parsed = parseFloat(val);
          if (Number.isFinite(parsed) && parsed > 0) return parsed;
        }
        return 0;
      };

      // 1. Direct fields in enriched info
      let v = tryParse(info?.mrrRate);
      if (v) return v;
      v = tryParse(info?.price?.rate);
      if (v) return v;
      v = tryParse(info?.price?.advertised);
      if (v) return v;
      v = tryParse(info?.price?.price);
      if (v) return v;

      // 2. price_converted (MRR API returns this in rental detail response)
      v = tryParse(info?.price_converted?.advertised);
      if (v) return v;
      v = tryParse(info?.price_converted?.price);
      if (v) return v;

      // 3. normalized.price (from extractRentalInfo)
      v = tryParse(info?.normalized?.price?.advertised);
      if (v) return v;

      // 4. info.rigListedPrice — the rental.rig.price extracted in MrrRigs.jsx
      //    with BTC sub-key structure: { type: "gh", BTC: { currency: "BTC", price: "0.00056900", ... } }
      if (info?.rigListedPrice && typeof info.rigListedPrice === 'object') {
        for (const currKey of ['BTC', 'USD', 'LTC', 'BCH', 'DOGE', 'ETH']) {
          const entry = info.rigListedPrice[currKey];
          if (entry && typeof entry === 'object') {
            for (const field of ['price', 'advertised', 'paid']) {
              v = tryParse(entry[field]);
              if (v) return v;
            }
          }
        }
        v = tryParse(info.rigListedPrice.advertised);
        if (v) return v;
        v = tryParse(info.rigListedPrice.price);
        if (v) return v;
        v = tryParse(info.rigListedPrice.paid);
        if (v) return v;
      }

      // 5. The original rig object's nested price structure:
      //    rig.price = { type: "th", BTC: { currency: "BTC", price: "0.00056900", ... } }
      if (rig?.price && typeof rig.price === 'object' && !Array.isArray(rig.price)) {
        for (const currKey of ['BTC', 'USD', 'LTC', 'BCH', 'DOGE', 'ETH']) {
          const entry = rig.price[currKey];
          if (entry && typeof entry === 'object') {
            for (const field of ['price', 'advertised', 'paid']) {
              v = tryParse(entry[field]);
              if (v) return v;
            }
          }
        }
        v = tryParse(rig.price.advertised);
        if (v) return v;
        v = tryParse(rig.price.price);
        if (v) return v;
        v = tryParse(rig.price.paid);
        if (v) return v;
      }

      // 6. Flat price string from rig listing
      if (typeof rig?.price === 'string') {
        v = tryParse(rig.price);
        if (v) return v;
      }

      // 7. Min price from rig listing
      v = tryParse(rig?.min_price);
      if (v) return v;
      return 0;
    }, [info, rig],
  );

  // If we have a valid calculated rate, use it immediately without API call
  const shouldFetchMarketRate = useMemo(() => {
    // Only fetch MRR API if we don't have a reliable calculated rate
    if (calculatedMrrRate > 0) return false;
    if (infoMrrRate > 0) return false;
    return true;
  }, [calculatedMrrRate, infoMrrRate]);

  useEffect(() => {
    // Skip API call entirely when we already have a reliable rate from rental data
    if (!shouldFetchMarketRate) {
      setIsLoadingMrrRate(false);
      return;
    }

    const rawAlgo =
      info?.algo || rig.algo || rig.algorithm || rig.type || algoName;
    const normalizedAlgo = normalizeAlgoForNiceHash(rawAlgo || algoName);

    if (!normalizedAlgo || normalizedAlgo === "UNKNOWN") {
      setMrrRateError("No algorithm specified");
      setIsLoadingMrrRate(false);
      return;
    }

    // Do not fetch if there is no API key for the algo.
    if (!mrrApiKey) {
      setIsLoadingMrrRate(false);
      return;
    }

    const fetchRate = async () => {
      setIsLoadingMrrRate(true);
      setMrrRateError(null);

      const primaryKey = getMrrAlgoKey(normalizedAlgo);
      if (!primaryKey) {
        setMrrRateError("No MRR key for this algorithm");
        setIsLoadingMrrRate(false);
        return;
      }

      const keysToTry = [primaryKey];
      if (normalizedAlgo === "SHA256ASICBOOST" || normalizedAlgo === "SHA256AB") {
        if (primaryKey !== "sha256") keysToTry.push("sha256");
      }

      let rate = 0;
      let usedKey = "";

      for (const key of keysToTry) {
        try {
          const url = `/api/v2/mrr/market/algos/${key}`;
          const response = await fetch(url);
          if (!response.ok) {
            console.warn(`MRR API returned ${response.status} for ${key}`);
            continue;
          }
          const data = await response.json();

          let foundRate = 0;
          if (data.success && data.data) {
            if (data.data.suggested_price?.amount)
              foundRate = parseFloat(data.data.suggested_price.amount);
            else if (data.data.stats?.prices?.lowest?.price)
              foundRate = parseFloat(data.data.stats.prices.lowest.price);
            else if (data.data.price) foundRate = parseFloat(data.data.price);
            else if (data.data.BTC) foundRate = parseFloat(data.data.BTC);
          } else if (data.price) foundRate = parseFloat(data.price);
          else if (data.BTC) foundRate = parseFloat(data.BTC);

          if (foundRate > 0) {
            rate = foundRate;
            usedKey = key;
            break;
          }
        } catch (err) {
          console.warn(`⚠️ Failed to fetch MRR rate for ${key}:`, err.message);
        }
      }

      if (rate > 0) {
        setMrrMarketRate(rate);
        setMrrUsedKey(usedKey);
        setMrrRateError(null);
      } else {
        setMrrRateError("No MRR market rate available");
      }
      setIsLoadingMrrRate(false);
    };

    fetchRate();
  }, [
    calculatedMrrRate,
    infoMrrRate,
    info?.algo,
    info?.price?.paid,
    info?.hashrate?.advertised,
    info?.duration,
    rig.algo,
    rig.algorithm,
    rig.type,
    algoName,
    info?.rawAds,
    rig.hashrate?.advertised,
    mrrApiKey,
  ]);

  // Final rate - PRIORITIZE rig's listed MRR price from rental info
  const finalMrrRate = useMemo(() => {
    // 1. Rate directly from info (e.g. info.price.advertised = BTC/PHash/Day from MRR listing)
    if (infoMrrRate > 0) return infoMrrRate;
    // 2. Calculated from actual rental data as fallback
    if (calculatedMrrRate > 0) return calculatedMrrRate;
    // 3. MRR market API rate as last resort
    if (mrrMarketRate > 0) return mrrMarketRate;
    return 0;
  }, [infoMrrRate, calculatedMrrRate, mrrMarketRate]);

  const mrrDailyRateSource = useMemo(() => {
    if (infoMrrRate > 0) {
      if (displayId) return `Rental: #${displayId}`;
      return "From rental info";
    }
    if (calculatedMrrRate > 0) {
      if (displayId) return `Rental: #${displayId} (calc)`;
      return `Calculated from rental`;
    }
    if (mrrMarketRate > 0) return `MRR API (${mrrUsedKey || mrrApiKey})`;
    if (isLoadingMrrRate) return "Loading MRR API...";
    return "No MRR rate available";
  }, [infoMrrRate, calculatedMrrRate, mrrMarketRate, mrrUsedKey, mrrApiKey, isLoadingMrrRate, displayId]);

  return {
    mrrMarketRate,
    isLoadingMrrRate,
    mrrRateError,
    mrrUsedKey,
    finalMrrRate,
    mrrDailyRateSource,
    calculatedMrrRate,
    // Helper to know which source is being used
    rateSource: calculatedMrrRate > 0 ? 'rental' : infoMrrRate > 0 ? 'info' : mrrMarketRate > 0 ? 'mrr-api' : 'none',
  };
};
