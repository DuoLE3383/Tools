// server/miners/heroMiners.js
import { COMMON_HEADERS, CONFIG } from "../config.js";
import { normalizeAlgo } from "../../src/core/mapping.js";
import { getBtcPrice } from "../utils/priceUtils.js";

const HERO_CACHE = new Map();
const HERO_CACHE_TTL = 60000;

/**
 * Maps coin subdomains from HeroMiners to their correct mining algorithm.
 * This is crucial because the API does not provide the algorithm directly.
 * List is compiled from various mining sources and sitemap analysis.
 */
const COIN_TO_ALGO_MAP = {
  aipg: "kawpow",
  alephium: "blake3",
  alph: "blake3",
  beam: "beamv3",
  clore: "kawpow",
  cfx: "octopus",
  conflux: "octopus",
  dynex: "dynexsolve",
  ergo: "autolykos2",
  etc: "etchash",
  ethw: "ethash",
  flux: "zelhash",
  iron: "fishhash",
  karlsen: "karlsenhash",
  kaspa: "kheavyhash",
  neoxa: "kawpow",
  nexa: "nexapow",
  qrl: "randomx",
  ravencoin: "kawpow",
  rvn: "kawpow",
  salvium: "randomx",
  zeph: "randomx",
};

async function discoverHeroMinersSubdomains(force = false) {
  const cacheKey = "hero_subdomains";
  const cached = HERO_CACHE.get(cacheKey);
  if (!force && cached && Date.now() - cached.timestamp < HERO_CACHE_TTL) return cached.data;

  const discovered = new Set();
  try {
    const res = await fetch("https://herominers.com/sitemap.xml", {
      headers: COMMON_HEADERS,
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const xml = await res.text();
      const matches = [...xml.matchAll(/https:\/\/([a-z0-9-]+)\.herominers\.com\//gi)];
      for (const match of matches) {
        const subdomain = match[1];
        if (subdomain && subdomain !== "herominers" && !subdomain.includes("www") &&
            !subdomain.includes("api") && !subdomain.includes("pool") &&
            !subdomain.includes("support") && !subdomain.includes("blog")) {
          discovered.add(subdomain);
        }
      }
    }
  } catch (err) {
    // Fallback to a comprehensive hardcoded list if sitemap fails
    [
      "aipg",
      "alephium",
      "beam",
      "clore",
      "conflux",
      "dynex",
      "ergo",
      "etc",
      "flux",
      "iron",
      "karlsen",
      "kaspa",
      "neoxa",
      "nexa",
      "qrl",
      "ravencoin",
      "zeph",
    ].forEach(c => discovered.add(c));
  }

  const result = Array.from(discovered);
  HERO_CACHE.set(cacheKey, { data: result, timestamp: Date.now() });
  return result;
}

async function scrapeHeroMinersAddress(address, coin) {
  if (!address) {
    return { success: false, error: "Address is required for HeroMiners lookup." };
  }
  if (!coin) {
    return { success: false, error: "Coin is required for HeroMiners address lookup." };
  }

  try {
    // Revert to using the coin-specific subdomain, which is more reliable.
    const url = `https://${coin.toLowerCase()}.herominers.com/api/stats_address?address=${address}`;
    const response = await fetch(url, {
      headers: { ...COMMON_HEADERS, Accept: "application/json" },
      signal: AbortSignal.timeout(CONFIG.REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`HeroMiners API returned status ${response.status} for address ${address} on ${coin} pool.`);
    }

    const data = await response.json();

    // The response for a specific coin is a single object of stats.
    const algorithm = COIN_TO_ALGO_MAP[coin.toLowerCase()] || coin.toLowerCase();
    const coinStats = [{
      algorithm,
      coin: coin.toUpperCase(),
      hashrate: data.hashrate,
      unpaid: data.unpaid,
      paid: data.paid,
      miners: data.workers_online || 0,
      normalizedAlgo: normalizeAlgo(algorithm),
    }];

    return { success: true, coinStats, miners: data.workers_online || 0 };
  } catch (err) {
    console.error(`[HeroMiners] Error fetching address stats for ${address}:`, err.message);
    return { success: false, error: err.message, stats: null };
  }
}

async function scrapeHeroMinersCoin(coin, btcPrice, force = false) {
  const cacheKey = `hero_${coin}`;
  const cached = HERO_CACHE.get(cacheKey);
  if (!force && cached && Date.now() - cached.timestamp < HERO_CACHE_TTL) return cached.data;

  try {
    const url = `https://${coin}.herominers.com/api/stats`;
    const response = await fetch(url, {
      headers: { ...COMMON_HEADERS, Accept: "application/json" },
      signal: AbortSignal.timeout(CONFIG.REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      HERO_CACHE.set(cacheKey, { data: [], timestamp: Date.now() });
      return [];
    }
    const data = await response.json();
    const rows = parseHeroMinersApiData(data, coin, btcPrice);
    HERO_CACHE.set(cacheKey, { data: rows, timestamp: Date.now() });
    return rows;
  } catch {
    HERO_CACHE.set(cacheKey, { data: [], timestamp: Date.now() });
    return [];
  }
}

function parseHeroMinersApiData(data, coin, btcPrice) {
  const rows = [];
  const pool = data?.pool || data;
  const config = data?.config || {};
  if (pool) {
    const coinName = String(config.symbol || coin).toUpperCase();
    const miners = parseInt(pool.miners || pool.workers || 0);
    const hashrate = pool.hashrate || pool.poolHashrate || "N/A";
    const btcPerDay = parseFloat(pool.price?.btc || pool.price?.BTC || 0);
    const algorithm = COIN_TO_ALGO_MAP[coin] || coin;
    if (miners > 0 || btcPerDay > 0) {
      rows.push({
        algorithm, coin: coinName, subdomain: coin, miners,
        hashrate: String(hashrate), btcPerDay,
        usdPerDay: btcPerDay * btcPrice,
        normalizedAlgo: normalizeAlgo(algorithm),
        nicehashAlgo: algorithm.toUpperCase(),
      });
    }
  }
  return rows;
}

export async function scrapeHeroMinersGlobal(btcPrice, force = false) {
  try {
    const coins = await discoverHeroMinersSubdomains(force);
    const results = [];
    const chunks = [];
    for (let i = 0; i < coins.length; i += CONFIG.MAX_CONCURRENT_FETCHES) {
      chunks.push(coins.slice(i, i + CONFIG.MAX_CONCURRENT_FETCHES));
    }
    for (const chunk of chunks) {
      const chunkResults = await Promise.all(chunk.map((coin) => scrapeHeroMinersCoin(coin, btcPrice, force)));
      results.push(...chunkResults.flat());
    }
    const allCoinStats = results.flat();
    const totalMiners = allCoinStats.reduce((sum, r) => sum + (r.miners || 0), 0);
    return { success: true, coinStats: allCoinStats, miners: totalMiners, coinsScraped: coins.length };
  } catch (err) {
    console.error("[HeroMiners] Error:", err.message);
    return { success: false, error: err.message, coinStats: [] };
  }
}

// Export all functions that might be needed elsewhere
export {
  scrapeHeroMinersCoin,
  scrapeHeroMinersAddress,
  COIN_TO_ALGO_MAP,
  discoverHeroMinersSubdomains,
  parseHeroMinersApiData,
};