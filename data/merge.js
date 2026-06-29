// data/merge.js
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../data');
const TARGET_DB = path.join(DATA_DIR, 'stats.db');

// ─── Ensure target schema exists ──────────────────────────────────────
async function ensureTargetSchema() {
  const db = new sqlite3.Database(TARGET_DB);
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA synchronous = NORMAL');

  const createTables = `
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
    CREATE TABLE IF NOT EXISTS coin_metadata (
      coin_id TEXT PRIMARY KEY,
      coin_name TEXT,
      symbol TEXT,
      last_updated TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_opp_algo_time ON mining_opportunities(algo, captured_at);
    CREATE INDEX IF NOT EXISTS idx_opp_status ON mining_opportunities(profit_status, captured_at);
    CREATE INDEX IF NOT EXISTS idx_coin_prices_coin ON coin_prices(coin_id, captured_at);
  `;

  await new Promise((resolve, reject) => {
    db.exec(createTables, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  // Add any missing columns (safety)
  const columns = await new Promise((resolve, reject) => {
    db.all("PRAGMA table_info(mining_opportunities)", (err, rows) => {
      if (err) reject(err);
      else resolve(rows.map(r => r.name));
    });
  });
  const existing = new Set(columns);
  const toAdd = {
    profit_status: "TEXT DEFAULT 'neutral'",
    trend_direction: "TEXT DEFAULT 'stable'",
    coin_name: "TEXT",
    coin_id: "TEXT",
    coin_prices_json: "TEXT",
    summary_json: "TEXT",
    spread_vs_mrr: "REAL DEFAULT 0"
  };
  for (const [col, def] of Object.entries(toAdd)) {
    if (!existing.has(col)) {
      await new Promise((resolve, reject) => {
        db.run(`ALTER TABLE mining_opportunities ADD COLUMN ${col} ${def}`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }
  db.close();
}

// ─── Helper to get column names ──────────────────────────────────────
function getTableColumns(db, table) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${table})`, (err, rows) => {
      if (err) reject(err);
      else resolve(rows.map(r => r.name));
    });
  });
}

// ─── Merge all databases ─────────────────────────────────────────────
export async function mergeDatabases() {
  console.log(`📂 Target database: ${TARGET_DB}`);
  await ensureTargetSchema();
  console.log('✅ Target schema is ready.');

  const files = fs.readdirSync(DATA_DIR)
    .filter(f => f.endsWith('.db') && f !== 'stats.db' && f !== 'mining_training.db')
    .map(f => path.join(DATA_DIR, f));

  if (files.length === 0) {
    console.log('No other databases to merge.');
    return;
  }

  const target = new sqlite3.Database(TARGET_DB);
  target.run('PRAGMA foreign_keys=OFF');

  for (const srcFile of files) {
    console.log(`\n🔄 Merging ${path.basename(srcFile)}...`);
    const src = new sqlite3.Database(srcFile);

    // Attach source database
    await new Promise((resolve, reject) => {
      target.run(`ATTACH DATABASE '${srcFile}' AS src`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Get tables from source
    const tables = await new Promise((resolve, reject) => {
      src.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(r => r.name));
      });
    });

    if (tables.length === 0) {
      console.log(`  ⚠️ No tables found.`);
    }

    for (const table of tables) {
      try {
        // Get source columns
        const srcCols = await getTableColumns(src, table);
        if (srcCols.length === 0) continue;

        // Check if target has this table
        const targetHas = await new Promise((resolve, reject) => {
          target.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`, (err, row) => {
            if (err) reject(err);
            else resolve(!!row);
          });
        });
        if (!targetHas) {
          // Create table in target (simple: just create with columns from source)
          const colDefs = srcCols.map(c => `"${c}" TEXT`).join(', ');
          await new Promise((resolve, reject) => {
            target.run(`CREATE TABLE main.${table} (${colDefs})`, (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
        }

        // Get target columns
        const tgtCols = await getTableColumns(target, table);
        // Intersection: columns that exist in both
        const commonCols = srcCols.filter(c => tgtCols.includes(c));
        if (commonCols.length === 0) {
          console.log(`  ⚠️ No common columns for ${table}, skipping`);
          continue;
        }

        // Build INSERT with column list
        const colList = commonCols.map(c => `"${c}"`).join(', ');
        const insertSql = `INSERT OR IGNORE INTO main.${table} (${colList}) SELECT ${colList} FROM src.${table}`;
        await new Promise((resolve, reject) => {
          target.run(insertSql, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        console.log(`  ✅ Copied table ${table} (${commonCols.length} columns)`);
      } catch (err) {
        console.error(`  ❌ Failed to copy table ${table}: ${err.message}`);
      }
    }

    // Detach source
    await new Promise((resolve) => {
      target.run(`DETACH DATABASE src`, resolve);
    });

    // Close source connection
    src.close();

    // Delete source files after a short delay
    const base = srcFile.replace('.db', '');
    await new Promise(resolve => setTimeout(resolve, 300));
    for (const ext of ['.db', '.db-wal', '.db-shm']) {
      const f = base + ext;
      if (fs.existsSync(f)) {
        try {
          fs.unlinkSync(f);
          console.log(`  🗑️ Deleted ${path.basename(f)}`);
        } catch (err) {
          console.warn(`  ⚠️ Could not delete ${path.basename(f)}: ${err.message}`);
        }
      }
    }
  }

  target.close();
  console.log('\n✅ All databases merged into stats.db');
}

// ─── If run directly ──────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  mergeDatabases().catch(err => {
    console.error('❌ Merge failed:', err.message);
    process.exit(1);
  });
}