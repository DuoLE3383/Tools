import { mrrApiCall } from './mrr.js';
import { getNiceHashApp, resolveNhClient } from './nh.js';
import { getAlgorithmDisplayName } from '../src/core/mapping.js';

// ============================================================
// CONFIGURATION
// Define your wallets and the pools they are associated with.
// ============================================================
const MINER_ACCOUNTS = [
  // HeroMiners
  { pool: 'HeroMiners', coin: 'ETC', address: '0xc2006cfac0d250cbf060c8d78260ccc3ce91b652' },
  { pool: 'HeroMiners', coin: 'ETC', address: '0x58596ac12b44120f5a5c9138f22c455d116352a4' },
  { pool: 'HeroMiners', coin: 'RVN', address: 'RWo21Bf3sVp3wLzS3qB4BwGgXfXVZqZqZq' },
  { pool: 'HeroMiners', coin: 'KAS', address: 'kaspa:qrcel9v7z64v0z5e6z9z4z6z9z4z6z9z4z6z9z4z6z9z4z6z9z4z6z9z4z' },

  // 2Miners
  { pool: '2Miners ETHW Solo', coin: 'ETHW', address: '0xc2006cfac0d250cbf060c8d78260ccc3ce91b652' },

  // K1Pool
  { pool: 'K1Pool', coin: 'QUAI', algo: 'quaisha256', address: 'KrRTro6o6NCWE7nz8EMiAhao5QpwebBz2Sq' },

  // Kryptex
  { pool: 'Kryptex', coin: 'ETC', address: '0xc2006cfac0d250cbf060c8d78260ccc3ce91b652' },
];

const COIN_DECIMALS = {
  ETC: 1e18,
  ETHW: 1e18,
  RVN: 1e8,
  KAS: 1e8,
  QUAI: 1e8,
  // QRL has 9 decimals, but API seems to provide it scaled to 8.
  // We will assume 8 for now based on the observed issue.
  QRL: 1e8,
};


// ============================================================
// URL BUILDERS
// ============================================================

/**
 * Constructs the correct URL for a given pool, coin, and address.
 * Differentiates between API endpoints and web pages for scraping.
 */
function getPoolEndpoint(poolName, coin, address, algo) {
  const lowerPool = String(poolName || '').toLowerCase();
  const lowerCoin = String(coin || '').toLowerCase();

  // --- API Endpoints ---
  if (lowerPool.includes('herominers')) {
    return { type: 'api', url: `https://${lowerCoin}.herominers.com/api/stats_address?address=${address}` };
  }

  if (lowerPool.includes('k1pool')) {
    // The API requires the algorithm name (e.g., 'quaisha256') in the 'coin' parameter, not the coin symbol.
    return { type: 'api', url: `https://k1pool.com/api/k1stats_address?address=${address}&coin=${algo}` };
  }
  if (lowerPool.includes('kryptex')) {
    // The Kryptex API endpoint for miner stats is at pool.kryptex.com, not a coin-specific subdomain.
    return { type: 'api', url: `https://pool.kryptex.com/api/v2/miner/stats/${address}?coin=${lowerCoin}` };
  }
  if (lowerPool.includes('2miners')) {
    const domain = lowerPool.includes('solo') ? `solo-${lowerCoin}.2miners.com` : `${lowerCoin}.2miners.com`;
    return { type: 'api', url: `https://${domain}/api/accounts/${address}` };
  }

  return { type: 'unknown', url: null };
}

// ============================================================
// DATA FETCHERS & SCRAPERS
// ============================================================

/**
 * Fetches data from a JSON API endpoint.
 */
