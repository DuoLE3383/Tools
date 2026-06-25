// updateCoinPrice.js – fetches ALL coins from CoinGecko & CMC with deduplication
import Database from 'better-sqlite3';
import axios from 'axios';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================
// ENV CONFIGURATION – try multiple locations
// ============================================================
const possiblePaths = [
  join(__dirname, '.env'),
  join(__dirname, '..', '.env'),
  join(process.cwd(), '.env'),
];

console.log('📁 Looking for .env in multiple locations:');
let envLoaded = false;

for (const path of possiblePaths) {
  if (fs.existsSync(path)) {
    console.log(`  ✅ Found .env at: ${path}`);
    const result = dotenv.config({ path });
    if (!result.error) {
      envLoaded = true;
      console.log(`  ✅ .env loaded successfully from ${path}`);
      console.log(`  📋 CMC_API_KEY: ${process.env.CMC_API_KEY ? '✅ Set (length: ' + process.env.CMC_API_KEY.length + ')' : '❌ Not set'}`);
      break;
    }
  } else {
    console.log(`  ❌ Not found: ${path}`);
  }
}

if (!envLoaded) {
  console.log('❌ No .env file found in any location.');
}

// ============================================================
// CONFIGURATION
// ============================================================
const DB_PATH = process.env.DB_PATH || join(__dirname, 'stats.db');
const CMC_API_KEY = process.env.CMC_API_KEY;
const COINGECKO_MAX = 50000;
const CMC_MAX = 50000;
const DELAY_MS = 3000;

// Logging
const LOG_FILE = join(__dirname, 'logs', `price-update-${new Date().toISOString().slice(0,10)}.log`);
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const formatted = `[${timestamp}] ${type.toUpperCase()}: ${message}`;
  console.log(formatted);
  logStream.write(formatted + '\n');
}

// ============================================================
// DATABASE SETUP
// ============================================================
log(`📁 Using database: ${DB_PATH}`, 'info');
if (!fs.existsSync(DB_PATH)) {
  log(`❌ Database file not found at ${DB_PATH}`, 'error');
  process.exit(1);
}

const db = new Database(DB_PATH);

// Create coin_prices table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS coin_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    coin_id TEXT UNIQUE,
    coin_name TEXT,
    symbol TEXT,
    price_usd REAL,
    price_btc REAL,
    market_cap REAL,
    volume_24h REAL,
    price_change_24h REAL,
    captured_at TEXT,
    created_at TEXT,
    source TEXT
  );
`);

// ============================================================
// FETCH ALL COINS FROM COINGECKO (paginated)
// ============================================================
async function fetchAllCoinsFromCoinGecko() {
  log(`📡 Fetching coin list from CoinGecko (max: ${COINGECKO_MAX})...`, 'info');
  try {
    const allCoins = [];
    let page = 1;
    const perPage = 500; 
    
    while (allCoins.length < COINGECKO_MAX) {
      const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${perPage}&page=${page}&sparkline=false`;
      const response = await axios.get(url);
      const coins = response.data;
      
      if (coins.length === 0) break;
      
      allCoins.push(...coins);
      log(`  ✓ CG: fetched ${coins.length} coins (total: ${allCoins.length})`, 'debug');
      
      if (coins.length < perPage) break;
      page++;
      await sleep(DELAY_MS);
    }
    
    log(`✅ Found ${allCoins.length} coins from CoinGecko`, 'info');
    return allCoins;
  } catch (err) {
    log(`❌ Failed to fetch from CoinGecko: ${err.message}`, 'error');
    return [];
  }
}

