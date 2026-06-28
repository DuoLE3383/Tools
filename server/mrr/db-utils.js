// ==========================
//  LIB: DATABASE UTILITIES
//  Generic database helpers
// ==========================

/**
 * Promisified db.get
 */
export function dbGetAsync(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

/**
 * Promisified db.run
 */
export function dbRunAsync(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

/**
 * Promisified db.all
 */
export function dbAllAsync(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

/**
 * Initialize rental tables
 */
export function initRentalTables(db) {
  return new Promise((resolve) => {
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS rentals (
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

      db.run(`CREATE TABLE IF NOT EXISTS rental_history (
        id TEXT PRIMARY KEY, 
        start_time INTEGER
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS ghost_rentals_log (
        id TEXT PRIMARY KEY,
        name TEXT,
        client TEXT,
        detected_at INTEGER,
        reason TEXT,
        cleaned_up INTEGER DEFAULT 0
      )`);

      db.run("DELETE FROM rental_history WHERE start_time < ?", [Date.now() - 172800000], () => resolve());
    });
  });
}