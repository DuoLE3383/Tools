// server/price-fetcher.js
import { db } from '../db.js';
import { dbAllAsync, dbRunAsync } from '../mrr/db-utils.js';
import { createApiClient } from '../api-client.js';
import { getPriceSources } from '../price-sources.js';

/**
 * Custom error class for handling API rate limit responses (HTTP 429).
 */
class RateLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RateLimitError';
  }
}

// Configuration
const PRICE_FETCH_CONFIG = {
  COINGECKO: {
    BASE_URL: 'https://api.coingecko.com/api/v3', // Free API endpoint
    RATE_LIMIT: 30, // Free tier: 30 calls per minute
    CHUNK_SIZE: 100, // Max coins per request (free tier allows up to 100)
    RETRY_DELAY: 5000,
    MAX_RETRIES: 3,
  },
  COINDESK: {
    BASE_URL: 'https://api.coindesk.com/v1',
    RATE_LIMIT: 30,
    RETRY_DELAY: 3000,
    MAX_RETRIES: 2,
  },
  CMC: {
    BASE_URL: 'https://pro-api.coinmarketcap.com/v1',
    RATE_LIMIT: 333,
    CHUNK_SIZE: 100,
    RETRY_DELAY: 10000,
    MAX_RETRIES: 2,
  },
  BLOCKCHAIN: {
    BASE_URL: 'https://www.blockchain.com/explorer/api',
    RATE_LIMIT: 10,
    CHUNK_SIZE: 100,
    RETRY_DELAY: 5000,
    MAX_RETRIES: 2,
  },
  CRYPTOCOM: {
    BASE_URL: 'https://api.crypto.com/v2',
    RATE_LIMIT: 20,
    CHUNK_SIZE: 50,
    RETRY_DELAY: 3000,
    MAX_RETRIES: 2,
  },
  BINANCE: {
    BASE_URL: 'https://api.binance.com/api/v3',
    RATE_LIMIT: 1200,
  },
  KRAKEN: {
    BASE_URL: 'https://api.kraken.com/0/public',
    RATE_LIMIT: 20,
  },
};

// Smart coin ID mapping for CoinGecko
const COINGECKO_ID_MAP = {
  'btc': 'bitcoin',
  'eth': 'ethereum',
  'usdt': 'tether',
  'bnb': 'binancecoin',
  'usdc': 'usd-coin',
  'xrp': 'ripple',
  'sol': 'solana',
  'ada': 'cardano',
  'doge': 'dogecoin',
  'trx': 'tron',
  'dot': 'polkadot',
  'link': 'chainlink',
  'xlm': 'stellar',
  'avax': 'avalanche-2',
  'shib': 'shiba-inu',
  'matic': 'matic-network',
  'uni': 'uniswap',
  'ltc': 'litecoin',
  'bch': 'bitcoin-cash',
  'xmr': 'monero',
  'etc': 'ethereum-classic',
  'algo': 'algorand',
  'atom': 'cosmos',
  'vet': 'vechain',
  'fil': 'filecoin',
  'aave': 'aave',
  'near': 'near',
  'apt': 'aptos',
  'arb': 'arbitrum',
  'op': 'optimism',
};

// Reverse map for symbol -> CoinGecko ID
const SYMBOL_TO_COINGECKO = {};
Object.entries(COINGECKO_ID_MAP).forEach(([symbol, id]) => {
  SYMBOL_TO_COINGECKO[symbol.toUpperCase()] = id;
});

// Make idToSymbolMap accessible globally
let idToSymbolMap = new Map();

/**
 * Initializes the database and maps for coin fetching.
 */
