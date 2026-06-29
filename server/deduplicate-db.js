import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

// --- Database Connection ---
// Standalone scripts need to initialize their own DB connection.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'data', 'stats.db');

let db = null;
function getDb() {
  if (!db) {
    db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE);
  }
  return db;
}

// Promisify db methods for async/await usage
const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    getDb().run(sql, params, function(err) {
      if (err) return reject(err);
      resolve(this); // 'this' contains 'changes' and 'lastID'
    });
  });
};

const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
};

/**
 * Deduplicates a table by keeping only the latest entry for each key.
 * @param {string} tableName The name of the table to deduplicate.
 * @param {string} keyColumn The column to partition by (e.g., 'symbol', 'coin_id').
 * @param {string} timestampColumn The column to order by to find the latest entry.
 */
async function deduplicateTable(tableName, keyColumn, timestampColumn) {
  console.log(`[DB] Starting deduplication for table: ${tableName}...`);

  // For coin_prices, we need to consider both coin_id and symbol to catch all duplicates
  const partitionKey = Array.isArray(keyColumn)
    ? keyColumn.map(col => `UPPER(${col})`).join(', ')
    : `UPPER(${keyColumn})`;

  try {
    // Step 1: Find the rowids of the records to keep.
    // We partition by the key column and find the latest record using the timestamp.
    const queryToKeep = `
      SELECT
        rowid
      FROM (
        SELECT
          rowid,
          ROW_NUMBER() OVER(PARTITION BY ${partitionKey} ORDER BY ${timestampColumn} DESC) as rn
        FROM ${tableName}
      )
      WHERE rn = 1
    `;

    const rowsToKeep = await dbAll(queryToKeep);
    const idsToKeep = rowsToKeep.map(r => r.rowid);

    if (idsToKeep.length === 0) {
      console.log(`[DB] No records found in ${tableName}. Nothing to do.`);
      return;
    }

    // Step 2: Find the total number of rows before deletion for statistics.
    const countResult = await dbAll(`SELECT COUNT(*) as count FROM ${tableName}`);
    const initialCount = countResult[0].count;

    // Step 3: Delete all rows that are NOT in our "keep" list.
    const queryToDelete = `
      DELETE FROM ${tableName}
      WHERE rowid NOT IN (${idsToKeep.map(() => '?').join(',')})
    `;

    const result = await dbRun(queryToDelete, idsToKeep);
    const deletedCount = result.changes || 0;
    const finalCount = initialCount - deletedCount;

    console.log(`[DB] Deduplication of ${tableName} complete.`);
    console.log(`  - Initial rows: ${initialCount}`);
    console.log(`  - Rows kept:    ${finalCount}`);
    console.log(`  - Rows deleted:   ${deletedCount}`);

  } catch (err) {
    console.error(`[DB] Error deduplicating table ${tableName}: ${err.message}`);
    // Check if the error is due to a missing table or column
    if (/no such table|no such column/.test(err.message)) {
      console.warn(`[DB] Skipping ${tableName} as it or its columns might not exist.`);
    }
  }
}

/**
 * Main function to run all deduplication tasks.
 */
async function runDeduplication() {
  console.log('[DB] Starting database deduplication process...');
  
  // Configuration for each table to be deduplicated
  const tablesToProcess = [
    {
      tableName: 'coin_prices',
      keyColumn: ['coin_id', 'symbol'], // Use a composite key for better duplicate detection
      timestampColumn: 'captured_at'
    },
    {
      tableName: 'cmc_coins',
      keyColumn: 'symbol',
      timestampColumn: 'last_updated'
    },
    {
      tableName: 'coingecko_coins',
      keyColumn: 'id',
      timestampColumn: 'last_updated'
    }
  ];

  for (const config of tablesToProcess) {
    await deduplicateTable(config.tableName, config.keyColumn, config.timestampColumn);
    console.log('---');
  }

  console.log('[DB] Database deduplication process finished.');

  // Close the database connection
  if (db) {
    db.close((err) => {
      if (err) {
        console.error('[DB] Error closing the database:', err.message);
      } else {
        console.log('[DB] Database connection closed.');
      }
    });
  }
}

// Execute the script
runDeduplication();