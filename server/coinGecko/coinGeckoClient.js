// server/coinGecko/coinGeckoClient.js
// Main export file - re-export everything from the service
import { getDb } from '../db.js';
import { TRACKED_COINS } from './coinMapping.js';
import { CONFIG } from '../config.js';
import { 
  getCoinPrice,
  getPricesForCoins,
  getCoinMarketData,
  getTrendingCoins,
  clearCoinCache 
} from './coinGeckoService.js';

// Re-export them for other modules
export * from './coinGeckoService.js';

let lastPriceSave = 0;

// Module-level state for price fetch status and in-memory cache
let lastPriceFetchStatus = {
  success: null,
  timestamp: null,
  updated: 0,
  cached: false,
  error: null,
};
const priceCache = new Map();

export async function updateCoinMetadata(force = false) {
  const db = await getDb();
  // Check when it was last updated to avoid spamming CG API
  const lastUpdateRow = await db.get("SELECT value FROM settings WHERE key = 'coin_metadata_last_update'").catch(() => null);
  const lastUpdate = lastUpdateRow ? parseInt(lastUpdateRow.value, 10) : 0;

  if (!force && lastUpdate && (Date.now() - lastUpdate < 24 * 60 * 60 * 1000)) { // 24 hours
    console.log('[CoinGecko] Metadata update skipped, within 24h TTL.');
    return { success: true, cached: true };
  }

  console.log('[CoinGecko] Updating coin metadata from CoinGecko...');
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/coins/list');
    if (!res.ok) {
      throw new Error(`CoinGecko API returned status ${res.status}`);
    }
    const coins = await res.json();
    if (!Array.isArray(coins)) {
      throw new Error('Invalid response from CoinGecko coins/list');
    }

    await db.run('BEGIN TRANSACTION');
    try {
      const stmt = await db.prepare(`
        INSERT INTO coin_metadata (coin_id, symbol, coin_name, last_updated) 
        VALUES (?, ?, ?, ?)
        ON CONFLICT(coin_id) DO UPDATE SET
            symbol=excluded.symbol,
            coin_name=excluded.coin_name,
            last_updated=excluded.last_updated
      `);

      const now = new Date().toISOString();
      let updatedCount = 0;
      for (const coin of coins) {
        if (coin.id && coin.symbol && coin.name) {
          await stmt.run(coin.id, coin.symbol.toUpperCase(), coin.name, now);
          updatedCount++;
        }
      }
      await stmt.finalize();
      await db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('coin_metadata_last_update', ?)", [Date.now()]);
      await db.run('COMMIT');
      console.log(`[CoinGecko] Successfully updated ${updatedCount} coin metadata entries.`);
      return { success: true, updated: updatedCount };
    } catch (dbErr) {
      await db.run('ROLLBACK');
      throw dbErr;
    }
  } catch (error) {
    console.error('[CoinGecko] Failed to update coin metadata:', error.message);
    return { success: false, error: error.message };
  }
}

