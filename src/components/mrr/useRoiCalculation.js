import { useMemo } from "react";
import {
  calculatePriceComparison,
  convertNiceHashToMrr,
} from "../../core/mapping.js";

export const useRoiCalculation = ({
  finalMrrRate,
  mrrUnit,
  niceHashSourcePrice,
  normalizedAlgo,
  rawAlgo,
  isLoadingMrrRate,
  skipUnitConversion = false,
}) => {
  const niceHashPriceInMrrUnit = useMemo(() => {
    if (niceHashSourcePrice <= 0) return 0;
    // When skipUnitConversion is true, the caller passes the NH price already in TH
    // (the standard NH API unit). Do not apply convertNiceHashToMrr which uses
    // the algo mapping's niceHashUnit that does not match the actual API unit.
    if (skipUnitConversion) return niceHashSourcePrice;
    return convertNiceHashToMrr(niceHashSourcePrice, normalizedAlgo || rawAlgo);
  }, [niceHashSourcePrice, normalizedAlgo, rawAlgo, skipUnitConversion]);

  const roiPercent = useMemo(() => {
    if (finalMrrRate <= 0 || niceHashPriceInMrrUnit <= 0) return null;
    return calculatePriceComparison(
      finalMrrRate,
      mrrUnit,
      niceHashPriceInMrrUnit,
      mrrUnit,
    );
  }, [finalMrrRate, mrrUnit, niceHashPriceInMrrUnit]);

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
