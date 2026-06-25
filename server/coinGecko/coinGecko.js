// routes/coinGecko.js
import { asyncHandler } from "../utils.js";
import { getAllCoins } from "../coinFetcher.js";

/**
 * Fetches all coin prices from the local database, which is populated by coinFetcher.js.
 * This avoids direct API calls and provides a comprehensive, cached list of all coins.
 * @param {string} source - 'coingecko' or 'cmc'
 * @returns {Promise<object>} A map of coin data.
 */
async function getLocalCoinPrices(source = 'coingecko') {
  // Fetch a large number of coins, sorted by market cap, from the local DB.
  const allCoins = await getAllCoins(source, 20000); 
  
  const priceData = {};
  
  for (const coin of allCoins) {
    // The coingecko ID is the unique identifier (e.g., 'bitcoin')
    const coinId = coin.id; 
    if (coinId) {
      priceData[coinId] = {
        usd: coin.price_usd,
        // The btc price is not directly available and would require an extra lookup.
        // For the calculator's purpose, USD is the primary value.
        btc: null, 
      };
    }
  }
  
  return priceData;
} 

export function registerCoinGeckoRoutes(app) {
  app.get(
    "/api/v2/prices/coingecko",
    asyncHandler(async (req, res) => {
      try {
        // Fetch all coins from the local database via the coinFetcher utility
        const data = await getLocalCoinPrices('coingecko');
        res.json({ success: true, data, source: "database" });
      } catch (err) {
        res.status(503).json({ success: false, error: err.message });
      }
    }),
  );
}