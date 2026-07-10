// server/miners/k1pool.js - K1Pool API proxy
import { COMMON_HEADERS, CONFIG } from "../config.js";

const CACHE = new Map();
const CACHE_TTL = 30000;

export async function getK1PoolMinerStats(pool, address) {
  const cacheKey = `k1pool:${pool}:${address}`;
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  if (!pool || !address) {
    throw new Error("pool and address are required");
  }

  try {
    const url = `https://k1pool.com/api/miner/${pool}/${encodeURIComponent(address)}`;
    const response = await fetch(url, {
      headers: COMMON_HEADERS,
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`K1Pool API returned HTTP ${response.status}`);
    }

    const data = await response.json();
    const result = { success: true, data, pool, address, fetchedAt: new Date().toISOString() };
    CACHE.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  } catch (err) {
    console.error(`[K1Pool] Fetch failed for ${pool}/${address}:`, err.message);
    throw err;
  }
}

/**
 * Get K1Pool global pool data
 */
export async function getK1PoolGlobal() {
  const cacheKey = "k1pool_global";
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL * 2) {
    return cached.data;
  }

  try {
    const url = "https://k1pool.com/api/pools";
    const response = await fetch(url, {
      headers: COMMON_HEADERS,
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    
    // Transform pools into coinStats format
    const pools = data?.pools || [];
    const coinStats = pools.map(p => ({
      algorithm: p.algorithm || "Unknown",
      coin: p.symbol || "Unknown",
      name: p.name || "",
      miners: 0,
      poolHashrate: p.networkHashrate || "0",
      poolMiners: p.poolMiners || 0,
      priceUSD: p.priceUSD || 0,
      priceBTC: p.priceBTC || 0,
      difficulty: p.difficulty || 0,
      reward: p.reward || 0,
    }));

    const result = { 
      success: true, 
      coinStats, 
      pools: data?.data || {}, 
      fetchedAt: new Date().toISOString() 
    };
    CACHE.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  } catch (err) {
    console.error("[K1Pool] Global fetch failed:", err.message);
    throw err;
  }
}
