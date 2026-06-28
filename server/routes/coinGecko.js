// routes/coinGecko.js
import { asyncHandler } from "../utils.js";
import { getCmcPrices } from "../cmcClient.js"; // Make sure this is correctly implemented

let coinGeckoCache = {
  data: null,
  timestamp: 0,
  ttl: 60 * 60 * 1000, // 1-hour cache TTL
};

async function getCachedCoinPrices(ids) {
  const now = Date.now();
  const requested = ids.split(",").map(s => s.trim()).filter(Boolean);

  // Cache hit?
  if (coinGeckoCache.data && now - coinGeckoCache.timestamp < coinGeckoCache.ttl) {
    const cachedIds = Object.keys(coinGeckoCache.data);
    const missing = requested.filter(id => !cachedIds.includes(id));
    if (missing.length === 0) return coinGeckoCache.data;
  }

  // 1. Primary Provider: CoinGecko
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd,btc`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`CoinGecko API error: ${response.status}`);
    const data = await response.json();

    // Merge new data with existing cache
    coinGeckoCache.data = coinGeckoCache.data ? { ...coinGeckoCache.data, ...data } : data;
    coinGeckoCache.timestamp = now;
    return coinGeckoCache.data;
  } catch (err) {
    console.warn("[CoinGecko] Failed, trying CMC:", err.message);
  }

  // 2. Fallback Provider: CoinMarketCap
  try {
    // Map CoinGecko IDs to CMC symbols (this is a simplified example)
    const symbols = requested.map(id => {
      const map = {
        bitcoin: "BTC",
        ethereum: "ETH",
        "ethereum-classic": "ETC",
        litecoin: "LTC",
        dogecoin: "DOGE",
        "bitcoin-cash": "BCH",
        ravencoin: "RVN",
        monero: "XMR",
        kaspa: "KAS",
        // Add other mappings as needed
      };
      return map[id] || id.toUpperCase();
    });

    const cmcData = await getCmcPrices(symbols);
    const converted = {};

    for (const [symbol, price] of Object.entries(cmcData)) {
      // Convert CMC response back to a CoinGecko-like structure
      converted[symbol.toLowerCase()] = price;
    }

    // Merge with cache and update timestamp
    coinGeckoCache.data = coinGeckoCache.data ? { ...coinGeckoCache.data, ...converted } : converted;
    coinGeckoCache.timestamp = now;
    return coinGeckoCache.data;
  } catch (cmcErr) {
    console.error("[CoinGecko] Both CoinGecko and CMC failed:", cmcErr.message);
    throw new Error("Unable to fetch prices from CoinGecko or CoinMarketCap");
  }
}

async function getCmcPrice(symbol) {
  if (!symbol) {
    throw new Error("Symbol is required for CMC price lookup.");
  }
  try {
    const prices = await getCmcPrices([symbol]);
    // The getCmcPrices function returns an object where keys are lowercase coin IDs.
    // We need to find the price for the requested symbol, likely by its lowercase version.
    const priceData = prices[symbol.toLowerCase()];
    if (priceData) {
      // The frontend expects a structure similar to CoinGecko's for simplicity.
      // Let's mimic that structure.
      return {
        price: priceData.usd,
        price_btc: priceData.btc,
        // CMC simple quotes don't provide all fields, so we return what we have.
      };
    }
    throw new Error(`Price for ${symbol} not found on CoinMarketCap.`);
  } catch (err) {
    throw new Error(`CMC Fallback Error: ${err.message}`);
  }
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
          return res.json({ success: true, data: data[requestedId], source: "cache" });
        }
        res.json({ success: true, data, source: "cache" });
      } catch (err) {
        res.status(503).json({ success: false, error: err.message });
      }
    }),
  );

  app.get(
    "/api/v2/prices/cmc",
    asyncHandler(async (req, res) => {
      const { symbol } = req.query;
      try {
        const data = await getCmcPrice(symbol);
        res.json({ success: true, data, source: "cmc" });
      } catch (err) {
        res.status(503).json({ success: false, error: err.message, source: "cmc" });
      }
    }),
  );
}