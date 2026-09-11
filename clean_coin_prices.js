import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

(async () => {
  // Adjust the path to your actual SQLite file
    const dbPath = path.join(__dirname, 'data', 'mining_training.db');  
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // For TEXT timestamp column:
  const result = await db.run(
    "DELETE FROM mining_training_snapshots WHERE created_at < datetime('now', '-7 days')"
  );
  
  // For INTEGER (Unix) timestamp column:
  // const cutoff = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
  // const result = await db.run('DELETE FROM coin_prices WHERE timestamp < ?', cutoff);

  console.log(`✅ Deleted ${result.changes} records older than 7 days.`);
  await db.close();
})();