// routes/price-fetcher.js - Live CoinGecko API proxy
import { asyncHandler } from "../utils.js";

const CACHE = new Map();
const CACHE_TTL = 60000;

export function registerPriceFetcherRoutes(app) {
  // Live proxy: fetch ANY coin price from CoinGecko by ID
  app.get("/api/v2/coingecko/live", asyncHandler(async (req, res) => {
    const { ids, vs_currencies = "usd" } = req.query;
    if (!ids) return res.status(400).json({ success: false, error: "ids required" });

    const cacheKey = `cg_live:${ids}:${vs_currencies}`;
    const cached = CACHE.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return res.json(cached.data);
    }

    try {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=${vs_currencies}&include_24hr_change=true&include_market_cap=true`;
      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`CG returned ${response.status}`);
      const data = await response.json();
      CACHE.set(cacheKey, { data, ts: Date.now() });
      res.json(data);
    } catch (err) {
      res.status(502).json({ success: false, error: err.message });
    }
  }));

  // Search CoinGecko for coin ID by symbol
  app.get("/api/v2/coingecko/search", asyncHandler(async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ success: false, error: "query required" });

    try {
      const url = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`CG search returned ${response.status}`);
      const data = await response.json();
      res.json(data);
    } catch (err) {
      res.status(502).json({ success: false, error: err.message });
    }
  }));
}
