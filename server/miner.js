import { mrrApiCall } from './mrr.js';
import { getNiceHashApp, resolveNhClient } from './nh.js';
import { getAlgorithmDisplayName, normalizeAlgoForNiceHash, getMrrAlgoKey } from '../src/core/mapping.js';

// ============================================================
// CONFIGURATION — Read wallets from environment variables
// ============================================================
const COIN_DECIMALS = {
  ETC: 1e18,
  ETHW: 1e18,
  RVN: 1e8,
  KAS: 1e8,
  QUAI: 1e8,
  QRL: 1e8,
};

const MINER_COIN_ALGOS = {
  ETC: 'ETCHASH',
  ETHW: 'ETCHASH',
  RVN: 'KAWPOW',
  KAS: 'KHEAVYHASH',
  QUAI: 'PROGPOWZ',
  QRL: 'RANDOMXMONERO',
};

function parseMinerAddressEnv(name) {
  const raw = process.env[name];
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        coin: String(item?.coin || '').trim().toUpperCase(),
        address: String(item?.address || '').trim(),
        algo: String(item?.algo || '').trim() || undefined,
      }))
      .filter((item) => item.coin && item.address);
  } catch (err) {
    console.warn(`[miner:config] Invalid ${name}: ${err.message}`);
    return [];
  }
}

const FALLBACK_HARDCODED_ACCOUNTS = [
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

function buildMinerAccounts() {
  const envAccounts = [
    ...parseMinerAddressEnv('HEROMINERS_ADDRESSES').map((a) => ({ ...a, pool: 'HeroMiners' })),
    ...parseMinerAddressEnv('2MINERS_ADDRESSES').map((a) => ({ ...a, pool: '2Miners' })),
    ...parseMinerAddressEnv('K1POOL_ADDRESSES').map((a) => ({ ...a, pool: 'K1Pool' })),
    ...parseMinerAddressEnv('KRYPTEX_ADDRESSES').map((a) => ({ ...a, pool: 'Kryptex' })),
  ];
  return envAccounts.length > 0 ? envAccounts : FALLBACK_HARDCODED_ACCOUNTS;
}

const MINER_ACCOUNTS = buildMinerAccounts();

// ============================================================
// URL BUILDERS
// ============================================================

function getPoolEndpoint(poolName, coin, address, algo) {
  const lowerPool = String(poolName || '').toLowerCase();
  const lowerCoin = String(coin || '').toLowerCase();

  if (lowerPool.includes('herominers')) {
    return { type: 'api', url: `https://${lowerCoin}.herominers.com/api/stats_address?address=${address}` };
  }

  if (lowerPool.includes('2miners')) {
    // 2Miners API: /api/accounts/{walletid} (per official OpenAPI docs)
    // Solo pools use solo-{coin}.2miners.com subdomain
    const domain = lowerPool.includes('solo') ? `solo-${lowerCoin}.2miners.com` : `${lowerCoin}.2miners.com`;
    return { type: 'api', url: `https://${domain}/api/accounts/${address}` };
  }

  if (lowerPool.includes('k1pool')) {
    // K1Pool uses Cloudflare-protected API. Try the main API gateway format.
    const coinParam = algo || coin;
    return {
      type: 'api',
      multiple: true,
      urls: [
        `https://k1pool.com/api/k1/miner/${address}/stats?coin=${String(coinParam).toLowerCase()}`,
        `https://k1pool.com/api/k1/stats/address?address=${address}&coin=${String(coinParam).toLowerCase()}`,
      ],
    };
  }

  if (lowerPool.includes('kryptex')) {
    // Kryptex API — try new format from api.kryptex.com
    return {
      type: 'api',
      multiple: true,
      urls: [
        `https://api.kryptex.com/v1/miner/stats?address=${address}&coin=${lowerCoin}`,
        `https://pool.kryptex.com/api/v2/miner/stats/${address}?coin=${lowerCoin}`,
      ],
    };
  }

  return { type: 'unknown', url: null };
}

// ============================================================
// DATA FETCHER
// ============================================================

async function fetchApiData(url) {
  console.log(`[miner:fetch] GET ${url}`);
  const response = await fetch(url, {
    headers: { 'User-Agent': 'BenTre-Miner-Monitor/1.0' },
    family: 4,
  }).catch((err) => {
    console.error(`[miner:network-error] ${url}`, err);
    throw new Error(`Network error: ${err.message}`);
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`API ${response.status} — ${response.statusText}${text ? ': ' + text.slice(0, 120) : ''}`);
  }
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    const snippet = text.length > 150 ? text.slice(0, 150) + '...' : text;
    throw new Error(`Invalid JSON: ${snippet}`);
  }
}

// ============================================================
// MARKET DATA
// ============================================================

