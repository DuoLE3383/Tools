// server/update-schema.js
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.resolve(process.cwd(), 'data', 'trends.db');

// Ensure the data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH);

// Enable WAL for better concurrency
db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA synchronous = NORMAL');

// Helper to check if a column exists
function columnExists(table, column) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${table})`, (err, rows) => {
      if (err) reject(err);
      else resolve(rows.some(r => r.name === column));
    });
  });
}

// Helper to run a single ALTER
function addColumn(table, column, type, defaultValue = null) {
  const defaultClause = defaultValue !== null ? ` DEFAULT ${defaultValue}` : '';
  return new Promise((resolve, reject) => {
    db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}${defaultClause}`, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function migrate() {
  console.log('🔄 Running database schema update...');
  try {
    // 1. Ensure the mining_opportunities table exists (minimal)
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS mining_opportunities (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          algo TEXT NOT NULL,
          captured_at TEXT NOT NULL,
          pool_btc_per_day REAL DEFAULT 0,
          nh_price_btc REAL DEFAULT 0,
          mrr_price_btc REAL DEFAULT 0,
          spread_pct REAL DEFAULT 0,
          pool_miners INTEGER DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => { if (err) reject(err); else resolve(); });
    });

    // 2. Add missing columns
    const columnsToAdd = {
      profit_status: { type: 'TEXT', default: "'neutral'" },
      trend_direction: { type: 'TEXT', default: "'stable'" },
      coin_name: { type: 'TEXT', default: null },
      coin_id: { type: 'TEXT', default: null },
      coin_prices_json: { type: 'TEXT', default: null },
      summary_json: { type: 'TEXT', default: null },
      spread_vs_mrr: { type: 'REAL', default: '0' }
    };

    for (const [col, config] of Object.entries(columnsToAdd)) {
      const exists = await columnExists('mining_opportunities', col);
      if (!exists) {
        const defaultClause = config.default !== null ? ` DEFAULT ${config.default}` : '';
        await new Promise((resolve, reject) => {
          db.run(`ALTER TABLE mining_opportunities ADD COLUMN ${col} ${config.type}${defaultClause}`, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        console.log(`✅ Added column: ${col}`);
      } else {
        console.log(`⏩ Column ${col} already exists.`);
      }
    }

    // 3. Ensure coin_prices table exists with needed columns
    await new Promise((resolve, reject) => {
      db.run(`
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
        )
      `, (err) => { if (err) reject(err); else resolve(); });
    });

    // 4. Ensure coin_metadata table
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS coin_metadata (
          coin_id TEXT PRIMARY KEY,
          coin_name TEXT,
          symbol TEXT,
          last_updated TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => { if (err) reject(err); else resolve(); });
    });

    // 5. Create indexes if needed
    await new Promise((resolve, reject) => {
      db.run(`CREATE INDEX IF NOT EXISTS idx_opp_algo_time ON mining_opportunities(algo, captured_at)`, (err) => { if (err) reject(err); else resolve(); });
    });
    await new Promise((resolve, reject) => {
      db.run(`CREATE INDEX IF NOT EXISTS idx_opp_status ON mining_opportunities(profit_status, captured_at)`, (err) => { if (err) reject(err); else resolve(); });
    });
    await new Promise((resolve, reject) => {
      db.run(`CREATE INDEX IF NOT EXISTS idx_coin_prices_coin ON coin_prices(coin_id, captured_at)`, (err) => { if (err) reject(err); else resolve(); });
    });

    console.log('✅ Schema update completed successfully.');
    db.close();
  } catch (err) {
    console.error('❌ Schema update failed:', err);
    db.close();
    process.exit(1);
  }
}

migrate();