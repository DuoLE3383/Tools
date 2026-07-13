// server/routes/_helpers.js
import { getDb } from "../db.js";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), "data");

export async function saveToDatabase(filename, items) {
  if (!items || !Array.isArray(items) || items.length === 0) return;
  const tableName = filename.replace(".csv", "").replace(/-/g, "_");
  const columns = Object.keys(items[0]);
  const quotedColumns = columns.map(c => `"${c}"`);
  const placeholders = columns.map(() => "?").join(", ");
  const columnDefs = columns.map(c => c === "id" ? '"id" TEXT PRIMARY KEY' : `"${c}" TEXT`).join(", ");
  try {
    const db = await getDb();
    // Use a unique savepoint name to allow for nesting.
    const savepointName = `save_to_${tableName}`;
    await db.run(`CREATE TABLE IF NOT EXISTS ${tableName} (${columnDefs})`);
    await db.run(`SAVEPOINT ${savepointName}`);
    const stmt = await db.prepare(`INSERT OR REPLACE INTO ${tableName} (${quotedColumns.join(", ")}) VALUES (${placeholders})`);
    for (const item of items) {
      const values = columns.map(c => {
        const v = item[c];
        return typeof v === "object" ? JSON.stringify(v) : String(v ?? "");
      });
      await stmt.run(values);
    }
    await stmt.finalize();
    await db.run(`RELEASE SAVEPOINT ${savepointName}`);
  } catch (err) {
    console.error(`[db] Failed to save to ${tableName}:`, err.message);
    try {
      const db = await getDb();
      // Rollback to the specific savepoint if the transaction was started
      await db.run(`ROLLBACK TO SAVEPOINT ${savepointName}`);
    } catch (rollbackErr) {
      // This can happen if the transaction was never started or already rolled back. It's safe to ignore.
    }
  }
}