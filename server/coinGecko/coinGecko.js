// routes/coinGecko.js
import { asyncHandler } from "../utils.js";
import { getCmcPrices } from "../routes/cmcClient.js";

let coinGeckoCache = {
  data: null,
  timestamp: 0,
  ttl: 60 * 60 * 1000,
};

async function getCachedCoinPrices(ids) {
  const now = Date.now();
  const requested = ids.split(",").map(s => s.trim()).filter(Boolean);

  // Cache hit?
  if (coinGeckoCache.data && (now - coinGeckoCache.timestamp) < coinGeckoCache.ttl) {
    const cachedIds = Object.keys(coinGeckoCache.data);
    const missing = requested.filter(id => !cachedIds.includes(id));
    if (missing.length === 0) return coinGeckoCache.data;
  }

  // 1️⃣ Try CoinGecko
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd,btc`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`CoinGecko API error: ${response.status}`);
    const data = await response.json();

    coinGeckoCache.data = coinGeckoCache.data ? { ...coinGeckoCache.data, ...data } : data;
    coinGeckoCache.timestamp = now;
    return coinGeckoCache.data;
  } catch (err) {
    console.warn("[CoinGecko] Failed, trying CMC:", err.message);
  }

  // 2️⃣ Try CoinMarketCap
  try {
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
      };
      return map[id] || id.toUpperCase();
    });
    const cmcData = await getCmcPrices(symbols);
    const converted = {};
    for (const [symbol, price] of Object.entries(cmcData)) {
      converted[symbol.toLowerCase()] = price;
    }
    coinGeckoCache.data = coinGeckoCache.data ? { ...coinGeckoCache.data, ...converted } : converted;
    coinGeckoCache.timestamp = now;
    return coinGeckoCache.data;
  } catch (cmcErr) {
    console.error("[CoinGecko] Both CoinGecko and CMC failed:", cmcErr.message);
    // ❌ No hardcoded fallback – throw error
    throw new Error("Unable to fetch prices from CoinGecko or CoinMarketCap");
  }
}

export function registerCoinGeckoRoutes(app) {
  app.get(
    "/api/v2/prices/coingecko",
    asyncHandler(async (req, res) => {
      const defaultIds =
        "bitcoin,ethereum,ethereum-classic,litecoin,ravencoin,monero,kaspa,iron-fish,zephyr-protocol,clore-ai,dynex,conflux,ergo,bitcoin-cash";
      const idsParam = req.query.ids || defaultIds;
      const ids = idsParam.split(",").map((s) => s.trim()).join(",");

      try {
        const data = await getCachedCoinPrices(ids);
        res.json({ success: true, data, source: "cache" });
      } catch (err) {
        res.status(503).json({ success: false, error: err.message });
      }
    }),
  );
}