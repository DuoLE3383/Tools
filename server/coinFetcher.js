// server/coinFetcher.js
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import sqlite3 from 'sqlite3';
import cron from 'node-cron';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// CONFIGURATION
// ============================================================
const CONFIG = {
  COINGECKO_API: 'https://api.coingecko.com/api/v3',
  COINGECKO_ENABLED: true,
  
  COINMARKETCAP_API: 'https://pro-api.coinmarketcap.com/v1',
  COINMARKETCAP_API_KEY: process.env.CMC_API_KEY || '',
  COINMARKETCAP_ENABLED: !!process.env.CMC_API_KEY && process.env.CMC_API_KEY.length > 0,
  
  DB_PATH: path.join(__dirname, '..', 'data', 'stats.db'),
  FETCH_INTERVAL_MINUTES: 60,
  
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 5000,
  BATCH_SIZE: 100,
  MAP_LIMIT: 5000,
  
  // Database retry settings
  DB_MAX_RETRIES: 5,
  DB_RETRY_DELAY_MS: 1000,
};

// Debug: Show API key status
console.log(`📊 CMC API Key loaded: ${CONFIG.COINMARKETCAP_ENABLED ? '✅ YES' : '❌ NO'}`);
if (CONFIG.COINMARKETCAP_ENABLED) {
  console.log(`   Key: ${CONFIG.COINMARKETCAP_API_KEY.substring(0, 8)}...`);
}

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// ============================================================
// DATABASE SETUP WITH LOCK HANDLING
// ============================================================
let db; // This will be the shared database instance

function initDatabase(dbInstance) {
  return new Promise((resolve, reject) => {
    if (!dbInstance) {
      return reject(new Error("Database instance was not provided to coinFetcher."));
    }
    db = dbInstance;

    // The main server already sets WAL mode, but we can ensure it here too.
    db.run('PRAGMA journal_mode=WAL', (err) => {
      if (err) console.warn('⚠️ [coinFetcher] Could not enable WAL mode:', err.message);
    });

      // Enable WAL mode for better concurrent access
      db.run('PRAGMA journal_mode=WAL', (err) => {
        if (err) console.warn('⚠️ Could not enable WAL mode:', err.message);
      });
      
      db.run('PRAGMA busy_timeout=30000', (err) => {
        if (err) console.warn('⚠️ Could not set busy timeout:', err.message);
      });
      
      db.serialize(() => {
        // CoinGecko table
        db.run(`
          CREATE TABLE IF NOT EXISTS coingecko_coins (
            id TEXT PRIMARY KEY,
            symbol TEXT,
            name TEXT,
            price_usd REAL,
            market_cap_usd REAL,
            volume_24h_usd REAL,
            change_24h REAL,
            change_7d REAL,
            change_30d REAL,
            change_60d REAL,
            change_200d REAL,
            change_1y REAL,
            ath REAL,
            ath_change_percentage REAL,
            ath_date TEXT,
            atl REAL,
            atl_change_percentage REAL,
            atl_date TEXT,
            circulating_supply REAL,
            total_supply REAL,
            max_supply REAL,
            last_updated TEXT,
            full_data TEXT
          )
        `, (err) => {
          if (err) console.error('❌ Failed to create coingecko_coins table:', err.message);
        });

        // CoinMarketCap table
        db.run(`
          CREATE TABLE IF NOT EXISTS cmc_coins (
            id INTEGER PRIMARY KEY,
            name TEXT,
            symbol TEXT,
            slug TEXT,
            cmc_rank INTEGER,
            price_usd REAL,
            market_cap_usd REAL,
            volume_24h_usd REAL,
            percent_change_1h REAL,
            percent_change_24h REAL,
            percent_change_7d REAL,
            percent_change_30d REAL,
            percent_change_60d REAL,
            percent_change_90d REAL,
            circulating_supply REAL,
            total_supply REAL,
            max_supply REAL,
            last_updated TEXT,
            full_data TEXT
          )
        `, (err) => {
          if (err) console.error('❌ Failed to create cmc_coins table:', err.message);
        });

        db.run(`
          CREATE TABLE IF NOT EXISTS coin_metadata (
            key TEXT PRIMARY KEY,
            value TEXT,
            last_updated TEXT
          )
        `, (err) => {
          if (err) {
            console.error('❌ Failed to create coin_metadata table:', err.message);
            fixCoinMetadataTable();
          } else {
            verifyCoinMetadataTable();
          }
        });

        // Create indexes
        db.run('CREATE INDEX IF NOT EXISTS idx_coingecko_symbol ON coingecko_coins(symbol)');
        db.run('CREATE INDEX IF NOT EXISTS idx_cmc_symbol ON cmc_coins(symbol)');
        db.run('CREATE INDEX IF NOT EXISTS idx_cmc_rank ON cmc_coins(cmc_rank)');
        db.run('CREATE INDEX IF NOT EXISTS idx_coingecko_last_updated ON coingecko_coins(last_updated)');
        db.run('CREATE INDEX IF NOT EXISTS idx_cmc_last_updated ON cmc_coins(last_updated)');
        
        resolve();
      });
  });
}

