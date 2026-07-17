import { useMemo } from "react";
import {
  calculatePriceComparison,
  convertNiceHashToMrr,
  convertPrice,
  cleanUnit,
  HASHRATE_SUFFIXES,
} from "../../core/mapping.js";

export const useRoiCalculation = ({
  finalMrrRate,
  mrrUnit,
  niceHashSourceUnit,
  niceHashSourcePrice,
  normalizedAlgo,
  rawAlgo,
  isLoadingMrrRate,
  skipUnitConversion = false,
}) => {
  // Normalize both prices into niceHashSourceUnit (the larger unit) so values stay readable.
  // HASH RATE conversion (convertUnit): 1 MH = 0.001 GH
  // PRICE RATE conversion (this hook): 0.00056875 BTC/MH/Day = 0.56875 BTC/GH/Day
  // The two are inverses: price-per-hashrate scales UP with the unit ratio.
  const mrrRateInNhUnit = useMemo(() => {
    if (finalMrrRate <= 0) return 0;
    // Convert MRR price rate from mrrUnit (e.g. MH) to niceHashSourceUnit (e.g. GH).
    // This is a PRICE rate (BTC/unit/Day), NOT a hashrate value.
    // BTC/MH → BTC/GH means multiply by (GH / MH) = multiply by 1000.
    const fromMult = HASHRATE_SUFFIXES[cleanUnit(mrrUnit)] || 1;
    const toMult = HASHRATE_SUFFIXES[cleanUnit(niceHashSourceUnit)] || 1;
    return finalMrrRate * (toMult / fromMult);
  }, [finalMrrRate, mrrUnit, niceHashSourceUnit]);

  // NH price already in its native unit, no conversion needed for display
  const niceHashPriceInMrrUnit = useMemo(() => {
    // Keep this for backward compat, but the comparison uses mrrRateInNhUnit now
    if (niceHashSourcePrice <= 0) return 0;
    if (skipUnitConversion && niceHashSourceUnit && mrrUnit) {
      return convertPrice(niceHashSourcePrice, niceHashSourceUnit, mrrUnit);
    }
    return convertNiceHashToMrr(niceHashSourcePrice, normalizedAlgo || rawAlgo);
  }, [niceHashSourcePrice, normalizedAlgo, rawAlgo, skipUnitConversion, niceHashSourceUnit, mrrUnit]);

  // PNL = (mrrRate - nhPrice) / nhPrice, both in NH's unit
  const roiPercent = useMemo(() => {
    if (finalMrrRate <= 0 || niceHashSourcePrice <= 0) return null;
    const mrrInNhUnit = mrrRateInNhUnit;
    const nhPrice = niceHashSourcePrice;
    if (mrrInNhUnit <= 0 || nhPrice <= 0) return null;
    return ((mrrInNhUnit - nhPrice) / nhPrice) * 100;
  }, [finalMrrRate, niceHashSourcePrice, mrrRateInNhUnit]);

  const formatPercent = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return "N/A";
    return `${num > 0 ? "+" : ""}${num.toFixed(2)}%`;
  };

  const roiLabel = useMemo(() => {
    if (roiPercent !== null) return formatPercent(roiPercent);
    if (niceHashSourcePrice > 0) {
      if (finalMrrRate >= 0)
        return isLoadingMrrRate ? "Loading..." : "No MRR rate";
      return "Waiting for data";
    }
    return "No NH price";
  }, [roiPercent, niceHashSourcePrice, finalMrrRate, isLoadingMrrRate]);

  return {
    niceHashPriceInMrrUnit,
    roiPercent,
    roiLabel,
  };
};