export async function fetchAndSaveCoinPrices(force = false) {
  const now = Date.now();
  const ttl = CONFIG.COINGECKO_PRICE_TTL || 300000;
  if (!force && lastPriceSave && (now - lastPriceSave) < ttl) {
    const msg = '[CoinGecko] DB price save skipped, within TTL.';
    console.log(msg);
    console.log('[CoinGecko] DB price save skipped, within TTL.');
    return { success: true, cached: true };
  }

  try {
    console.log('[CoinGecko] Fetching and saving coin prices to DB...');
    const prices = await getPricesForCoins(TRACKED_COINS, ['usd', 'btc']);
    const db = await getDb();
    const capturedAt = new Date().toISOString();

    // Fetch metadata to get symbols for the tracked coins
    const placeholders = TRACKED_COINS.map(() => '?').join(',');
    const metadataRows = await db.all(`SELECT coin_id, symbol, coin_name FROM coin_metadata WHERE coin_id IN (${placeholders})`, TRACKED_COINS);
    const metadataMap = new Map(metadataRows.map(row => [row.coin_id, { symbol: row.symbol, name: row.coin_name }]));

    await db.run('BEGIN TRANSACTION');
    try {
      const stmt = await db.prepare(`
        INSERT OR REPLACE INTO coin_prices 
        (coin_id, coin_name, symbol, price_usd, price_btc, market_cap, volume_24h, price_change_24h, captured_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      let updatedCount = 0;
      for (const coinId of TRACKED_COINS) {
          const data = prices[coinId];
          const meta = metadataMap.get(coinId) || {};
          if (data) {
              await stmt.run(
                  coinId, meta.coin_name || null, meta.symbol || null,
                  data.usd || 0, data.btc || 0,
                  data.usd_market_cap || 0, data.usd_24h_vol || 0,
                  data.usd_24h_change || 0, capturedAt
              );
              updatedCount++;
          }
      }
      await stmt.finalize();
      await db.run('COMMIT');
      
      lastPriceSave = now;
      // Update the in-memory cache after successful DB save
      for (const coinId of TRACKED_COINS) {
        if (prices[coinId]) {
          priceCache.set(coinId, {
            usd: prices[coinId].usd || 0,
            btc: prices[coinId].btc || 0,
            symbol: metadataMap.get(coinId)?.symbol || null,
            usd_market_cap: prices[coinId].usd_market_cap || 0,
            usd_24h_vol: prices[coinId].usd_24h_vol || 0,
            usd_24h_change: prices[coinId].usd_24h_change || 0,
            last_updated: capturedAt,
          });
        }
      }

      console.log(`[CoinGecko] Successfully saved ${updatedCount} coin prices to DB.`);
      lastPriceFetchStatus = { success: true, updated: updatedCount, timestamp: capturedAt, cached: false, error: null };
      return lastPriceFetchStatus;
    } catch (dbErr) {
      await db.run('ROLLBACK');
      throw dbErr;
    }

  } catch (error) {
    console.error('[CoinGecko] Failed to fetch and save prices:', error.message);
    lastPriceFetchStatus = { success: false, error: error.message, timestamp: new Date().toISOString(), updated: 0, cached: false };
    return lastPriceFetchStatus;
  }
}

export async function getCoinPricesFromDb(coinIds) {
  if (!Array.isArray(coinIds) || coinIds.length === 0) {
    return {};
  }

  const result = {};
  const idsToFetchFromDb = [];

  // 1. Check in-memory cache first
  for (const id of coinIds) {
    if (priceCache.has(id)) {
      result[id] = priceCache.get(id);
    } else {
      idsToFetchFromDb.push(id);
    }
  }

  // 2. Fetch any misses from the database
  if (idsToFetchFromDb.length > 0) {
    try {
      const db = await getDb();
      const placeholders = idsToFetchFromDb.map(() => '?').join(',');
      const sql = `
        SELECT * FROM (
          SELECT *, ROW_NUMBER() OVER(PARTITION BY coin_id ORDER BY captured_at DESC) as rn
          FROM coin_prices
          WHERE coin_id IN (${placeholders})
        ) WHERE rn = 1
      `;
      const rows = await db.all(sql, idsToFetchFromDb);

      for (const row of rows) {
        const priceData = {
          usd: row.price_usd,
          btc: row.price_btc,
          symbol: row.symbol,
          usd_market_cap: row.market_cap,
          usd_24h_vol: row.volume_24h,
          usd_24h_change: row.price_change_24h,
          last_updated: row.captured_at,
        };
        result[row.coin_id] = priceData;
        priceCache.set(row.coin_id, priceData); // Populate cache with DB result
      }
    } catch (err) {
      console.error('[CoinGecko] Failed to get prices from DB:', err.message);
    }
  }

  return result;
}

export function getLastPriceFetchStatus() {
  return lastPriceFetchStatus;
}

/**
 * Creates a new CoinGecko client instance.
 * This is a factory function that returns an object with methods to interact with the CoinGecko API.
 * @param {object} config - Configuration object (currently unused).
 * @returns {object} A CoinGecko client instance.
 */
export function createCoinGeckoClient(config = {}) {
  return {
    getCoinPrice: (coinId, vsCurrency = 'usd') => getCoinPrice(coinId, vsCurrency),
    getPricesForCoins: (coinIds, vsCurrencies = ['usd']) => getPricesForCoins(coinIds, vsCurrencies),
    getCoinMarketData: (coinId, vsCurrency = 'usd') => getCoinMarketData(coinId, vsCurrency),
    getTrendingCoins: () => getTrendingCoins(),
    clearCache: () => clearCoinCache(),
  };
}

export default {
  getCoinPrice,
  getPricesForCoins,
  getCoinMarketData,
  getTrendingCoins,
  clearCoinCache,
  createCoinGeckoClient,
  fetchAndSaveCoinPrices,
  getCoinPricesFromDb,
  updateCoinMetadata,
  getLastPriceFetchStatus,
};