// ============================================================
// DATABASE HELPERS WITH RETRY
// ============================================================
function dbRunAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    const tryRun = (attempt = 1) => {
      db.run(sql, params, function(err) {
        if (err) {
          if (err.code === 'SQLITE_BUSY' && attempt < CONFIG.DB_MAX_RETRIES) {
            console.log(`   ⏳ Database busy, retrying (attempt ${attempt}/${CONFIG.DB_MAX_RETRIES})...`);
            setTimeout(() => tryRun(attempt + 1), CONFIG.DB_RETRY_DELAY_MS * attempt);
          } else {
            reject(err);
          }
        } else {
          resolve(this);
        }
      });
    };
    tryRun();
  });
}

function dbAllAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    const tryAll = (attempt = 1) => {
      db.all(sql, params, (err, rows) => {
        if (err) {
          if (err.code === 'SQLITE_BUSY' && attempt < CONFIG.DB_MAX_RETRIES) {
            console.log(`   ⏳ Database busy, retrying (attempt ${attempt}/${CONFIG.DB_MAX_RETRIES})...`);
            setTimeout(() => tryAll(attempt + 1), CONFIG.DB_RETRY_DELAY_MS * attempt);
          } else {
            reject(err);
          }
        } else {
          resolve(rows);
        }
      });
    };
    tryAll();
  });
}

function dbGetAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    const tryGet = (attempt = 1) => {
      db.get(sql, params, (err, row) => {
        if (err) {
          if (err.code === 'SQLITE_BUSY' && attempt < CONFIG.DB_MAX_RETRIES) {
            console.log(`   ⏳ Database busy, retrying (attempt ${attempt}/${CONFIG.DB_MAX_RETRIES})...`);
            setTimeout(() => tryGet(attempt + 1), CONFIG.DB_RETRY_DELAY_MS * attempt);
          } else {
            reject(err);
          }
        } else {
          resolve(row);
        }
      });
    };
    tryGet();
  });
}

// ============================================================
// FIX: Verify and repair coin_metadata table
// ============================================================
function verifyCoinMetadataTable() {
  db.all("PRAGMA table_info(coin_metadata)", (err, columns) => {
    if (err) {
      console.error('Failed to check coin_metadata schema:', err.message);
      return;
    }
    
    if (!columns || columns.length === 0) {
      console.log('coin_metadata table is empty or missing, recreating...');
      recreateCoinMetadataTable();
      return;
    }
    
    const columnNames = columns.map(c => c.name);
    const requiredColumns = ['key', 'value', 'last_updated'];
    const missingColumns = requiredColumns.filter(col => !columnNames.includes(col));
    
    if (missingColumns.length > 0) {
      console.log(`coin_metadata missing columns: ${missingColumns.join(', ')}. Recreating...`);
      recreateCoinMetadataTable();
    } else {
      console.log('✅ coin_metadata table verified');
    }
  });
}

