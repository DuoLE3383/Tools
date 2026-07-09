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
    await db.run(`CREATE TABLE IF NOT EXISTS ${tableName} (${columnDefs})`);
    await db.run('BEGIN TRANSACTION');
    const stmt = await db.prepare(`INSERT OR REPLACE INTO ${tableName} (${quotedColumns.join(", ")}) VALUES (${placeholders})`);
    for (const item of items) {
      const values = columns.map(c => {
        const v = item[c];
        return typeof v === "object" ? JSON.stringify(v) : String(v ?? "");
      });
      await stmt.run(values);
    }
    await stmt.finalize();
    await db.run('COMMIT');
  } catch (err) {
    console.error(`[db] Failed to save to ${tableName}:`, err.message);
  }
}
