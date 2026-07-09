// routes/coinGecko.js
import { asyncHandler } from "../utils.js";
import { getDb } from "../db.js";

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

let coinGeckoCache = {
  data: null,
  timestamp: 0,
};

async function getCachedCoinPrices(ids) {
  const now = Date.now();
  const requestedIds = ids.split(",").map(s => s.trim()).filter(Boolean);

  // Return from cache if valid and all requested IDs are present
  if (coinGeckoCache.data && now - coinGeckoCache.timestamp < 60000) { // 1 minute cache
    const cachedIds = Object.keys(coinGeckoCache.data);
    const missing = requestedIds.filter(id => !cachedIds.includes(id));
    if (missing.length === 0) return coinGeckoCache.data;
  }

  // If cache is stale or incomplete, fetch from DB
  const placeholders = requestedIds.map(() => '?').join(',');
  const sql = `
    SELECT * FROM (
      SELECT *, ROW_NUMBER() OVER(PARTITION BY coin_id ORDER BY captured_at DESC) as rn
      FROM coin_prices
      WHERE coin_id IN (${placeholders})
    ) WHERE rn = 1
  `;

  const db = await getDb();
  const rows = await db.all(sql, requestedIds);
  const priceData = rows.reduce((acc, row) => {
    acc[row.coin_id] = {
      usd: row.price_usd,
      price_btc: row.price_btc,
      source: row.source,
      last_updated: row.captured_at,
    };
    return acc;
  }, {});

  const combinedData = { ...(coinGeckoCache.data || {}), ...priceData };
  const allFound = requestedIds.every(id => combinedData[id]);

  if (allFound) {
    coinGeckoCache.data = combinedData;
    coinGeckoCache.timestamp = now;
  }
  return combinedData;
}

export function registerCoinGeckoRoutes(app) {
  app.get(
    "/api/v2/prices/coingecko",
    asyncHandler(async (req, res) => { // This is your main price endpoint
      const defaultIds = "bitcoin,ethereum,litecoin,dogecoin,monero,ravencoin,kaspa";
      // Prioritize `coinId` for single lookups, then `ids`, then fallback to default
      const idsParam = req.query.coinId || req.query.ids || defaultIds;
      const vsCurrency = req.query.vs_currency || 'usd';
      const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean).join(",");

      try {
        const data = await getCachedCoinPrices(ids); // Now uses the robust fetcher
        const requestedIds = ids.split(',');

        // If a single ID was requested, return just that coin's data for compatibility with the modal
        if (requestedIds.length === 1 && data[requestedIds[0]]) {
          return res.json({ success: true, data: data[requestedIds[0]], source: "db_cache" });
        }

        res.json({ success: true, data, source: "db_cache" });
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
}