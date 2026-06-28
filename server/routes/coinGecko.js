// routes/coinGecko.js
import { asyncHandler } from "../utils.js";
import { fetchAndStoreCoinPrices } from "../price-fetcher.js";
import { db } from "../db.js";

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
  return new Promise((resolve, reject) => {
    const placeholders = requestedIds.map(() => '?').join(',');
    const sql = `
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER(PARTITION BY coin_id ORDER BY captured_at DESC) as rn
        FROM coin_prices
        WHERE coin_id IN (${placeholders})
      ) WHERE rn = 1
    `;
    db.all(sql, requestedIds, (err, rows) => {
      if (err) return reject(err);
      const priceData = rows.reduce((acc, row) => {
        acc[row.coin_id] = {
          price: row.price_usd,
          price_btc: row.price_btc,
          source: row.source,
          last_updated: row.captured_at,
        };
        return acc;
      }, {});

      coinGeckoCache.data = { ...(coinGeckoCache.data || {}), ...priceData };
      coinGeckoCache.timestamp = now;
      resolve(coinGeckoCache.data);
    });
  });
}

export function registerCoinGeckoRoutes(app) {
  app.get(
    "/api/v2/prices/coingecko",
    asyncHandler(async (req, res) => { // This is your main price endpoint
      const defaultIds =
        "bitcoin,ethereum,ethereum-classic,litecoin,ravencoin,monero,kaspa,iron-fish,zephyr-protocol,clore-ai,dynex,conflux,ergo,bitcoin-cash";
      // Prioritize `coinId` for single lookups, then `ids`, then fallback to default
      const idsParam = req.query.coinId || req.query.ids || defaultIds;
      const ids = idsParam.split(",").map((s) => s.trim()).join(",");

      try {
        const data = await getCachedCoinPrices(ids); // Now uses the robust fetcher
        const requestedId = ids.split(',')[0];
        
        // If a single ID was requested, return just that coin's data for compatibility with the modal
        if (ids.split(',').length === 1 && data[requestedId]) {
          return res.json({ success: true, data: data[requestedId], source: "db_cache" });
        }
        res.json({ success: true, data, source: "db_cache" });
      } catch (err) {
        res.status(503).json({ success: false, error: err.message });
      }
    }),
  );
}