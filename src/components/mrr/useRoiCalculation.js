// useRoiCalculation.js - FINAL VERSION (supports pre-converted price)

import { useMemo } from "react";
import {
  calculatePriceComparison,
  convertNiceHashToMrr,
} from "../../core/mapping.js";

export const useRoiCalculation = ({
  finalMrrRate,
  mrrUnit,
  niceHashSourceUnit, // Optional, used only if conversion needed
  niceHashSourcePrice, // Raw NH price (not converted)
  niceHashPriceInMrrUnit, // Pre-converted NH price (optional)
  normalizedAlgo,
  rawAlgo,
  isLoadingMrrRate,
  skipUnitConversion = false,
}) => {
  // If a pre-converted price is provided, use it directly.
  const effectiveNiceHashPrice = useMemo(() => {
    if (niceHashPriceInMrrUnit !== undefined && niceHashPriceInMrrUnit > 0) {
      return niceHashPriceInMrrUnit;
    }
    if (niceHashSourcePrice <= 0) return 0;
    if (skipUnitConversion) return niceHashSourcePrice;
    // Otherwise, convert using the mapping (fallback)
    return convertNiceHashToMrr(niceHashSourcePrice, normalizedAlgo || rawAlgo);
  }, [niceHashPriceInMrrUnit, niceHashSourcePrice, skipUnitConversion, normalizedAlgo, rawAlgo]);

  const roiPercent = useMemo(() => {
    if (finalMrrRate <= 0 || effectiveNiceHashPrice <= 0) return null;
    // Both values are now in the same unit (mrrUnit)
    return calculatePriceComparison(
      finalMrrRate,
      mrrUnit,
      effectiveNiceHashPrice,
      mrrUnit, // same unit, so conversion is 1:1
    );
  }, [finalMrrRate, mrrUnit, effectiveNiceHashPrice]);

  const formatPercent = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return "N/A";
    return `${num > 0 ? "+" : ""}${num.toFixed(2)}%`;
  };

  const roiLabel = useMemo(() => {
    if (roiPercent !== null) return formatPercent(roiPercent);
    if (niceHashSourcePrice > 0 || niceHashPriceInMrrUnit > 0) {
      if (finalMrrRate >= 0)
        return isLoadingMrrRate ? "Loading..." : "No MRR rate";
      return "Waiting for data";
    }
    return "No NH price";
  }, [roiPercent, niceHashSourcePrice, niceHashPriceInMrrUnit, finalMrrRate, isLoadingMrrRate]);

  return {
    niceHashPriceInMrrUnit: effectiveNiceHashPrice,
    roiPercent,
    roiLabel,
  };
};