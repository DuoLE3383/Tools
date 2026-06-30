// src/utils/miningStatsFetcher.js - SPEED OPTIMIZED

const MAX_ATTEMPTS = 3;           // Reduced from 5
const REQUEST_TIMEOUT = 10000;    // Reduced from 20000
const BASE_DELAY = 500;
const CACHE_TTL = 20000; // Increased to 20 seconds

const pendingRequestsMap = new Map();
const requestCache = new Map();

let sharedSocket = null;
const wsPendingRequests = new Map();

function getRequestKey(type, client, rigId, coin, force) {
  return `${type}:${client}:${rigId || ''}:${coin || ''}:${force ? 'force' : 'normal'}`;
}

function normalizeMiningStatsResponse(data, type) {
  if (!data) {
    return { success: true, coinStats: [], miners: 0, fetchedAt: new Date().toISOString() };
  }

  if (data.coinStats && Array.isArray(data.coinStats)) {
    return { ...data, coinStats: data.coinStats, miners: data.miners || 0, success: data.success !== false };
  }

  if (data.herominers) {
    const heroData = data.herominers;
    return {
      ...data,
      coinStats: Array.isArray(heroData.coinStats) ? heroData.coinStats : [],
      miners: heroData.miners || 0,
      fetchedAt: heroData.fetchedAt || data.fetchedAt || new Date().toISOString(),
      success: data.success !== false,
    };
  }

  if (data.miningdutch) {
    const dutchData = data.miningdutch;
    return {
      ...data,
      coinStats: Array.isArray(dutchData.coinStats) ? dutchData.coinStats : [],
      miners: dutchData.miners || 0,
      fetchedAt: dutchData.fetchedAt || data.fetchedAt || new Date().toISOString(),
      success: data.success !== false,
    };
  }

  if (Array.isArray(data)) {
    return {
      success: true,
      coinStats: data,
      miners: data.reduce((sum, row) => sum + (row.miners || 0), 0),
      fetchedAt: new Date().toISOString(),
    };
  }

  return { ...data, coinStats: [], miners: 0, success: data.success !== false };
}

export async function fetchMiningStats(
  type,
  client,
  rigId = null,
  coin = null,
  customTimeout = REQUEST_TIMEOUT,
  force = false,
) {
  const requestKey = getRequestKey(type, client, rigId, coin, force);
  
  if (!force) {
    const cached = requestCache.get(requestKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
  }
  
  if (pendingRequestsMap.has(requestKey)) {
    return pendingRequestsMap.get(requestKey);
  }
  
  const promise = fetchMiningStatsInternal(type, client, rigId, coin, customTimeout, force)
    .then((result) => {
      requestCache.set(requestKey, { data: result, timestamp: Date.now() });
      return result;
    })
    .finally(() => {
      pendingRequestsMap.delete(requestKey);
    });
  
  pendingRequestsMap.set(requestKey, promise);
  return promise;
}

async function fetchMiningStatsInternal(
  type,
  client,
  rigId = null,
  coin = null,
  customTimeout = REQUEST_TIMEOUT,
  force = false,
) {
  const restPathMap = {
    herominers: "herominers/global",
    miningDutch: "miningdutch", // Corrected to match route definition
    herominers_address: "herominers/address", // This is the correct endpoint for address lookups
    all: "all",
  };

  const path = restPathMap[type] || type;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      if (i > 0) {
        await new Promise((r) => setTimeout(r, BASE_DELAY * Math.pow(2, i)));
      }
      let url = `/api/v2/mining-stats/${path}`;
      const queryParams = new URLSearchParams();
      if (force) queryParams.set("force", "true");
      if (type === 'herominers_address') {
        if (rigId) queryParams.set('address', rigId); // coin is no longer needed
      }
      if (queryParams.toString()) url += `?${queryParams.toString()}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(customTimeout) });
      
      if (!res.ok) {
        if (res.status === 404) break;
        throw new Error(`HTTP ${res.status}`);
      }
      
      const data = await res.json();
      const normalized = normalizeMiningStatsResponse(data, type);
      
      if (normalized.success !== false) {
        return normalized;
      }
      
      throw new Error(data?.error || "REST API returned no data");
    } catch (err) {
      if (err.name === "AbortError") {
        throw new Error(`Failed to fetch ${type}. Last error: Request timeout`);
      }
      // If all retries fail, throw the last known error.
      if (i === MAX_ATTEMPTS - 1) throw err;
    }
  }
  throw new Error(`Failed to fetch ${type} after ${MAX_ATTEMPTS} attempts.`);
}

async function fetchMiningStatsViaWS(type, client, rigId, coin, customTimeout, force) {
  // ... WebSocket implementation (same as before but with reduced timeouts)
  // Keeping this concise - the main optimization is in the REST path
  return new Promise((resolve, reject) => {
    reject(new Error('WebSocket fallback not implemented'));
  });
}