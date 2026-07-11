// ==========================
//  RENTAL TRACKER MODULE
//  Manages rental state and database operations
// ==========================

import { getDb } from '../db.js';
import { isRealRental, validateRentals } from './rental-validator.js';

// Database helpers
async function dbGetAsync(sql, params = []) {
  const db = await getDb();
  return db.get(sql, params);
}

async function dbRunAsync(sql, params = []) {
  const db = await getDb();
  return db.run(sql, params);
}

async function dbAllAsync(sql, params = []) {
  const db = await getDb();
  return db.all(sql, params);
}

/**
 * Initialize rental database tables
 */
export async function initRentalDatabase() {
  const db = await getDb();
  // Tables are now created in db.js, but we can ensure them here if needed.
  // This function can be simplified or removed if db.js handles all table creation.
  await db.run(`CREATE TABLE IF NOT EXISTS rentals (
        id TEXT PRIMARY KEY, 
        name TEXT, 
        client TEXT, 
        start_time INTEGER, 
        end_time INTEGER, 
        algo TEXT,
        target_100 REAL, 
        order_diff REAL, 
        last_updated INTEGER, 
        last_notified INTEGER,
        low_hashrate_start INTEGER, 
        zero_hashrate_start INTEGER, 
        current_hashrate TEXT,
        average_hashrate TEXT, 
        advertised_hashrate TEXT, 
        price_paid TEXT,
        is_real INTEGER DEFAULT 1,
        ghost_reason TEXT
      )`);

  await db.run(`CREATE TABLE IF NOT EXISTS rental_history (
        id TEXT PRIMARY KEY, 
        start_time INTEGER
      )`);

  await db.run(`CREATE TABLE IF NOT EXISTS ghost_rentals (
        id TEXT PRIMARY KEY,
        name TEXT,
        client TEXT,
        detected_at INTEGER,
        reason TEXT,
        cleaned_up INTEGER DEFAULT 0
      )`);

  await db.run(`CREATE TABLE IF NOT EXISTS mrr_algos (
        id TEXT PRIMARY KEY,
        name TEXT,
        raw_data TEXT
      )`);

  await db.run("DELETE FROM rental_history WHERE start_time < ?", [Date.now() - 172800000]);
}

/**
 * Save a rental to the database
 */
export async function saveRental(rental, client, info, metrics, isValid) {
  const {
    startT, endT, displayTarget, orderDiff,
    lowHashStart, zeroHashStart, lastNotified,
    currentHash, average, advertised, paidAmount
  } = metrics;

  const ghostReason = !isValid ? 'No mining activity detected' : null;

  const db = await getDb();
  await db.run('BEGIN TRANSACTION');
  try {
    await db.run(
      `INSERT INTO rentals (
          id, name, client, start_time, end_time, algo, 
          target_100, order_diff, last_updated, low_hashrate_start, zero_hashrate_start,
          current_hashrate, average_hashrate, advertised_hashrate, price_paid, 
          last_notified, is_real, ghost_reason
        ) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET 
          name=excluded.name, client=excluded.client, algo=excluded.algo, 
          order_diff=excluded.order_diff, ghost_reason=excluded.ghost_reason,
          start_time=excluded.start_time, end_time=excluded.end_time, 
          target_100=excluded.target_100, last_updated=excluded.last_updated,
          low_hashrate_start=excluded.low_hashrate_start, 
          zero_hashrate_start=excluded.zero_hashrate_start,
          current_hashrate=excluded.current_hashrate, 
          average_hashrate=excluded.average_hashrate,
          advertised_hashrate=excluded.advertised_hashrate, 
          price_paid=excluded.price_paid, is_real=excluded.is_real`,
      [
        String(rental.id), rental.name || rental.id, client, startT, endT, info.algo,
        displayTarget, orderDiff, Date.now(), lowHashStart, zeroHashStart,
        currentHash, average, advertised, paidAmount, lastNotified,
        isValid ? 1 : 0, ghostReason
      ]
    );

    if (startT > 0 && isValid) {
      await db.run("INSERT OR IGNORE INTO rental_history (id, start_time) VALUES (?, ?)", [String(rental.id), startT]);
    }

    if (!isValid) {
      await db.run(
        `INSERT OR IGNORE INTO ghost_rentals (id, name, client, detected_at, reason) 
           VALUES (?, ?, ?, ?, ?)`,
        [String(rental.id), rental.name || rental.id, client, Date.now(), ghostReason]
      );
    }
    await db.run('COMMIT');
  } catch (err) {
    console.error(`[rental-tracker] Upsert error for ${rental.id}: ${err.message}`);
    try {
      await db.run('ROLLBACK');
    } catch (rollbackErr) {
      // Ignore rollback errors
    }
  }
}

