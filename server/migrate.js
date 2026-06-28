// migrate.js
import fs from 'node:fs'; 
import path from 'path';
import fg from 'fast-glob';
import XLSX from 'xlsx';
import sqlite3 from 'sqlite3';

const PROJECT_ROOT = process.cwd();
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'stats.db'); // 

// ─── Direct DB connection ────────────────────────────────────────────────
let db = null;

function getDb() {
  if (db) return db;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  db = new sqlite3.Database(DB_PATH);
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA synchronous = NORMAL');
  return db;
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// ─── Schema migration ────────────────────────────────────────────────────
async function ensureSchema() {
  console.log('[migrate] Ensuring database schema...');

  await run(`
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
  `);

  const columns = await all("PRAGMA table_info(mining_opportunities)");
  const existing = new Set(columns.map(c => c.name));

  const toAdd = {
    profit_status: { type: 'TEXT', default: "'neutral'" },
    trend_direction: { type: 'TEXT', default: "'stable'" },
    coin_name: { type: 'TEXT', default: null },
    coin_id: { type: 'TEXT', default: null },
    coin_prices_json: { type: 'TEXT', default: null },
    summary_json: { type: 'TEXT', default: null },
    spread_vs_mrr: { type: 'REAL', default: '0' }
  };

  for (const [col, config] of Object.entries(toAdd)) {
    if (!existing.has(col)) {
      const defaultClause = config.default !== null ? ` DEFAULT ${config.default}` : '';
      await run(`ALTER TABLE mining_opportunities ADD COLUMN ${col} ${config.type}${defaultClause}`);
      console.log(`  ✅ Added column: ${col}`);
    }
  }

  await run(`
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
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS coin_metadata (
      coin_id TEXT PRIMARY KEY,
      coin_name TEXT,
      symbol TEXT,
      last_updated TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run('CREATE INDEX IF NOT EXISTS idx_opp_algo_time ON mining_opportunities(algo, captured_at)');
  await run('CREATE INDEX IF NOT EXISTS idx_opp_status ON mining_opportunities(profit_status, captured_at)');
  await run('CREATE INDEX IF NOT EXISTS idx_coin_prices_coin ON coin_prices(coin_id, captured_at)');

  console.log('[migrate] ✅ Schema is up to date.');
}

// ─── File migration ──────────────────────────────────────────────────────
async function migrateFiles() {
  console.log('[migrate] Scanning for CSV/XLSX files...');

  // Use sync glob for simplicity
  const files = fg.sync(
    ['*.csv', '*.xlsx', 'worker/*.csv', 'worker/*.xlsx'],
    { cwd: PROJECT_ROOT, absolute: true, ignore: ['data/**', 'node_modules/**'] }
  );

  if (files.length === 0) {
    console.log('[migrate] No CSV or XLSX files found.');
    return;
  }

  console.log(`[migrate] Found ${files.length} file(s).`);
  const migratedDir = path.join(DATA_DIR, 'migrated');
  if (!fs.existsSync(migratedDir)) {
    fs.mkdirSync(migratedDir, { recursive: true });
  }

  for (const filePath of files) {
    const filename = path.basename(filePath);
    const tableName = filename.replace(/\.[^.]+$/, '').replace(/-/g, '_');

    try {
      console.log(`[migrate] Processing ${filename}...`);
      const workbook = XLSX.readFile(filePath);
      const sheet = workbook.SheetNames[0];
      if (!sheet) {
        console.warn(`[migrate] ${filename} has no sheets. Skipping.`);
        continue;
      }
      const items = XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { raw: false, defval: '' });

      if (!items || items.length === 0) {
        console.warn(`[migrate] ${filename} is empty. Skipping.`);
        continue;
      }

      let columns = Object.keys(items[0]);
      if (tableName === 'nh_order') {
        const master = ['id', 'acceptedCurrentSpeed', 'algorithmSpeed', 'niceAdvertisedHashrate',
          'poolName', 'poolHost', 'poolPort', 'algorithm', 'market', 'price',
          'limit', 'payedAmount', 'availableAmount', 'rigsCount', 'poolUser',
          'poolPass', 'status', 'isDead', 'pool', 'nhClient', 'ts'];
        columns = Array.from(new Set([...master, ...columns]));
      }

      const columnDefs = columns.map(c => `"${c}" TEXT`).join(', ');
      await run(`CREATE TABLE IF NOT EXISTS ${tableName} (${columnDefs})`);

      const placeholders = columns.map(() => '?').join(', ');
      const insertSql = `INSERT OR IGNORE INTO ${tableName} (${columns.map(c => `"${c}"`).join(',')}) VALUES (${placeholders})`;

      for (const item of items) {
        const values = columns.map(c => {
          const v = item[c];
          return typeof v === 'object' ? JSON.stringify(v) : String(v ?? '');
        });
        await run(insertSql, values);
      }

      console.log(`  ✅ Imported ${items.length} rows into "${tableName}".`);
      fs.renameSync(filePath, path.join(migratedDir, filename));
      console.log(`  📦 Moved ${filename} to data/migrated/`);
    } catch (err) {
      console.error(`  ❌ Failed: ${filename} — ${err.message}`);
    }
  }
}

// ─── Main ──────────────────────────────────────────────────────────────
async function main() {
  try {
    await ensureSchema();
    await migrateFiles();
    console.log('[migrate] ✅ All done.');
  } catch (err) {
    console.error('[migrate] ❌ Error:', err.message);
    process.exit(1);
  } finally {
    if (db) db.close();
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────
export async function migrateOldCsvToDb() {
  await ensureSchema();
  await migrateFiles();
  console.log('[migrate] ✅ All done.');
}

// Run when executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}