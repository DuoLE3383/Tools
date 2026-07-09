// server/miningPoolProviders.js
// Unified providers for 2Miners, K1Pool, Kryptex, and HeroMiners
// Fetches global pool stats (miners, hashrate, coins) in normalized format
// for both the Miner page and Mining Opportunities page.

const COMMON_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  Accept: "application/json",
};

const FETCH_TIMEOUT = 10000;
const CACHE_TTL = 15000; // 15 seconds cache to avoid hammering
const poolStatsCache = new Map();

function cachedFetch(url, cacheKey, ttl = CACHE_TTL) {
  const cached = poolStatsCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < ttl) return cached.data;

  const promise = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    try {
      const res = await fetch(url, { headers: COMMON_HEADERS, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      poolStatsCache.set(cacheKey, { data, ts: Date.now() });
      return data;
    } catch (err) {
      clearTimeout(timer);
      // Return stale cache if available
      const stale = poolStatsCache.get(cacheKey);
      if (stale) return stale.data;
      throw err;
    }
  })();

  poolStatsCache.set(cacheKey, { data: promise, ts: Date.now() });
  return promise;
}

// ============================================================
// 2Miners Provider
// ============================================================

async function fetch2MinersCoins() {
  // 2Miners has a public /api/coins endpoint that lists all supported coins
  const data = await cachedFetch("https://2miners.com/api/coins", "2miners_coins", 60000);
  if (!Array.isArray(data)) return [];
  return data;
}

