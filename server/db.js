// server/database/db.js – Unified database using stats.db
import path from "path";
import fs from "node:fs/promises";
import sqlite3 from "sqlite3";

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'stats.db'); 
let db = null;
let dbInitPromise = null;

export async function getDb() {
  if (db) return db;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = (async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const db = await new Promise((resolve, reject) => {
      const d = new sqlite3.Database(DB_PATH, (err) => {
        if (err) return reject(err);
        resolve(d);
      });
    });

    await run(db, "PRAGMA journal_mode = WAL"); // nosemgrep: javascript.lang.security.audit.non-literal-sql-db-access.non-literal-sql-db-access
    await run(db, "PRAGMA synchronous = NORMAL"); // nosemgrep: javascript.lang.security.audit.non-literal-sql-db-access.non-literal-sql-db-access
    await run(db, "PRAGMA cache_size = 10000"); // nosemgrep: javascript.lang.security.audit.non-literal-sql-db-access.non-literal-sql-db-access

    // Create tables with all columns upfront
    await run(db, `CREATE TABLE IF NOT EXISTS mining_opportunities (
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
    )`);

    await run(db, `CREATE TABLE IF NOT EXISTS coin_prices (
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
    )`);

    await run(db, `CREATE TABLE IF NOT EXISTS coin_metadata (
      coin_id TEXT PRIMARY KEY,
      coin_name TEXT,
      symbol TEXT,
      last_updated TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    await run(db, `CREATE INDEX IF NOT EXISTS idx_opp_algo_time ON mining_opportunities(algo, captured_at)`); // nosemgrep: javascript.lang.security.audit.non-literal-sql-db-access.non-literal-sql-db-access
    await run(db, `CREATE INDEX IF NOT EXISTS idx_opp_status ON mining_opportunities(profit_status, captured_at)`); // nosemgrep: javascript.lang.security.audit.non-literal-sql-db-access.non-literal-sql-db-access
    await run(db, `CREATE INDEX IF NOT EXISTS idx_opp_coin ON mining_opportunities(coin_id, captured_at)`); // nosemgrep: javascript.lang.security.audit.non-literal-sql-db-access.non-literal-sql-db-access
    await run(db, `CREATE INDEX IF NOT EXISTS idx_coin_prices_coin ON coin_prices(coin_id, captured_at)`); // nosemgrep: javascript.lang.security.audit.non-literal-sql-db-access.non-literal-sql-db-access
    await run(db, `CREATE INDEX IF NOT EXISTS idx_coin_prices_time ON coin_prices(captured_at)`); // nosemgrep: javascript.lang.security.audit.non-literal-sql-db-access.non-literal-sql-db-access

    // Ensure any missing columns (if table existed before this code)
    await ensureMissingColumns(db);

    setDb(db);
    return db;
  })();
  return dbInitPromise;
}

// Helper to add missing columns without recursion
async function ensureMissingColumns(db) {
  const columns = await all(db, "PRAGMA table_info(mining_opportunities)"); // nosemgrep: javascript.lang.security.audit.non-literal-sql-db-access.non-literal-sql-db-access
  const existing = new Set(columns.map(c => c.name));

  const toAdd = {
    profit_status: "TEXT DEFAULT 'neutral'",
    trend_direction: "TEXT DEFAULT 'stable'",
    coin_name: "TEXT",
    coin_id: "TEXT",
    coin_prices_json: "TEXT",
    summary_json: "TEXT",
    spread_vs_mrr: "REAL DEFAULT 0"
  };

  let added = 0;
  for (const [col, definition] of Object.entries(toAdd)) {
    if (!existing.has(col)) {
      await run(db, `ALTER TABLE mining_opportunities ADD COLUMN ${col} ${definition}`); // nosemgrep: javascript.lang.security.audit.non-literal-sql-db-access.non-literal-sql-db-access
      added++;
    }
  }
  if (added > 0) console.log(`[DB] Added ${added} missing column(s) to mining_opportunities.`);
}

export function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

export function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

// Legacy exports for backward compatibility
let legacyDb = null;
function setDb(dbInstance) { 
  db = dbInstance;
  legacyDb = dbInstance;
}
export { legacyDb as db, setDb, getDb as getTrendDb };