/**
 * Get rental from database
 */
export async function getRental(rentalId) {
  try {
    return await dbGetAsync(`SELECT * FROM rentals WHERE id = ?`, [String(rentalId)]);
  } catch (err) {
    console.error(`[rental-tracker] Failed to fetch rental ${rentalId}: ${err.message}`);
    return null;
  }
}

/**
 * Get all real rentals for a client
 */
export async function getRealRentals(client) {
  try {
    return await dbAllAsync(
      `SELECT * FROM rentals WHERE client = ? AND is_real = 1`,
      [client]
    );
  } catch (err) {
    console.error(`[rental-tracker] Failed to fetch real rentals: ${err.message}`);
    return [];
  }
}

/**
 * Get all ghost rentals for a client
 */
export async function getGhostRentals(client) {
  try {
    return await dbAllAsync(
      `SELECT * FROM rentals WHERE client = ? AND is_real = 0`,
      [client]
    );
  } catch (err) {
    console.error(`[rental-tracker] Failed to fetch ghost rentals: ${err.message}`);
    return [];
  }
}

/**
 * Clean up stale rentals
 */
export async function cleanupStaleRentals(client, activeRealIds) {
  try {
    if (activeRealIds.length > 0) {
      const placeholders = activeRealIds.map(() => '?').join(',');
      await dbRunAsync(
        `DELETE FROM rentals WHERE client = ? AND id NOT IN (${placeholders}) AND is_real = 1`,
        [client, ...activeRealIds]
      );
    } else {
      await dbRunAsync(
        `DELETE FROM rentals WHERE client = ? AND is_real = 1`,
        [client]
      );
    }
    return true;
  } catch (err) {
    console.warn(`[rental-tracker] Failed to clean up stale rentals: ${err.message}`);
    return false;
  }
}

/**
 * Clean up ghost rentals
 */
export async function cleanupGhostRentals(client) {
  try {
    // Move to ghost_rentals table before deleting
    const ghostRentals = await dbAllAsync(
      `SELECT * FROM rentals WHERE client = ? AND is_real = 0`,
      [client]
    );
    
    for (const ghost of ghostRentals) {
      await dbRunAsync(
        `INSERT OR IGNORE INTO ghost_rentals (id, name, client, detected_at, reason) 
         VALUES (?, ?, ?, ?, ?)`,
        [ghost.id, ghost.name, ghost.client, Date.now(), ghost.ghost_reason || 'Unknown']
      );
    }
    
    await dbRunAsync(
      `DELETE FROM rentals WHERE client = ? AND is_real = 0`,
      [client]
    );
    return true;
  } catch (err) {
    console.warn(`[rental-tracker] Failed to clean up ghost rentals: ${err.message}`);
    return false;
  }
}

/**
 * Mark rental as notified
 */
export async function markRentalNotified(rentalId, timestamp) {
  try {
    await dbRunAsync(
      `UPDATE rentals SET last_notified = ? WHERE id = ?`,
      [timestamp, String(rentalId)]
    );
    return true;
  } catch (err) {
    console.error(`[rental-tracker] Failed to mark rental notified: ${err.message}`);
    return false;
  }
}

/**
 * Get today's rental count
 */
export async function getTodayRentalCount() {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  
  try {
    const row = await dbGetAsync(
      "SELECT COUNT(*) as count FROM rental_history WHERE start_time >= ?",
      [todayStart.getTime()]
    );
    return row ? row.count : 0;
  } catch (err) {
    console.error(`[rental-tracker] Failed to get today's rental count: ${err.message}`);
    return 0;
  }
}