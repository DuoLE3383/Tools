// start.js - Complete working version with all coins from CoinGecko and CoinMarketCap
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
  // CoinGecko API - Free tier allows ~50 calls/minute
  COINGECKO_API: 'https://api.coingecko.com/api/v3',
  COINGECKO_ENABLED: true,
  
  // CoinMarketCap API - Requires API key
  COINMARKETCAP_API: 'https://pro-api.coinmarketcap.com/v1',
  COINMARKETCAP_API_KEY: process.env.CMC_API_KEY || '',
  COINMARKETCAP_ENABLED: !!process.env.CMC_API_KEY && process.env.CMC_API_KEY.length > 0,
  
  // Database path
  DB_PATH: path.join(__dirname, 'data', 'stats.db'),
  
  // Fetch interval in minutes (60 = every hour)
  FETCH_INTERVAL_MINUTES: 60,
  
  // Retry settings
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 5000,
  BATCH_SIZE: 100, // CMC batch size for quotes
  MAP_LIMIT: 5000, // CMC map page size
};

// Debug: Show API key status
console.log(`📊 CMC API Key loaded: ${CONFIG.COINMARKETCAP_ENABLED ? '✅ YES' : '❌ NO'}`);
if (CONFIG.COINMARKETCAP_ENABLED) {
  console.log(`   Key: ${CONFIG.COINMARKETCAP_API_KEY.substring(0, 8)}...`);
}

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// ============================================================
// DATABASE SETUP
// ============================================================
let db;

function initDatabase() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(CONFIG.DB_PATH, (err) => {
      if (err) {
        reject(err);
        return;
      }
      
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

        // Metadata table
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

        // Create indexes for faster queries
        db.run('CREATE INDEX IF NOT EXISTS idx_coingecko_symbol ON coingecko_coins(symbol)');
        db.run('CREATE INDEX IF NOT EXISTS idx_cmc_symbol ON cmc_coins(symbol)');
        db.run('CREATE INDEX IF NOT EXISTS idx_cmc_rank ON cmc_coins(cmc_rank)');
        db.run('CREATE INDEX IF NOT EXISTS idx_coingecko_last_updated ON coingecko_coins(last_updated)');
        db.run('CREATE INDEX IF NOT EXISTS idx_cmc_last_updated ON cmc_coins(last_updated)');
        
        resolve();
      });
    });
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
// DATABASE HELPERS
// ============================================================
function dbRunAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function dbAllAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function dbGetAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
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
      
      // If rate limited, wait and retry
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
    // Get list of all coins
    const listResponse = await fetchWithRetry(`${CONFIG.COINGECKO_API}/coins/list`);
    if (!listResponse.ok) {
      throw new Error(`CoinGecko list API error: ${listResponse.status}`);
    }
    const coinList = await listResponse.json();
    
    // Get market data for top coins
    const marketResponse = await fetchWithRetry(
      `${CONFIG.COINGECKO_API}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=500&page=1&sparkline=false`
    );
    if (!marketResponse.ok) {
      throw new Error(`CoinGecko market API error: ${marketResponse.status}`);
    }
    const marketData = await marketResponse.json();
    
    // Create a map of market data by id
    const marketMap = {};
    marketData.forEach(coin => {
      if (!marketMap[coin.id] || (coin.market_cap || 0) > (marketMap[coin.id].market_cap || 0)) {
        marketMap[coin.id] = coin;
      }
    });
    
    // Merge data - keep only unique coins by ID
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
    
    // Store in database
    await dbRunAsync('BEGIN TRANSACTION');
    
    // Clear existing data
    await dbRunAsync('DELETE FROM coingecko_coins');
    
    // Insert new data in batches
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
    
    // Update metadata
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
    console.log('   To enable, set CMC_API_KEY in your .env file');
    return 0;
  }
  
  console.log('🪙 Fetching CoinMarketCap data...');
  console.log(`   Using API key: ${CONFIG.COINMARKETCAP_API_KEY.substring(0, 4)}...${CONFIG.COINMARKETCAP_API_KEY.substring(CONFIG.COINMARKETCAP_API_KEY.length - 4)}`);
  
  try {
    // ============================================================
    // STEP 1: Get ALL coin IDs from the map endpoint
    // ============================================================
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
      
      // Check for API errors
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
      
      // Check if we got less than the limit (last page)
      if (coins.length < mapLimit) {
        hasMore = false;
      } else {
        start += mapLimit;
      }
      
      // Rate limit - wait a bit between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`   Total coins in map: ${allCoins.length}`);
    
    if (allCoins.length === 0) {
      console.log('   No coins found in map');
      return 0;
    }
    
    // ============================================================
    // STEP 2: Get quotes for all coins in batches
    // ============================================================
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
        const errorText = await quoteResponse.text();
        console.warn(`   ⚠️ Quote API error for batch ${batchNum}: ${quoteResponse.status}`);
        continue;
      }
      
      const quoteData = await quoteResponse.json();
      
      // Check for API errors
      if (quoteData.status?.error_code !== undefined && quoteData.status.error_code !== 0) {
        console.warn(`   ⚠️ Quote API error: ${quoteData.status.error_message || 'Unknown error'}`);
        continue;
      }
      
      // Process the quote data
      const quotes = quoteData.data || {};
      for (const coinId in quotes) {
        const coin = quotes[coinId];
        if (coin) {
          allCoinData.push(coin);
        }
      }
      
      // Rate limit - wait between batches
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    console.log(`   Total coins with quotes: ${allCoinData.length}`);
    
    if (allCoinData.length === 0) {
      console.log('   No coin data received');
      return 0;
    }
    
    // ============================================================
    // STEP 3: Store in database
    // ============================================================
    console.log('   Storing coins in database...');
    
    await dbRunAsync('BEGIN TRANSACTION');
    
    // Clear existing data
    await dbRunAsync('DELETE FROM cmc_coins');
    
    // Insert new data in batches
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
    
    // Update metadata
    await dbRunAsync(`
      INSERT OR REPLACE INTO coin_metadata (key, value, last_updated)
      VALUES ('cmc_last_update', ?, ?)
    `, [insertedCount.toString(), new Date().toISOString()]);
    
    await dbRunAsync('COMMIT');
    
    console.log(`✅ CoinMarketCap: Stored ${insertedCount} coins`);
    return insertedCount;
    
  } catch (error) {
    console.error('❌ CoinMarketCap fetch error:', error.message);
    if (error.message.includes('API key')) {
      console.error('   Please check your CMC_API_KEY environment variable');
      console.error('   Get a free API key at: https://coinmarketcap.com/api/');
    }
    await dbRunAsync('ROLLBACK').catch(() => {});
    return 0;
  }
}