async function initializeFetcher() {
  await dbRunAsync(db, `
    CREATE TABLE IF NOT EXISTS coingecko_coins (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      name TEXT NOT NULL,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const coingeckoCoins = await dbAllAsync(db, 'SELECT DISTINCT id, symbol FROM coingecko_coins WHERE id IS NOT NULL');
  idToSymbolMap = new Map(coingeckoCoins.map(c => [c.id.toLowerCase(), c.symbol.toUpperCase()]));
}

/**
 * Gets the master list of coin IDs to fetch prices for.
 * Prioritizes a fresh list from CoinGecko, but falls back to the DB cache.
 */
async function getTargetCoinList() {
  try {
    const apiClient = createApiClient(PRICE_FETCH_CONFIG);
    const priceSources = getPriceSources(apiClient, idToSymbolMap);

    console.log('[PriceFetcher] 🌐 Attempting to get latest coin list from CoinGecko...');
    const allCoins = await priceSources.coingecko.fetch();
    if (allCoins.length > 0) {
      console.log(`[PriceFetcher] ✅ Got ${allCoins.length} coins from CoinGecko.`);
      // Update our reference table for coingecko IDs and symbols
      await dbRunAsync(db, 'BEGIN TRANSACTION');
      const stmt = db.prepare('INSERT OR REPLACE INTO coingecko_coins (id, symbol, name, last_updated) VALUES (?, ?, ?, ?)');
      for (const coin of allCoins) {
        await new Promise((resolve, reject) => {
          stmt.run(coin.id, coin.symbol, coin.name, new Date().toISOString(), (err) => err ? reject(err) : resolve());
        });
      }
      await new Promise((resolve, reject) => stmt.finalize(err => err ? reject(err) : resolve()));
      await dbRunAsync(db, 'COMMIT');

      // Re-initialize the map with the latest data
      await initializeFetcher();
      return allCoins.map(c => ({ id: c.id, symbol: c.symbol, name: c.name }));
    }
    console.warn('[PriceFetcher] ⚠️ CoinGecko returned 0 coins. Falling back to DB cache.');
  } catch (error) {
    console.warn(`[PriceFetcher] ⚠️ CoinGecko list fetch failed: ${error.message}. Falling back to DB cache.`);
  }

  // Fallback to database cache
  const cachedCoins = await dbAllAsync(db, 'SELECT id, symbol, name FROM coingecko_coins');
  console.log(`[PriceFetcher] ℹ️ Using ${cachedCoins.length} coins from database cache.`);
  return cachedCoins.map(c => ({ ...c, source: 'cached' }));
}

/**
 * Merges new coin data into the existing results, filling gaps.
 */
function mergeResults(masterList, newResults, sourceName) {
  let updatedCount = 0;
  newResults.forEach(newCoin => {
    const existing = masterList.get(newCoin.id);
    if (existing && existing.price_usd === 0 && newCoin.price_usd > 0) {
      masterList.set(newCoin.id, { ...newCoin, source: sourceName });
      updatedCount++;
    }
  });
  return updatedCount;
}

/**
 * Fetches prices from a prioritized list of sources and stores them.
 */
async function fetchAndSyncPrices() {
  const targetCoinList = await getTargetCoinList();
  if (targetCoinList.length === 0) {
    throw new Error('Could not retrieve any coins to process, neither from API nor cache.');
  }

  const apiClient = createApiClient(PRICE_FETCH_CONFIG);
  const priceSources = getPriceSources(apiClient, idToSymbolMap);
  const failedSources = [];
  const sourceStats = {};

  // Master list to hold the results. Initialize with all target coins having a price of 0.
  const masterResults = new Map(targetCoinList.map(c => [c.id, { ...c, price_usd: 0 }]));

  // Define the provider chain
  const providerChain = [
    // CoinGecko is now handled by getTargetCoinList, so we start with CMC as the first fallback.
    { name: 'cmc', fetcher: priceSources.cmc.fetch, enabled: !!process.env.CMC_API },
    { name: 'coindesk', fetcher: priceSources.coindesk.fetch, enabled: true },
    { name: 'blockchain', fetcher: priceSources.blockchain.fetch, enabled: true },
  ];
  
  // Directly use the results from getTargetCoinList for CoinGecko prices.
  const coingeckoUpdatedCount = mergeResults(masterResults, targetCoinList, 'coingecko');
  sourceStats.coingecko = { fetched: targetCoinList.length, updated: coingeckoUpdatedCount, duration: 'N/A (initial list)' };
  console.log(`[PriceFetcher] ✅ COINGECKO: Initial list provided ${targetCoinList.length} coins, updated ${coingeckoUpdatedCount} prices.`);

  for (const provider of providerChain) {
    if (!provider.enabled) continue;

    // Find which coins still need a price
    const missingCoinIds = Array.from(masterResults.values())
      .filter(c => c.price_usd === 0)
      .map(c => c.id);

    if (missingCoinIds.length === 0) {
      console.log(`[PriceFetcher] ✅ All coin prices found. Halting provider chain.`);
      break;
    }

    try {
      console.log(`[PriceFetcher] 🌐 Querying ${provider.name.toUpperCase()} for ${missingCoinIds.length} missing coins...`);
      const startTime = Date.now();
      const newCoins = await provider.fetcher(missingCoinIds);
        
      const duration = Date.now() - startTime;

      if (newCoins.length > 0) {
        const updatedCount = mergeResults(masterResults, newCoins, provider.name);
        sourceStats[provider.name] = { fetched: newCoins.length, updated: updatedCount, duration: `${duration}ms` };
        console.log(`[PriceFetcher] ✅ ${provider.name.toUpperCase()}: Fetched ${newCoins.length}, updated ${updatedCount} prices in ${duration}ms.`);
      }
    } catch (error) {
      if (error.name === 'RateLimitError') {
        console.warn(`[PriceFetcher] ⚠️ ${provider.name} is rate-limited. Switching to next source.`);
      } else {
        console.warn(`[PriceFetcher] ⚠️ ${provider.name} failed: ${error.message}`);
      }
      failedSources.push(provider.name);
    }
  }

  return { allFetchedCoins: Array.from(masterResults.values()), failedSources, sourceStats };
}

/**
 * Stores the final list of fetched coins into the database.
 */
async function storePricesInDB(coins) {
  if (coins.length === 0) {
    throw new Error('All price sources failed. No data retrieved to store.');
  }

  const btcCoin = coins.find(c => c.symbol === 'BTC' || c.id === 'bitcoin');
  const btcPriceUsd = btcCoin?.price_usd || 0;

  if (btcPriceUsd === 0) {
    console.warn('[PriceFetcher] ⚠️ BTC price is 0, cannot calculate price_btc for other coins.');
  }

  const capturedAt = new Date().toISOString();
  await dbRunAsync(db, 'BEGIN TRANSACTION');
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO coin_prices 
      (coin_id, coin_name, symbol, price_usd, price_btc, market_cap, volume_24h, 
       price_change_24h, price_change_7d, price_change_30d, last_updated, captured_at, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);

    for (const coin of coins) {
      const priceUsd = coin.price_usd || 0;
      const priceBtc = btcPriceUsd > 0 ? priceUsd / btcPriceUsd : 0;
      await new Promise((resolve, reject) => {
        stmt.run(
          coin.id, coin.name || coin.symbol, coin.symbol.toUpperCase(),
          priceUsd, priceBtc, coin.market_cap || 0, coin.volume_24h || 0,
          coin.price_change_24h || 0, coin.price_change_7d || 0, coin.price_change_30d || 0,
          coin.last_updated || capturedAt, capturedAt, coin.source || 'unknown',
          (err) => err ? reject(err) : resolve()
        );
      });
    }

    await new Promise((resolve, reject) => stmt.finalize(err => err ? reject(err) : resolve()));
    await dbRunAsync(db, 'COMMIT');

    console.log(`[PriceFetcher] ✅ Successfully synced ${coins.length} coins to coin_prices table.`);
    console.log(`[PriceFetcher] 💰 BTC Price: $${btcPriceUsd.toFixed(2)}`);
  } catch (dbError) {
    console.error('[PriceFetcher] Database transaction failed. Rolling back.', dbError.message);
    await dbRunAsync(db, 'ROLLBACK');
    throw dbError;
  }
}
/**
 * Ensures the coin_prices table has all necessary columns.
 */
async function migrateCoinPricesTable() {
  try {
    const columns = await dbAllAsync(db, `PRAGMA table_info(coin_prices)`);
    const columnNames = columns.map(c => c.name);

    if (!columnNames.includes('price_change_7d')) {
      console.log('[DB Migration] Adding price_change_7d to coin_prices...');
      await dbRunAsync(db, `ALTER TABLE coin_prices ADD COLUMN price_change_7d REAL DEFAULT 0`);
    }
    if (!columnNames.includes('price_change_30d')) {
      console.log('[DB Migration] Adding price_change_30d to coin_prices...');
      await dbRunAsync(db, `ALTER TABLE coin_prices ADD COLUMN price_change_30d REAL DEFAULT 0`);
    }
    if (!columnNames.includes('coin_id')) {
      // This seems to be the primary key, but an explicit index is good.
      await dbRunAsync(db, `CREATE INDEX IF NOT EXISTS idx_coin_prices_coin_id ON coin_prices(coin_id)`);
    }
    const indexes = await dbAllAsync(db, `PRAGMA index_list(coin_prices)`);
    if (!indexes.some(idx => idx.name === 'idx_coin_prices_symbol')) {
      await dbRunAsync(db, `CREATE INDEX IF NOT EXISTS idx_coin_prices_symbol ON coin_prices(symbol)`);
    }
  } catch (error) {
    console.error(`[DB Migration] Failed to migrate coin_prices table: ${error.message}`);
  }
}

// Main fetching function
export async function fetchAndStoreCoinPrices() {
  console.log('[PriceFetcher] Starting coin price update job...');
  try {
    await initializeFetcher();
    const { allFetchedCoins, failedSources, sourceStats } = await fetchAndSyncPrices();
    await migrateCoinPricesTable();
    
    console.log(`[PriceFetcher] 📊 Total unique coins with data: ${allFetchedCoins.length}`);
    console.log(`[PriceFetcher] 📊 Source stats:`, sourceStats);
    if (failedSources.length > 0) {
      console.log(`[PriceFetcher] 📊 Failed sources: ${failedSources.join(', ')}`);
    }

    await storePricesInDB(allFetchedCoins);

  } catch (error) {
    console.error('[PriceFetcher] ❌ Critical error during price update:', error.message);
    // Optional: Send alert for critical failures
  }
}

// Exponential backoff for the entire job
export function startPriceFetcherJob(intervalMinutes = 15) {
  const intervalMs = intervalMinutes * 60 * 1000;
  console.log(`[PriceFetcher] Scheduling coin price updates every ${intervalMinutes} minutes.`);
  
  let consecutiveFailures = 0;
  let currentInterval = intervalMs;
  
  async function runWithBackoff() {
    try {
      await fetchAndStoreCoinPrices();
      consecutiveFailures = 0;
      currentInterval = intervalMs;
    } catch (error) {
      consecutiveFailures++;
      
      const backoffFactor = Math.min(Math.pow(2, consecutiveFailures - 1), 8);
      currentInterval = Math.min(intervalMs * backoffFactor, intervalMs * 8);
      
      console.log(`[PriceFetcher] Backing off. Next run in ${currentInterval / 60000} minutes`);
    }
    
    setTimeout(runWithBackoff, currentInterval);
  }
  
  setTimeout(runWithBackoff, 5000);
}

// Manual trigger endpoint support
export async function triggerPriceUpdate(req, res) {
  try {
    await fetchAndStoreCoinPrices();
    res.json({ success: true, message: 'Price update triggered successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

// Export for testing
export { idToSymbolMap };