async function fetchMarketData(coin, algo) {
  const rawAlgo = algo || MINER_COIN_ALGOS[coin] || coin;
  const nhAlgo = normalizeAlgoForNiceHash(rawAlgo);
  const market = {
    algorithm: nhAlgo,
    label: getAlgorithmDisplayName(nhAlgo),
    unit: coin,
    nicehash: null,
    mrr: null,
    cheapest: null,
  };

  // Fetch NiceHash market price via order book (the /order/calculate endpoint requires
  // authentication and may fail for certain algo/amount combos; the order book is public).
  try {
    const { client: nhClient } = resolveNhClient('BT');
    if (nhClient) {
      const nhApp = getNiceHashApp(nhClient);
      // Use getOrderBook which returns buy/sell orders; take the highest buy price.
      const orderBook = await nhApp.hashpower.getOrderBook({ algorithm: nhAlgo, market: 'USA' });
      const buyOrders = Array.isArray(orderBook?.buy) ? orderBook.buy : [];
      const prices = buyOrders
        .map((order) => parseFloat(order?.price ?? order?.fixedPrice ?? order?.rate ?? 0))
        .filter((p) => Number.isFinite(p) && p > 0);
      const price = prices.length > 0 ? Math.max(...prices) : 0;
      market.nicehash = { price: price > 0 ? price : null };
      if (!price) market.nicehash.error = 'No buy orders in order book';
    } else {
      market.nicehash = { price: null, error: 'NiceHash client not configured' };
    }
  } catch (err) {
    // Try fallback: order/calculate (works for some algos with a public client)
    try {
      const { client: nhClient } = resolveNhClient('BT');
      if (nhClient) {
        const nhApp = getNiceHashApp(nhClient);
        const nhResp = await nhApp.hashpower.getOrderPrice({ algorithm: nhAlgo, amount: '0.01', limit: '0.01' });
        const price = parseFloat(nhResp?.price ?? nhResp?.data?.price ?? 0);
        market.nicehash = { price: price > 0 ? price : null, note: 'from order/calculate' };
        if (!price) market.nicehash.error = 'No price returned';
      }
    } catch (fallbackErr) {
      market.nicehash = { price: null, error: err.message };
    }
  }

  try {
    const mrrAlgo = getMrrAlgoKey(nhAlgo);
    const { data: mrrResp } = await mrrApiCall({
      endpoint: `/info/algos/${mrrAlgo}`,
      clientNameRaw: 'BT',
      method: 'GET',
    });
    const payload = mrrResp?.data?.data || mrrResp?.data || mrrResp;
    // Try multiple response shapes
    let price = 0;
    if (payload?.suggested_price?.amount) {
      price = parseFloat(payload.suggested_price.amount);
    } else if (payload?.stats?.prices?.lowest?.amount) {
      price = parseFloat(payload.stats.prices.lowest.amount);
    } else if (payload?.price) {
      price = parseFloat(payload.price);
    }
    market.mrr = { price: price > 0 ? price : null, error: mrrResp?.error || null };
  } catch (err) {
    market.mrr = { price: null, error: err.message };
  }

  const prices = [
    { source: 'NiceHash', price: market.nicehash?.price },
    { source: 'MRR', price: market.mrr?.price },
  ].filter((p) => p.price !== null && p.price > 0);

  if (prices.length > 0) {
    market.cheapest = prices.reduce((a, b) => (a.price < b.price ? a : b));
    const spread = prices.length === 2
      ? ((Math.max(prices[0].price, prices[1].price) - Math.min(prices[0].price, prices[1].price)) /
          Math.min(prices[0].price, prices[1].price)) *
        100
      : null;
    if (spread !== null) {
      market.profitable = `${market.cheapest.source} is cheaper by ${spread.toFixed(2)}%`;
    }
  } else {
    market.error = 'No market prices available';
  }

  return market;
}

// ============================================================
// NORMALIZERS
// ============================================================

function normalizeHeroMiners(data, coin) {
  const decimals = COIN_DECIMALS[coin] || 1;
  return {
    balance: (data.stats?.balance || 0) / decimals,
    paid: (data.stats?.paid || 0) / decimals,
    immature: (data.stats?.immature || 0) / decimals,
    currentHashrate: data.currentHashrate || data.hashrate || 0,
    averageHashrate: data.avgHashrate || 0,
    workers: Array.isArray(data.workers) ? data.workers : [],
  };
}

