// ==========================
//  DB-UTILS
//  Shared database helpers for MRR modules
// ==========================

import { getDb } from '../db.js';

/**
 * Execute a SQL query that returns a single row.
 */
export async function dbGetAsync(sql, params = []) {
  const db = await getDb();
  return db.get(sql, params);
}

/**
 * Execute a SQL query that modifies data (INSERT/UPDATE/DELETE).
 */
export async function dbRunAsync(sql, params = []) {
  const db = await getDb();
  return db.run(sql, params);
}

/**
 * Execute a SQL query that returns multiple rows.
 */
export async function dbAllAsync(sql, params = []) {
  const db = await getDb();
  return db.all(sql, params);
}
