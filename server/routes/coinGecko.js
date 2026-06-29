// routes/coinGecko.js
import { asyncHandler } from "../utils.js";
import {
  getStoredCoinPriceCatalog,
  fetchCoinGeckoSimplePrices,
} from "../priceProvider.js";
import { fetchAndStoreCoinPrices } from "../priceFetcher.js";

async function getCachedCoinPrices(ids) {
  const requested = String(ids || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const catalog = await getStoredCoinPriceCatalog();
  if (requested.length === 0) {
    return catalog;
  }

  const filtered = {};
  for (const key of requested) {
    if (catalog[key]) {
      filtered[key] = catalog[key];
    }
  }

  if (Object.keys(filtered).length > 0) {
    return filtered;
  }

  const liveCatalog = await fetchCoinGeckoSimplePrices(requested);
  const liveFiltered = {};
  for (const key of requested) {
    if (liveCatalog[key]) {
      liveFiltered[key] = liveCatalog[key];
    }
  }
  if (Object.keys(liveFiltered).length > 0) {
    return liveFiltered;
  }

  return liveCatalog;
}

export function registerCoinGeckoRoutes(app) {
  app.get(
    "/api/v2/prices/coingecko",
    asyncHandler(async (req, res) => {
      try {
        const ids = req.query.ids || "";
        const data = await getCachedCoinPrices(ids);
        res.json({ success: true, data, source: "provider" });
      } catch (err) {
        res.status(503).json({ success: false, error: err.message });
      }
    }),
  );

  app.post(
    "/api/v2/prices/coingecko/update",
    asyncHandler(async (req, res) => {
      try {
        const result = await fetchAndStoreCoinPrices();
        res.json({
          success: true,
          message: "Coin catalog updated",
          data: result,
        });
      } catch (err) {
        res.status(503).json({ success: false, error: err.message });
      }
    }),
  );
}
