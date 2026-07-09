import { getPriceDataLocal } from "../../../core/mrrUtils.js";

export const COINGECKO_BY_CURRENCY = {
  BTC: "bitcoin",
  LTC: "litecoin",
  DOGE: "dogecoin",
  BCH: "bitcoin-cash",
  ETH: "ethereum",
  ETC: "ethereum-classic",
};

export const PRICE_CURRENCIES = ["BTC", "ETH", "LTC", "DOGE", "BCH"];
export const FALLBACK_BTC_RATES = {
  BTC: 1,
  ETH: 0.05,
  LTC: 0.0008,
  DOGE: 0.0000018,
  BCH: 0.004,
  ETC: 0.0004,
};

export const resolvePaidPrice = (priceSource, convertedSource, algo) => {
  // For SHA256 variants, ALWAYS prioritize BTC and never fall back to other currencies.
  const isSha256Family = String(algo || "").toUpperCase().includes("SHA256");
  if (isSha256Family) {
    if (priceSource?.BTC) {
      const btcPriceData = getPriceDataLocal(priceSource.BTC);
      if (btcPriceData.value > 0) return { amount: btcPriceData.value, currency: 'BTC' };
    }
    if (String(priceSource?.currency).toUpperCase() === 'BTC' && priceSource?.paid > 0) {
      return { amount: priceSource.paid, currency: 'BTC' };
    }
    return { amount: 0, currency: 'BTC' };
  }

  // For all other algorithms, find the first available price.
  if (priceSource && typeof priceSource === "object") {
    for (const currency of PRICE_CURRENCIES) {
      const nested = priceSource[currency];
      if (nested && getPriceDataLocal(nested).value > 0) {
        return { amount: getPriceDataLocal(nested).value, currency };
      }
    }
  }

  const primary = getPriceDataLocal(priceSource || convertedSource);
  if (primary.value > 0) {
    return { amount: primary.value, currency: String(primary.currency || 'BTC').toUpperCase() };
  }

  return { amount: 0, currency: "BTC" };
};

export const convertPaidToBtc = (amount, currency, coinPrices = {}, fallbackBtc = 0) => {
  const upperCurrency = String(currency || "BTC").toUpperCase();
  if (!amount || amount <= 0) return 0;
  if (upperCurrency === "BTC") return amount;
  
  const coinId = COINGECKO_BY_CURRENCY[upperCurrency];
  const apiBtcRate = coinId
    ? Number.parseFloat(coinPrices?.[coinId]?.btc || 0)
    : 0;
  if (apiBtcRate > 0) return amount * apiBtcRate;
  
  const fallbackRate = FALLBACK_BTC_RATES[upperCurrency];
  if (fallbackRate !== undefined) return amount * fallbackRate;
  
  return Number.isFinite(fallbackBtc) && fallbackBtc > 0 ? fallbackBtc : 0;
};

export const getUsdtAmountDirect = (amount, currency, coinPrices) => {
  const upperCurrency = String(currency || "").toUpperCase();
  if (upperCurrency === "USDT") return 0;
  const coinId = COINGECKO_BY_CURRENCY[upperCurrency];
  if (!coinId) return 0;
  const usdPrice = coinPrices?.[coinId]?.usd;
  if (typeof usdPrice !== "number" || usdPrice <= 0) return 0;
  return amount * usdPrice;
};

export const getUsdPrice = (currency, coinPrices) => {
  const map = {
    BTC: "bitcoin",
    ETH: "ethereum",
    LTC: "litecoin",
    DOGE: "dogecoin",
    BCH: "bitcoin-cash",
  };
  const id = map[String(currency).toUpperCase()];
  return coinPrices?.[id]?.usd || 0;
};