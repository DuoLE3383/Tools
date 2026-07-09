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
}) => {
  const [mrrMarketRate, setMrrMarketRate] = useState(0);
  const [isLoadingMrrRate, setIsLoadingMrrRate] = useState(false);
  const [mrrRateError, setMrrRateError] = useState(null);
  const [mrrUsedKey, setMrrUsedKey] = useState("");

  useEffect(() => {
    const rawAlgo =
      info?.algo || rig.algo || rig.algorithm || rig.type || algoName;
    const normalizedAlgo = normalizeAlgoForNiceHash(rawAlgo || algoName);

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
  }, [
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
  ]);

  const calculatedMrrRate = useMemo(() => {
    if (paidBtcAmount > 0 && adsInMrrUnit > 0 && durationDays > 0) {
      return paidBtcAmount / durationDays / adsInMrrUnit;
    }
    return 0;
  }, [paidBtcAmount, adsInMrrUnit, durationDays]);

  const infoMrrRate = useMemo(
    () => info?.mrrRate || info?.price?.rate || 0,
    [info]
  );

  const finalMrrRate = useMemo(() => {
    if (mrrMarketRate > 0) return mrrMarketRate;
    if (calculatedMrrRate > 0) return calculatedMrrRate;
    if (infoMrrRate > 0) return infoMrrRate;
    return 0;
  }, [mrrMarketRate, calculatedMrrRate, infoMrrRate]);

  const mrrDailyRateSource =
    mrrMarketRate > 0
      ? `MRR API (${mrrUsedKey || mrrApiKey})`
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
    finalMrrRate,
    mrrDailyRateSource,
    calculatedMrrRate,
  };
};