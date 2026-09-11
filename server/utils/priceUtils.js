// server/utils/priceUtils.js
// Centralized database price utilities
import { getCoinPricesFromDb } from "../coinGecko/coinGeckoClient.js";

let btcPriceCache = { price: 0, timestamp: 0 };
const BTC_PRICE_TTL = 3600000; // 60 minute

/**
 * Get the hourly-refreshed BTC price from the database.
 */
export async function getBtcPrice() {
  const now = Date.now();
  if (btcPriceCache.timestamp > now - BTC_PRICE_TTL) {
    return btcPriceCache.price;
  }

  try {
    const prices = await getCoinPricesFromDb(["bitcoin"]);
    btcPriceCache = { price: Number(prices?.bitcoin?.usd) || 0, timestamp: now };
  } catch (err) {
    console.warn("[BTC Price] Failed to read database price:", err.message);
    btcPriceCache = { price: 0, timestamp: now };
  }
  return btcPriceCache.price;
}

/**
 * Clear BTC price cache (force refresh on next call)
 */
export function clearBtcPriceCache() {
  btcPriceCache = { price: 0, timestamp: 0 };
  console.log("[BTC Price] Cache cleared");
}