function recreateCoinMetadataTable() {
  db.run('DROP TABLE IF EXISTS coin_metadata', (err) => {
    if (err) {
      console.error('Failed to drop coin_metadata:', err.message);
      return;
    }
    db.run(`
      CREATE TABLE coin_metadata (
        key TEXT PRIMARY KEY,
        value TEXT,
        last_updated TEXT
      )
    `, (err) => {
      if (err) {
        console.error('Failed to recreate coin_metadata:', err.message);
      } else {
        console.log('✅ coin_metadata table recreated with correct schema');
      }
    });
  });
}

function fixCoinMetadataTable() {
  recreateCoinMetadataTable();
}

// ============================================================
// FETCH WITH RETRY
// ============================================================
async function fetchWithRetry(url, options = {}, maxRetries = CONFIG.MAX_RETRIES) {
  let lastError = null;
  let delay = CONFIG.RETRY_DELAY_MS;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : delay;
        console.log(`⚠️ Rate limited (429). Retrying in ${waitTime/1000}s... (attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        delay *= 2;
        continue;
      }
      
      return response;
    } catch (error) {
      lastError = error;
      console.log(`⚠️ Request failed: ${error.message}. Retrying in ${delay/1000}s... (attempt ${attempt}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
  
  throw new Error(`Failed after ${maxRetries} retries: ${lastError?.message || 'Unknown error'}`);
}

// ============================================================
// COINGECKO FETCHER
// ============================================================
async function fetchCoinGeckoData() {
  console.log('🪙 Fetching CoinGecko data...');
  
  try {
    const listResponse = await fetchWithRetry(`${CONFIG.COINGECKO_API}/coins/list`);
    if (!listResponse.ok) {
      throw new Error(`CoinGecko list API error: ${listResponse.status}`);
    }
    const coinList = await listResponse.json();
    
    const marketResponse = await fetchWithRetry(
      `${CONFIG.COINGECKO_API}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=500&page=1&sparkline=false`
    );
    if (!marketResponse.ok) {
      throw new Error(`CoinGecko market API error: ${marketResponse.status}`);
    }
    const marketData = await marketResponse.json();
    
    const marketMap = {};
    marketData.forEach(coin => {
      if (!marketMap[coin.id] || (coin.market_cap || 0) > (marketMap[coin.id].market_cap || 0)) {
        marketMap[coin.id] = coin;
      }
    });
    
    const uniqueCoins = new Map();
    coinList.forEach(coin => {
      if (!uniqueCoins.has(coin.id)) {
        const market = marketMap[coin.id] || {};
        uniqueCoins.set(coin.id, {
          id: coin.id,
          symbol: coin.symbol,
          name: coin.name,
          price_usd: market.current_price || 0,
          market_cap_usd: market.market_cap || 0,
          volume_24h_usd: market.total_volume || 0,
          change_24h: market.price_change_percentage_24h || 0,
          change_7d: market.price_change_percentage_7d_in_currency || 0,
          change_30d: market.price_change_percentage_30d_in_currency || 0,
          change_60d: market.price_change_percentage_60d_in_currency || 0,
          change_200d: market.price_change_percentage_200d_in_currency || 0,
          change_1y: market.price_change_percentage_1y_in_currency || 0,
          ath: market.ath || 0,
          ath_change_percentage: market.ath_change_percentage || 0,
          ath_date: market.ath_date || null,
          atl: market.atl || 0,
          atl_change_percentage: market.atl_change_percentage || 0,
          atl_date: market.atl_date || null,
          circulating_supply: market.circulating_supply || 0,
          total_supply: market.total_supply || 0,
          max_supply: market.max_supply || 0,
          last_updated: new Date().toISOString(),
          full_data: JSON.stringify(market)
        });
      }
    });
    
    const coins = Array.from(uniqueCoins.values());
    
    await dbRunAsync('BEGIN TRANSACTION');
    await dbRunAsync('DELETE FROM coingecko_coins');
    
    const batchSize = 100;
    for (let i = 0; i < coins.length; i += batchSize) {
      const batch = coins.slice(i, i + batchSize);
      for (const coin of batch) {
        await dbRunAsync(`
          INSERT INTO coingecko_coins (
            id, symbol, name, price_usd, market_cap_usd, volume_24h_usd,
            change_24h, change_7d, change_30d, change_60d, change_200d, change_1y,
            ath, ath_change_percentage, ath_date, atl, atl_change_percentage, atl_date,
            circulating_supply, total_supply, max_supply, last_updated, full_data
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          coin.id, coin.symbol, coin.name, coin.price_usd, coin.market_cap_usd, coin.volume_24h_usd,
          coin.change_24h, coin.change_7d, coin.change_30d, coin.change_60d, coin.change_200d, coin.change_1y,
          coin.ath, coin.ath_change_percentage, coin.ath_date, coin.atl, coin.atl_change_percentage, coin.atl_date,
          coin.circulating_supply, coin.total_supply, coin.max_supply, coin.last_updated, coin.full_data
        ]);
      }
    }
    
    await dbRunAsync(`
      INSERT OR REPLACE INTO coin_metadata (key, value, last_updated)
      VALUES ('coingecko_last_update', ?, ?)
    `, [coins.length.toString(), new Date().toISOString()]);
    
    await dbRunAsync('COMMIT');
    
    console.log(`✅ CoinGecko: Stored ${coins.length} unique coins`);
    return coins.length;
    
  } catch (error) {
    console.error('❌ CoinGecko fetch error:', error.message);
    await dbRunAsync('ROLLBACK').catch(() => {});
    return 0;
  }
}

// ============================================================
// COINMARKETCAP FETCHER - GET ALL COINS
// ============================================================
async function fetchCoinMarketCapData() {
  if (!CONFIG.COINMARKETCAP_ENABLED) {
    console.log('⚠️ CoinMarketCap disabled (no API key set)');
    return 0;
  }
  
  console.log('🪙 Fetching CoinMarketCap data...');
  console.log(`   Using API key: ${CONFIG.COINMARKETCAP_API_KEY.substring(0, 4)}...${CONFIG.COINMARKETCAP_API_KEY.substring(CONFIG.COINMARKETCAP_API_KEY.length - 4)}`);
  
  try {
    console.log('   Fetching coin map (all coins)...');
    
    let allCoins = [];
    let start = 1;
    const mapLimit = CONFIG.MAP_LIMIT;
    let hasMore = true;
    
    while (hasMore) {
      const mapUrl = `${CONFIG.COINMARKETCAP_API}/cryptocurrency/map?limit=${mapLimit}&start=${start}`;
      
      const mapResponse = await fetchWithRetry(
        mapUrl,
        {
          headers: {
            'X-CMC_PRO_API_KEY': CONFIG.COINMARKETCAP_API_KEY
          }
        }
      );
      
      if (!mapResponse.ok) {
        const errorText = await mapResponse.text();
        throw new Error(`CMC Map API error (${mapResponse.status}): ${errorText}`);
      }
      
      const mapData = await mapResponse.json();
      
      if (mapData.status?.error_code !== undefined && mapData.status.error_code !== 0) {
        throw new Error(`CMC Map API Error: ${mapData.status.error_message || 'Unknown error'}`);
      }
      
      const coins = mapData.data || [];
      if (coins.length === 0) {
        hasMore = false;
        break;
      }
      
      allCoins = allCoins.concat(coins);
      console.log(`   Got ${coins.length} coins (total: ${allCoins.length})`);
      
      if (coins.length < mapLimit) {
        hasMore = false;
      } else {
        start += mapLimit;
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`   Total coins in map: ${allCoins.length}`);
    
    if (allCoins.length === 0) {
      console.log('   No coins found in map');
      return 0;
    }
    
    console.log('   Fetching quotes for all coins...');
    
    const batchSize = CONFIG.BATCH_SIZE;
    const allCoinData = [];
    const totalBatches = Math.ceil(allCoins.length / batchSize);
    
    for (let i = 0; i < allCoins.length; i += batchSize) {
      const batch = allCoins.slice(i, i + batchSize);
      const ids = batch.map(coin => coin.id).join(',');
      const batchNum = Math.floor(i / batchSize) + 1;
      
      console.log(`   Fetching quotes batch ${batchNum}/${totalBatches} (${batch.length} coins)...`);
      
      const quoteUrl = `${CONFIG.COINMARKETCAP_API}/cryptocurrency/quotes/latest?id=${ids}&convert=USD`;
      
      const quoteResponse = await fetchWithRetry(
        quoteUrl,
        {
          headers: {
            'X-CMC_PRO_API_KEY': CONFIG.COINMARKETCAP_API_KEY
          }
        }
      );
      
      if (!quoteResponse.ok) {
        console.warn(`   ⚠️ Quote API error for batch ${batchNum}: ${quoteResponse.status}`);
        continue;
      }
      
      const quoteData = await quoteResponse.json();
      
      if (quoteData.status?.error_code !== undefined && quoteData.status.error_code !== 0) {
        console.warn(`   ⚠️ Quote API error: ${quoteData.status.error_message || 'Unknown error'}`);
        continue;
      }
      
      const quotes = quoteData.data || {};
      for (const coinId in quotes) {
        const coin = quotes[coinId];
        if (coin) {
          allCoinData.push(coin);
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    console.log(`   Total coins with quotes: ${allCoinData.length}`);
    
    if (allCoinData.length === 0) {
      console.log('   No coin data received');
      return 0;
    }
    
    console.log('   Storing coins in database...');
    
    await dbRunAsync('BEGIN TRANSACTION');
    await dbRunAsync('DELETE FROM cmc_coins');
    
    let insertedCount = 0;
    const insertBatchSize = 100;
    for (let i = 0; i < allCoinData.length; i += insertBatchSize) {
      const batch = allCoinData.slice(i, i + insertBatchSize);
      for (const coin of batch) {
        const quote = coin.quote?.USD || {};
        
        await dbRunAsync(`
          INSERT INTO cmc_coins (
            id, name, symbol, slug, cmc_rank, price_usd, market_cap_usd, volume_24h_usd,
            percent_change_1h, percent_change_24h, percent_change_7d, percent_change_30d,
            percent_change_60d, percent_change_90d,
            circulating_supply, total_supply, max_supply, last_updated, full_data
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          coin.id, coin.name, coin.symbol, coin.slug, coin.cmc_rank || 0,
          quote.price || 0,
          quote.market_cap || 0,
          quote.volume_24h || 0,
          quote.percent_change_1h || 0,
          quote.percent_change_24h || 0,
          quote.percent_change_7d || 0,
          quote.percent_change_30d || 0,
          quote.percent_change_60d || 0,
          quote.percent_change_90d || 0,
          coin.circulating_supply || 0,
          coin.total_supply || 0,
          coin.max_supply || 0,
          new Date().toISOString(),
          JSON.stringify(coin)
        ]);
        insertedCount++;
      }
      console.log(`   Inserted ${insertedCount} coins so far...`);
    }
    
    await dbRunAsync(`
      INSERT OR REPLACE INTO coin_metadata (key, value, last_updated)
      VALUES ('cmc_last_update', ?, ?)
    `, [insertedCount.toString(), new Date().toISOString()]);
    
    await dbRunAsync('COMMIT');
    
    console.log(`✅ CoinMarketCap: Stored ${insertedCount} coins`);
    return insertedCount;
    
  } catch (error) {
    console.error('❌ CoinMarketCap fetch error:', error.message);
    await dbRunAsync('ROLLBACK').catch(() => {});
    return 0;
  }
}

// ============================================================
// FETCH ALL DATA
// ============================================================
export async function fetchAllCoinData() {
  console.log('\n🔄 Fetching coin data...');
  console.log(`📊 CoinGecko: ${CONFIG.COINGECKO_ENABLED ? 'ENABLED' : 'DISABLED'}`);
  console.log(`📊 CoinMarketCap: ${CONFIG.COINMARKETCAP_ENABLED ? 'ENABLED' : 'DISABLED'}`);
  if (CONFIG.COINMARKETCAP_ENABLED) {
    console.log(`   (This may take a while as we fetch all coins from CMC)`);
  }
  
  const startTime = Date.now();
  
  let coingeckoCount = 0;
  let cmcCount = 0;
  
  if (CONFIG.COINGECKO_ENABLED) {
    coingeckoCount = await fetchCoinGeckoData();
  }
  
  if (CONFIG.COINMARKETCAP_ENABLED) {
    cmcCount = await fetchCoinMarketCapData();
  }
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`✅ Coin data fetch completed in ${duration}s`);
  console.log(`   📊 CoinGecko: ${coingeckoCount} coins`);
  console.log(`   📊 CoinMarketCap: ${cmcCount} coins`);
  console.log(`   📁 Database: ${CONFIG.DB_PATH}`);
  console.log(`   📅 Last updated: ${new Date().toLocaleString()}`);
  
  return { coingeckoCount, cmcCount, duration };
}

// ============================================================
// GET COIN DATA FROM DATABASE
// ============================================================
export function getCoinData(identifier, source = 'coingecko') {
  const isCoingecko = source === 'coingecko';
  const table = isCoingecko ? 'coingecko_coins' : 'cmc_coins';
  
  // CoinGecko is best looked up by its unique 'id' (e.g., "bitcoin").
  // CoinMarketCap is best looked up by 'symbol' (e.g., "BTC").
  const column = isCoingecko ? 'id' : 'symbol';

  const sql = `SELECT * FROM ${table} WHERE UPPER(${column}) = ? ORDER BY last_updated DESC LIMIT 1`;
  
  return dbGetAsync(sql, [identifier.toUpperCase()]);
}

export function getAllCoins(source = 'coingecko', limit = 100) {
  return dbAllAsync(
    `SELECT * FROM ${source === 'coingecko' ? 'coingecko_coins' : 'cmc_coins'} 
     ORDER BY market_cap_usd DESC LIMIT ?`,
    [limit]
  );
}

export function getCoinPrice(symbol) {
  return dbGetAsync(`
    SELECT 
      coingecko_coins.symbol,
      coingecko_coins.price_usd as coingecko_price,
      coingecko_coins.change_24h as coingecko_change_24h,
      coingecko_coins.last_updated as coingecko_updated,
      cmc_coins.price_usd as cmc_price,
      cmc_coins.percent_change_24h as cmc_change_24h,
      cmc_coins.last_updated as cmc_updated
    FROM coingecko_coins
    LEFT JOIN cmc_coins ON UPPER(cmc_coins.symbol) = UPPER(coingecko_coins.symbol)
    WHERE UPPER(coingecko_coins.symbol) = ?
    ORDER BY coingecko_coins.last_updated DESC
    LIMIT 1
  `, [symbol.toUpperCase()]);
}

// ============================================================
// SCHEDULER
// ============================================================
export function startCoinFetcherService(mainDbInstance) {
  console.log('🚀 Starting Coin Fetcher Service...');
  console.log('📁 Working directory:', __dirname);
  console.log('📊 Initializing coin database...');

  initDatabase(mainDbInstance)
    .then(() => {
      console.log('✅ Database initialized for Coin Fetcher:', CONFIG.DB_PATH);
      
      console.log(`📊 Coin Sources:`);
      console.log(`   CoinGecko: ${CONFIG.COINGECKO_ENABLED ? '✅ ENABLED' : '❌ DISABLED'}`);
      console.log(`   CoinMarketCap: ${CONFIG.COINMARKETCAP_ENABLED ? '✅ ENABLED' : '❌ DISABLED'}`);
      if (CONFIG.COINMARKETCAP_ENABLED) {
        console.log(`   💡 CMC will fetch ALL coins (this may take 30-60 seconds on first run)`);
      }
      
      // Start the scheduler
      setTimeout(async () => {
        console.log('\n⏰ Running initial coin fetch...');
        await fetchAllCoinData();
      }, 5000);
      
      const intervalMinutes = CONFIG.FETCH_INTERVAL_MINUTES;
      const cronExpression = `*/${intervalMinutes} * * * *`;
      
      cron.schedule(cronExpression, async () => {
        console.log(`\n⏰ Scheduled coin fetch (every ${intervalMinutes} minutes)`);
        await fetchAllCoinData();
      });
      
      console.log(`⏰ Coin fetcher scheduler started: fetching every ${intervalMinutes} minutes`);
    })
    .catch(error => {
      console.error('❌ Coin fetcher database initialization failed:', error.message);
      process.exit(1);
    });
}

export { db };