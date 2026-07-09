import { useMemo } from 'react';
import { calculatePriceComparison } from "../../../core/mapping.js";

export const useRoiCalculation = (mrRate, mrrUnit, nhPrice, nhUnit, isLoading) => {
  const roiPercent = useMemo(() => {
    if (nhPrice > 0 && mrRate > 0) {
      return calculatePriceComparison(mrRate, mrrUnit, nhPrice, nhUnit);
    }
    return null;
  }, [mrRate, mrrUnit, nhPrice, nhUnit]);

  const roiLabel = useMemo(() => {
    if (roiPercent !== null) {
      const num = Number(roiPercent);
      if (!Number.isFinite(num)) return "N/A";
      return `${num > 0 ? "+" : ""}${num.toFixed(2)}%`;
    }
    if (nhPrice > 0) {
      if (mrRate <= 0) return isLoading ? "Loading..." : "No MRR rate";
      return "Waiting for data";
    }
    return "No NH price";
  }, [roiPercent, nhPrice, mrRate, isLoading]);

  return { roiPercent, roiLabel };
};