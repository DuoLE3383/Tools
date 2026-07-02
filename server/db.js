// server/database/db.js – Unified database using stats.db
import path from "path";
import fs from "node:fs/promises";
import sqlite3 from "sqlite3";

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'stats.db'); 
let opportunityDb = null;
let dbInitPromise = null;

export async function getTrendDb() {
  if (opportunityDb) return opportunityDb;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = (async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const db = await new Promise((resolve, reject) => {
      const d = new sqlite3.Database(DB_PATH, (err) => {
        if (err) return reject(err);
        resolve(d);
      });
    });

    await run(db, "PRAGMA journal_mode = WAL");
    await run(db, "PRAGMA synchronous = NORMAL");
    await run(db, "PRAGMA cache_size = 10000");

    opportunityDb = db;
    return db;
  })();
  return dbInitPromise;
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
export let db = null;
export function setDb(dbInstance) { db = dbInstance; }