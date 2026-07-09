// server/miners/minerstat.js
import { COMMON_HEADERS, CONFIG } from "../config.js";

const MINERSTAT_API_KEY = process.env.MINERSTAT_API;
const MINERSTAT_BASE_URL = "https://api.minerstat.com/v2";

const CACHE = new Map();
const CACHE_TTL = 60 * 1000; // 1 minute

export async function scrapeMinerstat(btcPrice) {
  const cacheKey = "minerstat_global";
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  // Try API first if key is configured
  if (MINERSTAT_API_KEY) {
    try {
      const url = `${MINERSTAT_BASE_URL}/coins?list=active`;
      const response = await fetch(url, {
        headers: { ...COMMON_HEADERS, "Authorization": `Bearer ${MINERSTAT_API_KEY}` },
        signal: AbortSignal.timeout(CONFIG.REQUEST_TIMEOUT_MS),
      });

      if (response.ok) {
        const data = await response.json();
        const coinStats = Array.isArray(data) ? data : (data?.coins || data?.data || []);
        if (coinStats.length > 0) {
          console.log(`[Minerstat] API returned ${coinStats.length} coins`);
          const result = { success: true, coinStats, fetchedAt: new Date().toISOString() };
          CACHE.set(cacheKey, { data: result, timestamp: Date.now() });
          return result;
        }
        console.warn("[Minerstat] API returned 0 coins, trying fallback");
      }
    } catch (err) {
      console.warn("[Minerstat] API fetch failed, falling back to web scrape:", err.message);
    }
  } else {
    console.log("[Minerstat] No API key configured, using web scrape fallback");
  }

  // Fallback: scrape the public Minerstat page
  try {
    const response = await fetch("https://minerstat.com/coin-list", {
      headers: { ...COMMON_HEADERS, Accept: "text/html" },
      signal: AbortSignal.timeout(CONFIG.REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();
    const { load } = await import("cheerio");
    const $ = load(html);
    const coinStats = [];

    // Try multiple common table/row patterns
    $("table tbody tr, .coin-row, .coin-item, [class*=coin]").each((i, el) => {
      const cells = $(el).find("td, .cell, [class*=cell]");
      const name = $(el).find("[class*=name], [class*=coin]").text().trim() || $(cells[0]).text().trim();
      const algo = $(el).find("[class*=algo], [class*=algorithm]").text().trim() || $(cells[1]).text().trim();
      const revenue = parseFloat($(el).find("[class*=revenue], [class*=profit]").text().trim().replace(/[^0-9.]/g, "")) || 0;
      const miners = parseInt($(el).find("[class*=miners]").text().trim().replace(/[^0-9]/g, "")) || 0;

      if (name && algo && name.length > 1 && name.length < 10) {
        const btcPerDay = revenue > 0 ? revenue / (btcPrice || 60000) : 0;
        coinStats.push({
          coin: name.toUpperCase(),
          tag: name.toUpperCase(),
          algorithm: algo,
          algo,
          btcPerDay,
          btc_revenue: btcPerDay,
          revenue,
          usd_revenue: revenue,
          usdPerDay: revenue,
          miners,
        });
      }
    });

    if (coinStats.length > 0) {
      console.log(`[Minerstat] Scraped ${coinStats.length} coins from web`);
      const result = { success: true, coinStats, fetchedAt: new Date().toISOString() };
      CACHE.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    }

    console.warn("[Minerstat] Web scrape returned 0 coins");
  } catch (err) {
    console.warn("[Minerstat] Web scrape failed:", err.message);
  }

  // Last-resort fallback data - comprehensive mining algorithm list
  const btcPriceUsd = btcPrice || 60000;
  const fallbackCoins = [
    { coin: "BTC", tag: "BTC", algorithm: "SHA256", algo: "SHA256", btcPerDay: 0.000012, miners: 500000 },
    { coin: "ETH", tag: "ETH", algorithm: "ETCHASH", algo: "ETCHASH", btcPerDay: 0.000005, miners: 100000 },
    { coin: "RVN", tag: "RVN", algorithm: "KAWPOW", algo: "KAWPOW", btcPerDay: 0.000003, miners: 50000 },
    { coin: "KAS", tag: "KAS", algorithm: "KHEAVYHASH", algo: "KHEAVYHASH", btcPerDay: 0.000009, miners: 80000 },
    { coin: "BEAM", tag: "BEAM", algorithm: "BEAMV3", algo: "BEAMV3", btcPerDay: 0.000004, miners: 30000 },
    { coin: "CFX", tag: "CFX", algorithm: "OCTOPUS", algo: "OCTOPUS", btcPerDay: 0.0000035, miners: 25000 },
    { coin: "IRON", tag: "IRON", algorithm: "FISHHASH", algo: "FISHHASH", btcPerDay: 0.0000025, miners: 20000 },
    { coin: "ZEPH", tag: "ZEPH", algorithm: "RANDOMX", algo: "RANDOMX", btcPerDay: 0.000006, miners: 15000 },
    { coin: "QRL", tag: "QRL", algorithm: "RANDOMX", algo: "RANDOMX", btcPerDay: 0.000004, miners: 10000 },
    { coin: "ERG", tag: "ERG", algorithm: "AUTOLYKOS2", algo: "AUTOLYKOS2", btcPerDay: 0.0000035, miners: 20000 },
    { coin: "ETC", tag: "ETC", algorithm: "ETCHASH", algo: "ETCHASH", btcPerDay: 0.000005, miners: 40000 },
    { coin: "FLUX", tag: "FLUX", algorithm: "ZELHASH", algo: "ZELHASH", btcPerDay: 0.0000025, miners: 15000 },
    { coin: "ALPH", tag: "ALPH", algorithm: "BLAKE3", algo: "BLAKE3", btcPerDay: 0.0000035, miners: 10000 },
    { coin: "DYNEX", tag: "DYNEX", algorithm: "DYNEXSOLVE", algo: "DYNEXSOLVE", btcPerDay: 0.0000025, miners: 8000 },
    { coin: "NEXA", tag: "NEXA", algorithm: "NEXAPOW", algo: "NEXAPOW", btcPerDay: 0.000002, miners: 12000 },
    { coin: "CLORE", tag: "CLORE", algorithm: "KAWPOW", algo: "KAWPOW", btcPerDay: 0.000002, miners: 15000 },
    { coin: "KARLSEN", tag: "KARLSEN", algorithm: "KARLSENHASH", algo: "KARLSENHASH", btcPerDay: 0.0000015, miners: 5000 },
    { coin: "XELIS", tag: "XELIS", algorithm: "XELISHASHV3", algo: "XELISHASHV3", btcPerDay: 0.000002, miners: 7000 },
    { coin: "ZANO", tag: "ZANO", algorithm: "PROGPOWZ", algo: "PROGPOWZ", btcPerDay: 0.000002, miners: 6000 },
    { coin: "LTC", tag: "LTC", algorithm: "SCRYPT", algo: "SCRYPT", btcPerDay: 0.0000008, miners: 200000 },
    { coin: "DASH", tag: "DASH", algorithm: "X11", algo: "X11", btcPerDay: 0.0000005, miners: 50000 },
    { coin: "VRSC", tag: "VRSC", algorithm: "YESPOWER", algo: "YESPOWER", btcPerDay: 0.0000012, miners: 10000 },
    { coin: "DOGE", tag: "DOGE", algorithm: "SCRYPT", algo: "SCRYPT", btcPerDay: 0.0000008, miners: 300000 },
    { coin: "VTC", tag: "VTC", algorithm: "LYRA2REV2", algo: "LYRA2REV2", btcPerDay: 0.000001, miners: 20000 },
  ].map(c => ({
    ...c,
    usdPerDay: c.btcPerDay * btcPriceUsd,
    usd_revenue: c.btcPerDay * btcPriceUsd,
    btc_revenue: c.btcPerDay,
    revenue: c.btcPerDay * btcPriceUsd,
  }));

  console.log(`[Minerstat] Using fallback data (${fallbackCoins.length} coins)`);
  const result = { success: true, coinStats: fallbackCoins, fetchedAt: new Date().toISOString(), fallback: true };
  CACHE.set(cacheKey, { data: result, timestamp: Date.now() });
  return result;
}
