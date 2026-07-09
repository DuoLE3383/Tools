import { useMemo } from 'react';
import { normalizeOrderAlgo } from '../utils/algorithmUtils.js';
import { getNiceHashPriceValue } from "../../../core/mrrUtils.js";
import { getAlgorithmUnit, HASHRATE_SUFFIXES } from "../../../core/mapping.js";
import { convertHashrateValue, cleanHashrateUnit } from '../utils/hashrateUtils.js';
import { normalizeAlgoForNiceHash } from "../../../core/mapping.js";

export const useNiceHashPrice = (nhOrders, algo, algoMarketPrices) => {
  const normalizedCardAlgo = normalizeAlgoForNiceHash(algo.raw);
  
  const nhOrder = useMemo(() => {
    const orders = nhOrders || [];
    return [...orders]
      .sort(
        (a, b) =>
          Number(
            b?.isActive ||
              b?.rawOrder?.status?.code === "ACTIVE" ||
              b?.rawOrder?.status === "ACTIVE",
          ) -
          Number(
            a?.isActive ||
              a?.rawOrder?.status?.code === "ACTIVE" ||
              a?.rawOrder?.status === "ACTIVE",
          ),
      )
      .find((order) => normalizeOrderAlgo(order) === normalizedCardAlgo);
  }, [nhOrders, normalizedCardAlgo]);

  const orderNhPrice = getNiceHashPriceValue(
    nhOrder?.price ?? nhOrder?.rawOrder?.price ?? nhOrder,
  );
  const buyNhPrice = nhOrder && orderNhPrice > 0 ? orderNhPrice : 0;
  const buyNhPriceWithFee = buyNhPrice > 0
    ? Number.parseFloat(nhOrder?.add_fee ?? nhOrder?.priceWithFee ?? 0) > 0
      ? Number.parseFloat(nhOrder.add_fee ?? nhOrder.priceWithFee)
      : buyNhPrice
    : 0;

  const marketPriceData = algoMarketPrices?.[algo.raw];
  const marketPriceValue = marketPriceData
    ? getNiceHashPriceValue(marketPriceData)
    : 0;
  const niceHashSourcePrice = marketPriceValue > 0 ? marketPriceValue : buyNhPriceWithFee;

  const nhPriceInMrrUnit = useMemo(() => {
    if (niceHashSourcePrice <= 0) return 0;
    const fromMultiplier = HASHRATE_SUFFIXES[cleanHashrateUnit(algo.nhUnit)] || 1;
    const toMultiplier = HASHRATE_SUFFIXES[cleanHashrateUnit(algo.mrrUnit)] || 1;
    return niceHashSourcePrice * (toMultiplier / fromMultiplier);
  }, [niceHashSourcePrice, algo.nhUnit, algo.mrrUnit]);

  return {
    nhOrder,
    buyNhPrice,
    buyNhPriceWithFee,
    marketPriceValue,
    niceHashSourcePrice,
    nhPriceInMrrUnit,
    hasPrice: niceHashSourcePrice > 0,
    unit: algo.nhUnit || "H"
  };
};