// ============================================================
// FETCH ALL COINS FROM CMC (paginated)
// ============================================================
async function fetchAllCoinsFromCMC() {
  if (!CMC_API_KEY) {
    log('⚠️ CMC_API_KEY not set – skipping CMC.', 'warn');
    return {};
  }
  
  log(`📡 Fetching coin list from CoinMarketCap (max: ${CMC_MAX})...`, 'info');
  try {
    let allCoins = {};
    let start = 1;
    const limit = 50000;
    let totalFetched = 0;
    
    while (totalFetched < CMC_MAX) {
      const url = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?start=${start}&limit=${limit}&convert=USD`;
      const response = await axios.get(url, {
        headers: { 'X-CMC_PRO_API_KEY': CMC_API_KEY }
      });
      
      if (response.data.status.error_code !== 0) {
        throw new Error(`CMC API error: ${response.data.status.error_message}`);
      }
      
      const data = response.data.data;
      if (data.length === 0) break;
      
      for (const coin of data) {
        // Use symbol as key, but store coin_id too
        allCoins[coin.symbol] = {
          id: coin.id,
          name: coin.name,
          symbol: coin.symbol,
          quote: coin.quote.USD,
          cmc_id: coin.id,
        };
      }
      
      totalFetched += data.length;
      log(`  ✓ CMC: fetched ${data.length} coins (total: ${totalFetched})`, 'debug');
      
      if (data.length < limit) break;
      start += limit;
      await sleep(DELAY_MS);
    }
    
    log(`✅ Found ${Object.keys(allCoins).length} coins from CMC`, 'info');
    return allCoins;
  } catch (err) {
    log(`❌ Failed to fetch from CMC: ${err.message}`, 'error');
    return {};
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// UPDATE DATABASE – with deduplication
// ============================================================
async function updateDatabase(cgCoins, cmcCoins) {
  log('🔄 Updating database...', 'info');
  
  // First, get the current BTC price for price_btc calculation
  const btcCoin = cgCoins.find(c => c.id === 'bitcoin');
  const btcPrice = btcCoin?.current_price || 1;
  
  // Track which coin_ids we've processed (for deduplication)
  const processedCoins = new Set();
  let updatedCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  let cmcCount = 0;
  let cgCount = 0;

  // Prepare statements
  const deleteStmt = db.prepare(`DELETE FROM coin_prices WHERE coin_id = @coin_id`);
  const insertStmt = db.prepare(`
    INSERT INTO coin_prices (
      coin_id, coin_name, symbol, price_usd, price_btc,
      market_cap, volume_24h, price_change_24h,
      captured_at, created_at, source
    ) VALUES (
      @coin_id, @coin_name, @symbol, @price_usd, @price_btc,
      @market_cap, @volume_24h, @price_change_24h,
      @captured_at, 
      COALESCE((SELECT created_at FROM coin_prices WHERE coin_id = @coin_id), @created_at),
      @source
    )
  `);

  const now = new Date().toISOString();

  // Process CMC coins first (priority)
  log('  Processing CMC coins...', 'debug');
  for (const [symbol, cmcCoin] of Object.entries(cmcCoins)) {
    const coin_id = cmcCoin.symbol.toLowerCase(); // Use symbol as coin_id
    const coin_name = cmcCoin.name;
    const quote = cmcCoin.quote;
    
    // Skip if already processed (duplicate)
    if (processedCoins.has(coin_id)) {
      skippedCount++;
      continue;
    }
    
    const price_usd = quote.price || null;
    if (price_usd === null) continue;
    
    const price_btc = price_usd / btcPrice;
    
    try {
      deleteStmt.run({ coin_id });
      insertStmt.run({
        coin_id,
        coin_name,
        symbol: symbol.toUpperCase(),
        price_usd,
        price_btc,
        market_cap: quote.market_cap || null,
        volume_24h: quote.volume_24h || null,
        price_change_24h: quote.percent_change_24h || null,
        captured_at: now,
        created_at: now,
        source: 'cmc',
      });
      processedCoins.add(coin_id);
      cmcCount++;
      updatedCount++;
    } catch (err) {
      log(`  ❌ DB error for ${symbol}: ${err.message}`, 'error');
      errorCount++;
    }
  }

  // Then process CoinGecko coins (only if not already processed by CMC)
  log('  Processing CoinGecko coins (skipping duplicates)...', 'debug');
  for (const cgCoin of cgCoins) {
    const coin_id = cgCoin.id;
    const symbol = cgCoin.symbol.toUpperCase();
    const coin_name = cgCoin.name;
    
    // Skip if already processed by CMC
    if (processedCoins.has(coin_id)) {
      skippedCount++;
      continue;
    }
    
    const price_usd = cgCoin.current_price || null;
    if (price_usd === null) continue;
    
    const price_btc = price_usd / btcPrice;
    
    try {
      deleteStmt.run({ coin_id });
      insertStmt.run({
        coin_id,
        coin_name,
        symbol,
        price_usd,
        price_btc,
        market_cap: cgCoin.market_cap || null,
        volume_24h: cgCoin.total_volume || null,
        price_change_24h: cgCoin.price_change_percentage_24h || null,
        captured_at: now,
        created_at: now,
        source: 'coingecko',
      });
      processedCoins.add(coin_id);
      cgCount++;
      updatedCount++;
    } catch (err) {
      log(`  ❌ DB error for ${symbol}: ${err.message}`, 'error');
      errorCount++;
    }
    
    // Log progress every 50 coins
    if (updatedCount % 50 === 0) {
      log(`  ✅ Processed ${updatedCount} coins total...`, 'debug');
    }
  }

  log(`✅ Updated ${updatedCount} coins (CMC: ${cmcCount}, CG: ${cgCount}, Skipped duplicates: ${skippedCount}, Errors: ${errorCount})`, 'info');
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  log('🔄 Starting full price update...', 'info');

  // Ensure logs directory exists
  if (!fs.existsSync(join(__dirname, 'logs'))) {
    fs.mkdirSync(join(__dirname, 'logs'));
  }

  // Fetch from both sources in parallel
  const [cgCoins, cmcCoins] = await Promise.all([
    fetchAllCoinsFromCoinGecko(),
    fetchAllCoinsFromCMC(),
  ]);

  if (cgCoins.length === 0 && Object.keys(cmcCoins).length === 0) {
    log('❌ No coins fetched from any source. Aborting.', 'error');
    process.exit(1);
  }

  // Update database
  await updateDatabase(cgCoins, cmcCoins);

  // Clean up
  db.close();
  log(`📄 Log saved to ${LOG_FILE}`, 'info');
  log('🏁 Update complete.', 'info');
}

// ============================================================
// RUN SCRIPT
// ============================================================
main().catch(err => {
  log(`💥 Unhandled error: ${err.message}`, 'error');
  process.exit(1);
});