async function fetchApiData(url) {
  console.log(`[fetch] GET ${url}`);
  const response = await fetch(url, { headers: { 'User-Agent': 'BenTre-Miner-Monitor/1.0' } });
  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status} – ${response.statusText}`);
  }
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    // Throw a more descriptive error for debugging
    const errorDetail = text.length > 150 ? `${text.substring(0, 150)}...` : text;
    throw new Error(`Invalid JSON response from ${url}. Response: ${errorDetail}`);
  }
}

/**
 * Fetches a web page and scrapes the necessary data using regular expressions.
 * This is a fallback for pools without a public API.
 */
async function fetchAndScrapeData(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!response.ok) {
    throw new Error(`Failed to fetch web page with status ${response.status}`);
  }
  const html = await response.text();

  // Define scraping patterns for different pools
  const patterns = {
    // 2Miners embeds stats in a script tag as a JSON object
    '2miners.com': {
      balance: /"balance":(\d+)/,
      paid: /"paid":(\d+)/,
      hashrate: /"hashrate":(\d+)/,
      workers: /"workersTotal":(\d+)/,
    },
    // Kryptex also embeds stats in a script tag as a JSON object
    'kryptex.com': {
      balance: /"unpaid":([\d.]+)/,
      paid: /"total_paid":([\d.]+)/,
      hashrate: /"hashrate_24h":([\d.]+)/,
      workers: /"workers_online":(\d+)/,
    },
    'k1pool.com': {
      balance: /"unpaid":([\d.]+)/,
      paid: /"paid":([\d.]+)/,
      hashrate: /"hashrate":([\d.]+)/,
      workers: /"workers":(\d+)/,
    },
  };

  const domain = new URL(url).hostname;
  const sitePatterns = Object.entries(patterns).find(([key]) => domain.includes(key))?.[1];

  if (!sitePatterns) {
    throw new Error(`No scraping patterns defined for ${domain}`);
  }

  const extract = (regex) => {
    const match = html.match(regex);
    return match ? parseFloat(match[1]) : 0;
  };

  // For some pools, values are in smallest units and need adjustment
  const is2Miners = domain.includes('2miners.com');
  // Kryptex does not seem to require a divisor for its primary stats.
  // If it did for certain coins, we could add logic here.
  const divisor = is2Miners ? 1e9 : 1; // e.g., Gwei to ETH for ETHW

  return {
    stats: {
      balance: extract(sitePatterns.balance) / divisor,
      paid: extract(sitePatterns.paid) / divisor,
      hashrate: extract(sitePatterns.hashrate),
    },
    workers: [{ name: 'Total', hashrate: extract(sitePatterns.hashrate), online: true }],
    workersOnline: extract(sitePatterns.workers),
  };
}

/**
 * Fetches market price for a given coin/algorithm from NiceHash and MRR.
 */
async function fetchMarketData(coin, algo) {
  const algorithm = algo || coin; // Fallback to coin name if algo isn't specified
  const market = {
    algorithm: getAlgorithmDisplayName(algorithm),
    unit: coin,
    nicehash: null,
    mrr: null,
    cheapest: null,
    profitable: 'No market price available',
  };

  try {
    // NiceHash
    const { client: nhClient } = resolveNhClient('BT'); // Use a default client for public price info
    const nhApp = getNiceHashApp(nhClient);
    const nhPriceData = await nhApp.hashpower.getOrderPrice({ algorithm });
    market.nicehash = { price: parseFloat(nhPriceData?.price) || null, error: nhPriceData?.error || null };
  } catch (err) {
    market.nicehash = { price: null, error: err.message };
  }

  try {
    // MRR
    const { data: mrrData } = await mrrApiCall({ endpoint: `/market/algos/${algorithm}` });
    const price = mrrData?.data?.suggested_price?.amount || mrrData?.data?.price || null;
    market.mrr = { price: parseFloat(price) || null, error: mrrData?.error || null };
  } catch (err) {
    market.mrr = { price: null, error: err.message };
  }

  // Determine the cheapest provider
  const prices = [
    { source: 'NiceHash', price: market.nicehash?.price },
    { source: 'MRR', price: market.mrr?.price },
  ].filter(p => p.price !== null && p.price > 0);

  if (prices.length > 0) {
    market.cheapest = prices.reduce((a, b) => (a.price < b.price ? a : b));
  }

  return market;
}
// ============================================================
// DATA NORMALIZERS
// ============================================================

function normalizeHeroMiners(data, coin) {
  const decimals = COIN_DECIMALS[coin] || 1;
  return {
    balance: (data.stats?.balance || 0) / decimals,
    paid: (data.stats?.paid || 0) / decimals,
    immature: (data.stats?.immature || 0) / decimals,
    currentHashrate: data.hashrate || 0,
    averageHashrate: data.avgHashrate || 0,
    workers: data.workers || [],
  };
}

function normalize2Miners(data, coin) {
  // 2Miners API for ETHW returns values in Gwei (1e9), not Wei (1e18)
  // For other coins, it might be different. We default to the coin's standard decimals.
  const decimals = coin === 'ETHW' ? 1e9 : (COIN_DECIMALS[coin] || 1);
  return {
    balance: (data.stats?.balance || 0) / decimals,
    paid: (data.paid || 0) / decimals,
    immature: 0, // 2Miners API doesn't provide this directly
    currentHashrate: data.currentHashrate || 0,
    averageHashrate: data.hashrate || 0,
    workers: Object.values(data.workers || {}).map(w => ({ name: w.name, hashrate: w.hr, online: w.online })),
  };
}

function normalizeK1Pool(data, coin) {
  const decimals = COIN_DECIMALS[coin] || 1;
  return {
    balance: (data.unpaid || 0) / decimals,
    paid: (data.paid || 0) / decimals,
    immature: 0, // K1Pool API doesn't provide this
    currentHashrate: data.hashrate || 0,
    averageHashrate: data.hashrate_24h || 0,
    workers: data.workers || [],
  };
}

function normalizeKryptex(data, coin) {
  const decimals = COIN_DECIMALS[coin] || 1;
  return {
    balance: (data.balance || 0) / decimals,
    paid: (data.paid || 0) / decimals,
    immature: (data.immature || 0) / decimals,
    currentHashrate: data.hashrate || 0,
    averageHashrate: data.hashrate_24h || 0,
    workers: data.workers || [],
  };
}

// ============================================================
/**
 * Main function to get all miner accounts.
 * It iterates through the configured accounts, fetches data from the appropriate
 * source (API or scrape), and normalizes it for the frontend.
 */
export async function getMinerAccounts(req, res) {
  const fetchPromises = MINER_ACCOUNTS.map(async (account) => {
    const { pool, coin, address, algo } = account;
    const endpoint = getPoolEndpoint(pool, coin, address, algo);
    const baseResponse = {
      ...account,
      success: false,
      fetchedAt: new Date().toISOString(),
      sourceUrl: endpoint.url,
    };

    if (endpoint.type === 'unknown') {
      return { ...baseResponse, error: `Pool "${pool}" is not supported.` };
    }

    try {
      let data;
      if (endpoint.type === 'api') {
        data = await fetchApiData(endpoint.url);
      } else { // Scrape is now a fallback, but the logic is the same.
        data = await fetchAndScrapeData(endpoint.url);
      }

      // Select the correct normalizer based on the pool
      let normalizedData;
      if (pool.includes('HeroMiners')) normalizedData = normalizeHeroMiners(data, coin);
      else if (pool.includes('2Miners')) normalizedData = normalize2Miners(data, coin);
      else if (pool.includes('K1Pool')) normalizedData = normalizeK1Pool(data, coin);
      else if (pool.includes('Kryptex')) normalizedData = normalizeKryptex(data, coin);
      else normalizedData = { ...data }; // Fallback

      // Normalize the data structure
      const finalData = {
        ...baseResponse,
        success: true,
        ...normalizedData,
      };
      
      // Fetch and attach market data
      const marketData = await fetchMarketData(coin, algo);
      finalData.market = marketData;
      

      return finalData;

    } catch (error) {
      console.error(`[miner:error] Failed to fetch for ${pool} ${coin}: ${error.message}`);
      return { ...baseResponse, error: error.message };
    }
  });

  try {
    const accounts = await Promise.all(fetchPromises);
    res.status(200).json({ success: true, accounts });
  } catch (error) {
    res.status(500).json({ success: false, error: 'An unexpected error occurred while fetching miner accounts.' });
  }
}