function normalize2Miners(data, coin) {
  // 2Miners returns balance already in the main coin unit (ETH, not Wei)
  const balance = Number(data.stats?.balance ?? data.balance ?? 0);
  return {
    balance,
    paid: Number(data.paid ?? 0),
    immature: 0,
    currentHashrate: Number(data.currentHashrate ?? data.hashrate ?? 0),
    averageHashrate: Number(data.hashrate ?? 0),
    workers: Array.isArray(data.workers)
      ? data.workers.map((w) => ({
          name: w.name || w.worker || 'Unknown',
          hashrate: Number(w.hr || w.hashrate || 0),
          online: w.online !== false,
        }))
      : data.workers && typeof data.workers === 'object'
        ? Object.entries(data.workers).map(([name, w]) => ({
            name,
            hashrate: Number(w.hr || w.hashrate || 0),
            online: w.online !== false,
          }))
        : [],
  };
}

function normalizeK1Pool(data, coin) {
  // K1Pool returns values in main units (not smallest units)
  return {
    balance: Number(data.unpaid ?? data.balance ?? 0),
    paid: Number(data.paid ?? 0),
    immature: 0,
    currentHashrate: Number(data.hashrate ?? 0),
    averageHashrate: Number(data.hashrate_24h ?? 0),
    workers: Array.isArray(data.workers) ? data.workers : [],
  };
}

function normalizeKryptex(data, coin) {
  // Kryptex returns values in main units
  const stats = data?.data || data;
  return {
    balance: Number(stats.unpaid ?? data.unpaid ?? 0),
    paid: Number(stats.total_paid ?? data.total_paid ?? 0),
    immature: 0,
    currentHashrate: Number(stats.hashrate_24h ?? data.hashrate_24h ?? 0),
    averageHashrate: Number(stats.hashrate_24h ?? data.hashrate_24h ?? 0),
    workers: Array.isArray(stats.workers || data.workers)
      ? (stats.workers || data.workers).map((w) => ({
          name: w.name || w.worker || 'Unknown',
          hashrate: Number(w.hr || w.hashrate || 0),
          online: w.online !== false,
        }))
      : [],
  };
}

// ============================================================
// MAIN
// ============================================================

export async function getMinerAccounts(req, res) {
  if (MINER_ACCOUNTS.length === 0) {
    return res.status(200).json({
      success: true,
      accounts: [],
      note: 'No miner addresses configured. Set HEROMINERS_ADDRESSES, 2MINERS_ADDRESSES, K1POOL_ADDRESSES, and/or KRYPTEX_ADDRESSES env vars.',
    });
  }

  const fetchPromises = MINER_ACCOUNTS.map(async (account) => {
    const { pool, coin, address, algo } = account;
    const endpoint = getPoolEndpoint(pool, coin, address, algo);

    if (endpoint.type === 'unknown') {
      return {
        ...account,
        success: false,
        fetchedAt: new Date().toISOString(),
        sourceUrl: null,
        error: `Pool "${pool}" is not supported.`,
      };
    }

    const urlsToTry = endpoint.multiple ? endpoint.urls : [endpoint.url];
    let data = null;
    let usedUrl = null;
    let lastError = null;

    for (const url of urlsToTry) {
      try {
        data = await fetchApiData(url);
        usedUrl = url;
        break;
      } catch (err) {
        lastError = err;
        console.warn(`[miner:retry] ${url}: ${err.message}`);
      }
    }

    const baseResponse = {
      ...account,
      success: false,
      fetchedAt: new Date().toISOString(),
      sourceUrl: usedUrl || endpoint.url,
    };

    if (!data) {
      return { ...baseResponse, error: lastError?.message || 'All API endpoints failed' };
    }

    try {

      let normalizedData;
      if (pool.includes('HeroMiners')) {
        normalizedData = normalizeHeroMiners(data, coin);
      } else if (pool.includes('2Miners')) {
        normalizedData = normalize2Miners(data, coin);
      } else if (pool.includes('K1Pool')) {
        normalizedData = normalizeK1Pool(data, coin);
      } else if (pool.includes('Kryptex')) {
        normalizedData = normalizeKryptex(data, coin);
      } else {
        normalizedData = {
          balance: Number(data.balance ?? 0),
          paid: Number(data.paid ?? 0),
          immature: 0,
          currentHashrate: Number(data.currentHashrate ?? data.hashrate ?? 0),
          averageHashrate: Number(data.avgHashrate ?? data.hashrate ?? 0),
          workers: Array.isArray(data.workers) ? data.workers : [],
        };
      }

      const finalData = {
        ...baseResponse,
        success: true,
        ...normalizedData,
      };

      try {
        finalData.market = await fetchMarketData(coin, algo);
      } catch (mktErr) {
        console.warn(`[miner:market] ${coin}: ${mktErr.message}`);
        finalData.market = { error: mktErr.message };
      }

      return finalData;
    } catch (error) {
      console.error(`[miner:error] ${pool} ${coin}: ${error.message}`);
      return { ...baseResponse, error: error.message };
    }
  });

  try {
    const accounts = await Promise.all(fetchPromises);
    res.status(200).json({ success: true, accounts });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Unexpected error fetching miner accounts.' });
  }
}
