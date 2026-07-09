// server/miners/whatToMine.js
import { COMMON_HEADERS, CONFIG } from "../config.js";

const WTM_API_KEY = process.env.WTM_API;
const WTM_BASE_URL = "https://api.whattomine.com/v2";

const CACHE = new Map();
const CACHE_TTL = 60 * 1000; // 1 minute

export async function scrapeWhatToMine(btcPrice) {
  const cacheKey = "wtm_global";
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  // Try API first if key is configured
  if (WTM_API_KEY) {
    try {
      const url = `${WTM_BASE_URL}/coins`;
      const response = await fetch(url, {
        headers: { ...COMMON_HEADERS, "X-API-KEY": WTM_API_KEY },
        signal: AbortSignal.timeout(CONFIG.REQUEST_TIMEOUT_MS),
      });

      if (response.ok) {
        const data = await response.json();
        const result = { success: true, coinStats: data?.coins || [], fetchedAt: new Date().toISOString() };
        CACHE.set(cacheKey, { data: result, timestamp: Date.now() });
        return result;
      }
    } catch (err) {
      console.warn("[WhatToMine] API fetch failed, falling back to web scrape:", err.message);
    }
  } else {
    console.log("[WhatToMine] No API key configured, using web scrape fallback");
  }

  // Fallback: scrape the public WhatToMine calculators page for known coins
  try {
    const response = await fetch("https://whattomine.com/coins", {
      headers: COMMON_HEADERS,
      signal: AbortSignal.timeout(CONFIG.REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();
    const { load } = await import("cheerio");
    const $ = load(html);
    const coinStats = [];

    $("table.coins-table tbody tr, .coin-list .coin-item, .coins tr").each((i, el) => {
      const cells = $(el).find("td");
      const name = $(el).find(".coin-name, .name, .coin").text().trim() || $(cells[0]).text().trim();
      const algo = $(el).find(".coin-algorithm, .algorithm").text().trim() || $(cells[1]).text().trim();
      const revenue = parseFloat($(el).find(".coin-revenue, .revenue, .profit").text().trim().replace(/[^0-9.]/g, "")) || 0;
      const miners = parseInt($(el).find(".coin-miners, .miners").text().trim().replace(/[^0-9]/g, "")) || 0;

      if (name && algo) {
        coinStats.push({
          coin: name.toUpperCase(),
          tag: name.toUpperCase(),
          algorithm: algo,
          algo,
          btcPerDay: revenue,
          profit: revenue,
          miners,
          usdPerDay: revenue * (btcPrice || 60000),
          usd_revenue: revenue * (btcPrice || 60000),
        });
      }
    });

    if (coinStats.length > 0) {
      console.log(`[WhatToMine] Scraped ${coinStats.length} coins from web`);
      const result = { success: true, coinStats, fetchedAt: new Date().toISOString() };
      CACHE.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    }

    console.warn("[WhatToMine] Web scrape returned 0 coins");
  } catch (err) {
    console.warn("[WhatToMine] Web scrape failed:", err.message);
  }

  // Last-resort fallback: hardcoded common algorithms with estimated data
  const btcPriceUsd = btcPrice || 60000;
  const fallbackCoins = [
    { coin: "BTC", tag: "BTC", algorithm: "SHA256", algo: "SHA256", btcPerDay: 0.000012, profit: 0.000012, miners: 500000 },
    { coin: "ETH", tag: "ETH", algorithm: "ETCHASH", algo: "ETCHASH", btcPerDay: 0.000005, profit: 0.000005, miners: 100000 },
    { coin: "RVN", tag: "RVN", algorithm: "KAWPOW", algo: "KAWPOW", btcPerDay: 0.000003, profit: 0.000003, miners: 50000 },
    { coin: "KAS", tag: "KAS", algorithm: "KHEAVYHASH", algo: "KHEAVYHASH", btcPerDay: 0.000009, profit: 0.000009, miners: 80000 },
    { coin: "BEAM", tag: "BEAM", algorithm: "BEAMV3", algo: "BEAMV3", btcPerDay: 0.000004, profit: 0.000004, miners: 30000 },
    { coin: "CFX", tag: "CFX", algorithm: "OCTOPUS", algo: "OCTOPUS", btcPerDay: 0.0000035, profit: 0.0000035, miners: 25000 },
    { coin: "IRON", tag: "IRON", algorithm: "FISHHASH", algo: "FISHHASH", btcPerDay: 0.0000025, profit: 0.0000025, miners: 20000 },
    { coin: "ZEPH", tag: "ZEPH", algorithm: "RANDOMX", algo: "RANDOMX", btcPerDay: 0.000006, profit: 0.000006, miners: 15000 },
    { coin: "QRL", tag: "QRL", algorithm: "RANDOMX", algo: "RANDOMX", btcPerDay: 0.000004, profit: 0.000004, miners: 10000 },
    { coin: "ERG", tag: "ERG", algorithm: "AUTOLYKOS2", algo: "AUTOLYKOS2", btcPerDay: 0.0000035, profit: 0.0000035, miners: 20000 },
    { coin: "ETC", tag: "ETC", algorithm: "ETCHASH", algo: "ETCHASH", btcPerDay: 0.000005, profit: 0.000005, miners: 40000 },
    { coin: "FLUX", tag: "FLUX", algorithm: "ZELHASH", algo: "ZELHASH", btcPerDay: 0.0000025, profit: 0.0000025, miners: 15000 },
    { coin: "ALPH", tag: "ALPH", algorithm: "BLAKE3", algo: "BLAKE3", btcPerDay: 0.0000035, profit: 0.0000035, miners: 10000 },
    { coin: "DYNEX", tag: "DYNEX", algorithm: "DYNEXSOLVE", algo: "DYNEXSOLVE", btcPerDay: 0.0000025, profit: 0.0000025, miners: 8000 },
    { coin: "NEXA", tag: "NEXA", algorithm: "NEXAPOW", algo: "NEXAPOW", btcPerDay: 0.000002, profit: 0.000002, miners: 12000 },
    { coin: "CLORE", tag: "CLORE", algorithm: "KAWPOW", algo: "KAWPOW", btcPerDay: 0.000002, profit: 0.000002, miners: 15000 },
    { coin: "KARLSEN", tag: "KARLSEN", algorithm: "KARLSENHASH", algo: "KARLSENHASH", btcPerDay: 0.0000015, profit: 0.0000015, miners: 5000 },
    { coin: "XELIS", tag: "XELIS", algorithm: "XELISHASHV3", algo: "XELISHASHV3", btcPerDay: 0.000002, profit: 0.000002, miners: 7000 },
    { coin: "ZANO", tag: "ZANO", algorithm: "PROGPOWZ", algo: "PROGPOWZ", btcPerDay: 0.000002, profit: 0.000002, miners: 6000 },
    { coin: "LTC", tag: "LTC", algorithm: "SCRYPT", algo: "SCRYPT", btcPerDay: 0.0000008, profit: 0.0000008, miners: 200000 },
    { coin: "DASH", tag: "DASH", algorithm: "X11", algo: "X11", btcPerDay: 0.0000005, profit: 0.0000005, miners: 50000 },
    { coin: "VRSC", tag: "VRSC", algorithm: "YESPOWER", algo: "YESPOWER", btcPerDay: 0.0000012, profit: 0.0000012, miners: 10000 },
  ].map(c => ({
    ...c,
    usdPerDay: c.btcPerDay * btcPriceUsd,
    usd_revenue: c.btcPerDay * btcPriceUsd,
  }));

  console.log(`[WhatToMine] Using fallback data (${fallbackCoins.length} coins)`);
  const result = { success: true, coinStats: fallbackCoins, fetchedAt: new Date().toISOString(), fallback: true };
  CACHE.set(cacheKey, { data: result, timestamp: Date.now() });
  return result;
}
