// server/db.js – Centralized database module
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from "path";
import fs from "node:fs/promises";

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'stats.db');

let dbInstance = null;
let dbInitPromise = null;

/**
 * Initializes all application tables in a single transaction.
 * @param {import('sqlite').Database} db - The database instance.
 */
async function initTables(db) {
  await db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA synchronous = NORMAL;
    PRAGMA cache_size = -20000;

    CREATE TABLE IF NOT EXISTS stats_cache (
      key TEXT PRIMARY KEY, 
      data TEXT, 
      ts INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_stats_cache_ts ON stats_cache(ts);

    CREATE TABLE IF NOT EXISTS api_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT, 
      source TEXT, 
      content_type TEXT, 
      content TEXT
    );

    CREATE TABLE IF NOT EXISTS mrr_nonces (
      client TEXT PRIMARY KEY, 
      last_nonce TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY, 
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS coin_metadata (
      coin_id TEXT PRIMARY KEY,
      coin_name TEXT,
      symbol TEXT,
      last_updated TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS mining_opportunities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      algo TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      pool_btc_per_day REAL DEFAULT 0,
      nh_price_btc REAL DEFAULT 0,
      mrr_price_btc REAL DEFAULT 0,
      spread_pct REAL DEFAULT 0,
      spread_vs_mrr REAL DEFAULT 0,
      pool_miners INTEGER DEFAULT 0,
      profit_status TEXT DEFAULT 'neutral',
      trend_direction TEXT DEFAULT 'stable',
      coin_name TEXT,
      coin_id TEXT,
      coin_prices_json TEXT,
      summary_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_opp_algo_time ON mining_opportunities(algo, captured_at);
    CREATE INDEX IF NOT EXISTS idx_opp_status ON mining_opportunities(profit_status, captured_at);
    CREATE INDEX IF NOT EXISTS idx_opp_coin ON mining_opportunities(coin_id, captured_at);

    CREATE TABLE IF NOT EXISTS coin_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coin_id TEXT NOT NULL,
      coin_name TEXT,
      symbol TEXT,
      price_usd REAL,
      price_btc REAL,
      market_cap REAL,
      volume_24h REAL,
      price_change_24h REAL,
      captured_at TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(coin_id, captured_at)
    );
    CREATE INDEX IF NOT EXISTS idx_coin_prices_coin ON coin_prices(coin_id, captured_at);
    CREATE INDEX IF NOT EXISTS idx_coin_prices_time ON coin_prices(captured_at);

    CREATE TABLE IF NOT EXISTS rentals (
      id TEXT PRIMARY KEY, 
      name TEXT, 
      client TEXT, 
      start_time INTEGER, 
      end_time INTEGER, 
      algo TEXT,
      target_100 REAL, 
      order_diff REAL, 
      last_updated INTEGER, 
      last_notified INTEGER,
      low_hashrate_start INTEGER, 
      zero_hashrate_start INTEGER, 
      current_hashrate TEXT,
      average_hashrate TEXT, 
      advertised_hashrate TEXT, 
      price_paid TEXT,
      is_real INTEGER DEFAULT 1,
      ghost_reason TEXT
    );

    CREATE TABLE IF NOT EXISTS rental_history (
      id TEXT PRIMARY KEY, 
      start_time INTEGER
    );

    CREATE TABLE IF NOT EXISTS ghost_rentals_log (
      id TEXT PRIMARY KEY,
      name TEXT,
      client TEXT,
      detected_at INTEGER,
      reason TEXT,
      cleaned_up INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS nh_pools (
      id TEXT,
      name TEXT,
      algorithm TEXT,
      stratumHostname TEXT,
      port TEXT,
      username TEXT,
      password TEXT,
      nhClient TEXT,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id, nhClient)
    );

    CREATE TABLE IF NOT EXISTS mrr_pools (
      id TEXT,
      name TEXT,
      algo TEXT,
      host TEXT,
      port TEXT,
      user TEXT,
      mrrClient TEXT,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id, mrrClient)
    );

    CREATE TABLE IF NOT EXISTS mrr_rig_logs (
      timestamp TEXT, 
      client TEXT, 
      endpoint TEXT
    );
  `);
}

/**
 * Gets a singleton promise-based database instance.
 * @returns {Promise<import('sqlite').Database>}
 */
export async function getDb() {
  if (dbInstance) return dbInstance;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = (async () => {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const db = await open({
        filename: DB_PATH,
        driver: sqlite3.Database,
      });
      console.log('[Database] Connected successfully to stats.db');
      await initTables(db);
      console.log('[Database] All tables initialized.');
      dbInstance = db;
      return db;
    } catch (error) {
      console.error('[Database] Connection or initialization error:', error);
      dbInitPromise = null; // Reset promise on failure
      throw error;
    }
  })();
  return dbInitPromise;
}