export async function fetch2MinersStats() {
  const coins = await fetch2MinersCoins();
  const coinStats = [];
  let totalMiners = 0;

  // Fetch stats for each coin in parallel (limit to top 20 to avoid overload)
  const topCoins = coins.slice(0, 20);
  const results = await Promise.allSettled(
    topCoins.map(async (coin) => {
      // coin format: { coin: "etc", name: "Ethereum Classic", symbol: "ETC", algo: "etchash" }
      const coinName = coin.coin || coin.symbol || "";
      const algo = coin.algo || coin.algorithm || "";
      if (!coinName || !algo) return null;

      const statsUrl = `https://2miners.com/api/pools/${coinName}`;
      const stats = await cachedFetch(statsUrl, `2miners_stats_${coinName}`, 15000);
      if (!stats) return null;

      const poolMiners = parseInt(stats.miners || stats.miners_online || 0);
      const poolHashrate = parseFloat(stats.hashrate || stats.network_hashrate || 0);
      const btcPerDay = parseFloat(stats.rewards?.btc_per_day || stats.btc_per_day || 0);

      totalMiners += poolMiners;

      return {
        coin: (coin.symbol || coin.coin || "").toUpperCase(),
        algorithm: algo,
        normalizedAlgo: algo.toLowerCase(),
        miners: poolMiners,
        hashrate: poolHashrate,
        btcPerDay,
        usdPerDay: 0,
        pool: "2Miners",
        raw: { ...stats, coinMeta: coin },
      };
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      coinStats.push(result.value);
    }
  }

  return { success: true, coinStats, miners: totalMiners };
}

// ============================================================
// K1Pool Provider
// ============================================================

async function fetchK1PoolCoins() {
  const data = await cachedFetch("https://k1pool.com/api/k1/coins", "k1pool_coins", 60000);
  // Returns: [ { coin: "quai", algo: "quaisha256", name: "Quai Network", ... } ]
  if (Array.isArray(data)) return data;
  if (data?.coins && Array.isArray(data.coins)) return data.coins;
  // Fallback: known coins
  return [
    { coin: "quai", algo: "quaisha256", name: "Quai Network", symbol: "QUAI" },
  ];
}

export async function fetchK1PoolStats() {
  const coins = await fetchK1PoolCoins();
  const coinStats = [];
  let totalMiners = 0;

  const results = await Promise.allSettled(
    coins.slice(0, 10).map(async (coin) => {
      const coinName = coin.coin || coin.symbol || "";
      const algo = coin.algo || coin.algorithm || "";
      if (!coinName) return null;

      const statsUrl = `https://k1pool.com/api/k1/stats?coin=${coinName}`;
      const stats = await cachedFetch(statsUrl, `k1pool_stats_${coinName}`, 15000);
      if (!stats) return null;

      const poolMiners = parseInt(stats.miners || stats.miners_online || 0);
      const poolHashrate = parseFloat(stats.hashrate || stats.network_hashrate || 0);
      const btcPerDay = parseFloat(stats.rewards?.btc_per_day || stats.btc_per_day || 0);

      totalMiners += poolMiners;

      return {
        coin: (coin.symbol || coin.coin || coinName).toUpperCase(),
        algorithm: algo,
        normalizedAlgo: algo.toLowerCase(),
        miners: poolMiners,
        hashrate: poolHashrate,
        btcPerDay,
        usdPerDay: 0,
        pool: "K1Pool",
        raw: stats,
      };
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      coinStats.push(result.value);
    }
  }

  return { success: true, coinStats, miners: totalMiners };
}

// ============================================================
// Kryptex Provider
// ============================================================

export async function fetchKryptexStats() {
  // Kryptex public API for pool stats
  const coinStats = [];
  let totalMiners = 0;

  // Kryptex supports multiple coins; fetch each one
  const kryptexCoins = ["ETC", "RVN", "KAS", "ZEC", "ETHW", "BEAM", "ERGO", "FLUX", "ZIL"];
  
  const results = await Promise.allSettled(
    kryptexCoins.map(async (coinSymbol) => {
      const lowerCoin = coinSymbol.toLowerCase();
      const statsUrl = `https://pool.kryptex.com/${lowerCoin}/api/v2/pool/stats`;
      const stats = await cachedFetch(statsUrl, `kryptex_stats_${lowerCoin}`, 30000);
      if (!stats) return null;

      const poolMiners = parseInt(stats.miners || stats.miners_online || 0);
      const poolHashrate = parseFloat(stats.hashrate || stats.hashrate_24h || 0);
      const btcPerDay = parseFloat(stats.rewards?.btc_per_day || stats.btc || stats.btc_per_day || 0);

      totalMiners += poolMiners;

      return {
        coin: coinSymbol,
        algorithm: stats.algo || stats.algorithm || lowerCoin,
        normalizedAlgo: (stats.algo || stats.algorithm || lowerCoin).toLowerCase(),
        miners: poolMiners,
        hashrate: poolHashrate,
        btcPerDay,
        usdPerDay: 0,
        pool: "Kryptex",
        raw: stats,
      };
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      coinStats.push(result.value);
    }
  }

  return { success: true, coinStats, miners: totalMiners };
}

// ============================================================
// Unified Provider — fetches all pools
// ============================================================

export async function fetchAllPoolStats() {
  const [herominers, dutch, twoMiners, k1pool, kryptex] = await Promise.allSettled([
    fetchHeroMinersStats(),
    fetchMiningDutchStats(),
    fetch2MinersStats(),
    fetchK1PoolStats(),
    fetchKryptexStats(),
  ]);

  const allCoinStats = [];
  let grandTotalMiners = 0;

  const processResult = (result, name) => {
    if (result.status === "fulfilled" && result.value?.success) {
      allCoinStats.push(...(result.value.coinStats || []));
      grandTotalMiners += result.value.miners || 0;
    }
  };

  processResult(herominers, "HeroMiners");
  processResult(dutch, "MiningDutch");
  processResult(twoMiners, "2Miners");
  processResult(k1pool, "K1Pool");
  processResult(kryptex, "Kryptex");

  return {
    success: true,
    coinStats: allCoinStats,
    miners: grandTotalMiners,
    fetchedAt: new Date().toISOString(),
    providers: {
      herominers: herominers.status === "fulfilled",
      miningdutch: dutch.status === "fulfilled",
      "2miners": twoMiners.status === "fulfilled",
      k1pool: k1pool.status === "fulfilled",
      kryptex: kryptex.status === "fulfilled",
    },
  };
}

// Re-export existing providers from miningOpportunityNotifier
import { scrapeHeroMinersGlobal, scrapeMiningDutchGlobal } from "./miningOpportunityNotifier.js";

async function fetchHeroMinersStats() {
  return scrapeHeroMinersGlobal(true);
}

async function fetchMiningDutchStats() {
  return scrapeMiningDutchGlobal(true);
}