// ============================================================
// FETCH ALL DATA
// ============================================================
async function fetchAllCoinData() {
  console.log('\n🔄 Fetching coin data...');
  console.log(`📊 CoinGecko: ${CONFIG.COINGECKO_ENABLED ? 'ENABLED' : 'DISABLED'}`);
  console.log(`📊 CoinMarketCap: ${CONFIG.COINMARKETCAP_ENABLED ? 'ENABLED' : 'DISABLED'}`);
  if (CONFIG.COINMARKETCAP_ENABLED) {
    console.log(`   (This may take a while as we fetch all coins from CMC)`);
  }
  
  const startTime = Date.now();
  
  let coingeckoCount = 0;
  let cmcCount = 0;
  
  // Fetch CoinGecko (fast, ~1-2 seconds)
  if (CONFIG.COINGECKO_ENABLED) {
    coingeckoCount = await fetchCoinGeckoData();
  }
  
  // Fetch CoinMarketCap (slow, ~30-60 seconds for all coins)
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
export function getCoinData(symbol, source = 'coingecko') {
  return new Promise((resolve, reject) => {
    const table = source === 'coingecko' ? 'coingecko_coins' : 'cmc_coins';
    const query = `SELECT * FROM ${table} WHERE UPPER(symbol) = ? ORDER BY last_updated DESC LIMIT 1`;
    
    db.get(query, [symbol.toUpperCase()], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

export function getAllCoins(source = 'coingecko', limit = 100) {
  return new Promise((resolve, reject) => {
    const table = source === 'coingecko' ? 'coingecko_coins' : 'cmc_coins';
    const query = `SELECT * FROM ${table} ORDER BY market_cap_usd DESC LIMIT ?`;
    
    db.all(query, [limit], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

export function getCoinPrice(symbol) {
  return new Promise((resolve, reject) => {
    const query = `
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
    `;
    
    db.get(query, [symbol.toUpperCase()], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// ============================================================
// SCHEDULER
// ============================================================
function startScheduler() {
  // Run immediately on startup
  setTimeout(async () => {
    console.log('\n⏰ Running initial fetch...');
    await fetchAllCoinData();
  }, 5000);
  
  // Schedule every X minutes
  const intervalMinutes = CONFIG.FETCH_INTERVAL_MINUTES;
  const cronExpression = `*/${intervalMinutes} * * * *`;
  
  cron.schedule(cronExpression, async () => {
    console.log(`\n⏰ Scheduled fetch (every ${intervalMinutes} minutes)`);
    await fetchAllCoinData();
  });
  
  console.log(`⏰ Scheduler started: fetching every ${intervalMinutes} minutes`);
}

// ============================================================
// API ENDPOINT FOR EXPRESS
// ============================================================
export function setupCoinRoutes(app) {
  // Get coin price
  app.get('/api/coin/price/:symbol', async (req, res) => {
    try {
      const data = await getCoinPrice(req.params.symbol);
      if (data) {
        res.json(data);
      } else {
        res.status(404).json({ error: 'Coin not found' });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Get top coins
  app.get('/api/coins/top/:source?', async (req, res) => {
    try {
      const source = req.params.source || 'coingecko';
      const limit = parseInt(req.query.limit) || 100;
      const data = await getAllCoins(source, limit);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Get coin data
  app.get('/api/coin/:source/:symbol', async (req, res) => {
    try {
      const data = await getCoinData(req.params.symbol, req.params.source);
      if (data) {
        res.json(data);
      } else {
        res.status(404).json({ error: 'Coin not found' });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Manual fetch endpoint
  app.post('/api/coins/fetch', async (req, res) => {
    try {
      const result = await fetchAllCoinData();
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Get metadata
  app.get('/api/coins/metadata', async (req, res) => {
    try {
      const rows = await dbAllAsync('SELECT * FROM coin_metadata');
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}

// ============================================================
// MAIN
// ============================================================
console.log('🚀 Starting NiceHash Tool...');
console.log('📁 Working directory:', __dirname);
console.log('📊 Initializing coin database...');

try {
  await initDatabase();
  console.log('✅ Database initialized:', CONFIG.DB_PATH);
  
  // Show coin source status
  console.log(`📊 Coin Sources:`);
  console.log(`   CoinGecko: ${CONFIG.COINGECKO_ENABLED ? '✅ ENABLED' : '❌ DISABLED'}`);
  console.log(`   CoinMarketCap: ${CONFIG.COINMARKETCAP_ENABLED ? '✅ ENABLED' : '❌ DISABLED'}`);
  if (CONFIG.COINMARKETCAP_ENABLED) {
    console.log(`   💡 CMC will fetch ALL coins (this may take 30-60 seconds on first run)`);
  } else {
    console.log(`   💡 To enable CMC, set CMC_API_KEY in your .env file`);
  }
  
  startScheduler();
} catch (error) {
  console.error('❌ Database initialization failed:', error.message);
  process.exit(1);
}

// ============================================================
// ORIGINAL PROCESS MANAGEMENT
// ============================================================

let processes = [];

function cleanup() {
  console.log('\n🛑 Shutting down...');
  processes.forEach(p => {
    try {
      p.kill();
    } catch (e) {}
  });
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Start backend
console.log('📡 Starting backend server...');
const backend = spawn('node', ['index.js'], {
  stdio: 'pipe',
  shell: true,
  env: { ...process.env }
});

processes.push(backend);

let backendReady = false;

backend.stdout.on('data', (data) => {
  const output = data.toString().trim();
  if (output) console.log('[📡]', output);
  
  if (output.includes('Listening on http://127.0.0.1:3000')) {
    backendReady = true;
    console.log('✅ Backend ready! Starting frontend...');
    
    setTimeout(() => {
      console.log('🎨 Starting frontend...');
      
      const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      
      const frontend = spawn(npmCmd, ['run', 'dev'], {
        stdio: 'inherit',
        shell: true,
        env: { ...process.env }
      });
      processes.push(frontend);
      
      frontend.on('error', (err) => {
        console.error('❌ Frontend error:', err.message);
      });
      
      frontend.on('close', (code) => {
        if (code !== 0 && code !== null) {
          console.error(`❌ Frontend exited with code ${code}`);
        }
      });
    }, 1500);
  }
});

backend.stderr.on('data', (data) => {
  const error = data.toString().trim();
  if (error && !error.includes('ECONNREFUSED') && !error.includes('DeprecationWarning')) {
    console.error('[Backend Error]', error);
  }
});

backend.on('error', (err) => {
  console.error('❌ Backend error:', err.message);
});

backend.on('close', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`❌ Backend exited with code ${code}`);
  }
  if (!backendReady) {
    console.log('❌ Backend failed to start. Please check the errors above.');
  }
});

console.log('📡 Backend starting... Waiting for ready signal.');
console.log('💡 Press Ctrl+C to stop all services.');

// ============================================================
// EXPORTS
// ============================================================
export { 
  db, 
  fetchAllCoinData,
};