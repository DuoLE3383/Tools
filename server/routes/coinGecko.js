// routes/coinGecko.js
import { asyncHandler } from "../utils.js";
import { getDb } from "../db.js";
import { getCoinPricesFromDb, getLastPriceFetchStatus } from "../coinGecko/coinGeckoClient.js";
import {
  fetchFromCoinGecko,
  fetchFromCoinMarketCap,
  fetchFromCryptoCompare,
  fetchFromKraken,
  clearFallbackCache,
} from './priceProviders.js';
import { getBtcPrice } from '../utils/priceUtils.js';

/**
 * Fetches coin metadata directly from the database.
 * This avoids loading the problematic coinGeckoClient.js file at startup.
 */
async function getCoinMetadata() {
  try {
    const db = await getDb();
    return await db.all(`SELECT coin_id, symbol, coin_name FROM coin_metadata ORDER BY coin_name`);
  } catch (err) {
    console.error('[CoinGecko] Failed to get coin metadata from DB:', err.message);
    return []; // Return empty array on error to prevent crash
  }
}

export { clearFallbackCache };

export function registerCoinGeckoRoutes(app) {
  app.get(
    "/api/v2/prices/coingecko",
    asyncHandler(async (req, res) => { // This is your main price endpoint
      const defaultIds = "bitcoin,ethereum,litecoin,dogecoin,monero,ravencoin,kaspa";
      // Prioritize `coinId` for single lookups, then `ids`, then fallback to default
      let idsParam = req.query.coinId || req.query.ids || defaultIds;
      const vsCurrency = req.query.vs_currency || 'usd';
      let ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean).join(",");
      const originalRequestedIds = ids.split(',');

      // If it's a single ID request from coinId, try to resolve it from symbol to coin_id
      if (req.query.coinId && originalRequestedIds.length === 1) {
        const db = await getDb();
        const meta = await db.get('SELECT coin_id FROM coin_metadata WHERE upper(symbol) = ? OR coin_id = ?', [originalRequestedIds[0].toUpperCase(), originalRequestedIds[0].toLowerCase()]);
        if (meta && meta.coin_id) {
          ids = meta.coin_id; // Replace symbol (e.g., 'cfx') with actual coin_id (e.g., 'conflux-token')
        }
      }

      try {
        const dataFromDb = await getCoinPricesFromDb(ids.split(','));
        const resolvedIds = ids.split(',');

        // If a single ID was requested, return it keyed by the original request symbol
        if (originalRequestedIds.length === 1) {
          const coinIdToLookup = resolvedIds[0];
          let coinData = dataFromDb[coinIdToLookup];

          // If not found in DB/cache, it will be handled by the check below
          if ((!coinData || coinData.usd === undefined || coinData.usd <= 0)) {
            if (coinIdToLookup === 'bitcoin') {
              console.log(`[PriceFetcher] DB cache miss for bitcoin. Using priceUtils fallback.`);
              const btcPrice = await getBtcPrice();
              if (btcPrice > 0) coinData = { usd: btcPrice, btc: 1, last_updated: new Date().toISOString(), source: 'fallback' };
            } else {
              console.log(`[PriceFetcher] DB cache miss for ${coinIdToLookup}. No live fallback configured.`);
            }
          }

          if (coinData && coinData.usd !== undefined && coinData.usd > 0) {
            const responsePayload = { [originalRequestedIds[0].toLowerCase()]: coinData };
            return res.json(responsePayload);
          }
          return res.status(404).json({ success: false, error: `Price not found for ${originalRequestedIds[0]}` });
        }
        // For multiple IDs, just return what we have from the DB
        res.json(dataFromDb);
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    }),
  );

  app.get(
    "/api/v2/coins/list",
    asyncHandler(async (req, res) => {
      const metadata = await getCoinMetadata();
      const coins = metadata.map(m => ({ id: m.coin_id, symbol: m.symbol, name: m.coin_name }));
      res.json({ success: true, data: coins });
    })
  );

  app.get(
    "/api/v2/prices/db/status",
    asyncHandler(async (req, res) => {
      const status = getLastPriceFetchStatus();
      res.json({ success: true, data: status });
    })
  );
}
