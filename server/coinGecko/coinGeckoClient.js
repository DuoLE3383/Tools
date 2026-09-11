// server/coinGecko/coinGeckoClient.js
// Main export file - re-export everything from the service
import { getDb } from '../db.js';
import { TRACKED_COINS } from './coinMapping.js';
import { CONFIG } from '../config.js';
import { getCmcPrices } from '../cmcClient.js';
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

const CMC_SYMBOL_BY_ID = {
  bitcoin: 'BTC',
  ethereum: 'ETH',
  monero: 'XMR',
  ravencoin: 'RVN',
  ergo: 'ERG',
  kaspa: 'KAS',
  beam: 'BEAM',
  'ethereum-classic': 'ETC',
  litecoin: 'LTC',
  dogecoin: 'DOGE',
  'bitcoin-cash': 'BCH',
  'zephyr-protocol': 'ZEPH',
  salvium: 'SAL',
  'iron-fish': 'IRON',
  dynex: 'DNX',
  alephium: 'ALPH',
  nexa: 'NEXA',
  'clore-ai': 'CLORE',
  'conflux-token': 'CFX',
  'quantum-resistant-ledger': 'QRL',
  xelis: 'XEL',
  zano: 'ZANO',
  aipg: 'AIPG',
};

export async function fetchAndSaveCoinPrices(force = false) {
  const now = Date.now();
  const ttl = CONFIG.COINGECKO_PRICE_TTL || 300000;
  if (!force && lastPriceSave && (now - lastPriceSave) < ttl) {
    console.log('[CoinGecko] DB price save skipped, within TTL.');
    return { success: true, cached: true };
  }

  try {
    console.log('[CoinGecko] Fetching and saving coin prices to DB...');
    const prices = await getPricesForCoins(TRACKED_COINS, ['usd', 'btc']);
    const missingIds = TRACKED_COINS.filter((coinId) => {
      const usd = Number(prices?.[coinId]?.usd || 0);
      return usd <= 0 && CMC_SYMBOL_BY_ID[coinId];
    });
    let cmcPrices = {};
    if (missingIds.length > 0 && process.env.CMC_API) {
      try {
        const symbols = missingIds.map((coinId) => CMC_SYMBOL_BY_ID[coinId]);
        cmcPrices = await getCmcPrices([...new Set([...symbols, 'BTC'])]);
        console.log(`[CoinGecko] CMC fallback returned ${Object.keys(cmcPrices).length} prices.`);
      } catch (cmcError) {
        console.warn(`[CoinGecko] CMC fallback failed: ${cmcError.message}`);
      }
    }
    const db = await getDb();
    const capturedAt = new Date().toISOString();

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
            const cmcData = cmcPrices[CMC_SYMBOL_BY_ID[coinId]];
            const priceData = Number(data?.usd) > 0 ? data : cmcData;
            if (priceData) {
              await stmt.run(
                  coinId, null, null,
                priceData.usd || 0, priceData.btc || 0,
                priceData.usd_market_cap || 0, priceData.usd_24h_vol || 0,
                priceData.usd_24h_change || 0, capturedAt
              );
              updatedCount++;
          }
      }
      await stmt.finalize();
      await db.run('COMMIT');
      
      lastPriceSave = now;
      console.log(`[CoinGecko] Successfully saved ${updatedCount} coin prices to DB.`);
      return { success: true, updated: updatedCount, timestamp: capturedAt };
    } catch (dbErr) {
      await db.run('ROLLBACK');
      throw dbErr;
    }

  } catch (error) {
    console.error('[CoinGecko] Failed to fetch and save prices:', error.message);
    return { success: false, error: error.message };
  }
}

export async function getCoinPricesFromDb(coinIds) {
  if (!Array.isArray(coinIds) || coinIds.length === 0) {
    return {};
  }

  try {
    const db = await getDb();
    const placeholders = coinIds.map(() => '?').join(',');
    
    const sql = `
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER(PARTITION BY coin_id ORDER BY captured_at DESC) as rn
        FROM coin_prices
        WHERE coin_id IN (${placeholders})
      ) WHERE rn = 1
    `;

    const rows = await db.all(sql, coinIds);

    const result = {};
    for (const row of rows) {
      result[row.coin_id] = {
        usd: row.price_usd,
        btc: row.price_btc,
        usd_market_cap: row.market_cap,
        usd_24h_vol: row.volume_24h,
        usd_24h_change: row.price_change_24h,
        last_updated: row.captured_at,
      };
    }
    return result;
  } catch (err) {
    console.error('[CoinGecko] Failed to get prices from DB:', err.message);
    return {};
  }
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
};
