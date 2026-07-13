// server/miners/kryptex-monitor.js - Kryptex pool monitoring
// Matches HeroMiners monitor pattern: periodic polling + DB persistence + alerts

import { getKryptexMinerStats, getKryptexGlobalStats } from "./kryptex.js";
import { getDb } from "../db.js";

const MONITOR_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Configured addresses to monitor: [{ address, coin, label }]
// Set via KRYPTEX_MONITOR_ADDRESSES env var as JSON
const MONITORED_ADDRESSES = (() => {
  try {
    const raw = process.env.KRYPTEX_MONITOR_ADDRESSES;
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("[Kryptex Monitor] Invalid KRYPTEX_MONITOR_ADDRESSES env:", e.message);
  }
  return [];
})();

let isRunning = false;
let monitorInterval = null;

/**
 * Start Kryptex monitor
 */
export function startKryptexMonitor() {
  if (isRunning) {
    console.log("[Kryptex Monitor] Already running");
    return;
  }

  if (MONITORED_ADDRESSES.length === 0) {
    console.log("[Kryptex Monitor] No addresses configured, skipping");
    return;
  }

  isRunning = true;
  console.log(`[Kryptex Monitor] Monitoring ${MONITORED_ADDRESSES.length} addresses`);

  // Run immediately
  checkAllAddresses();

  // Set interval
  monitorInterval = setInterval(checkAllAddresses, MONITOR_INTERVAL);
}

/**
 * Stop Kryptex monitor
 */
export function stopKryptexMonitor() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
  isRunning = false;
  console.log("[Kryptex Monitor] Stopped");
}

/**
 * Check all configured addresses
 */
async function checkAllAddresses() {
  for (const config of MONITORED_ADDRESSES) {
    try {
      await checkAddress(config);
    } catch (error) {
      console.error(`[Kryptex Monitor] Error checking ${config.coin}/${config.address}:`, error.message);
    }
  }
}

/**
 * Check a single address and persist to DB
 */
async function checkAddress(config) {
  const { address, coin = 'etc', label, threshold = 0 } = config;
  const coinLower = coin.toLowerCase();

  try {
    const result = await getKryptexMinerStats(coinLower, address);

    if (!result?.success) {
      console.warn(`[Kryptex Monitor] No data for ${coinLower}/${address}`);
      return;
    }

    const stats = result.stats || {};
    const balance = stats.balance || {};
    const hashrate = stats.hashrate || {};
    const workers = stats.workers || {};

    // Log summary
    const currentHash = hashrate.current || '0 H/s';
    const unpaidBalance = balance.unpaid || 0;
    const onlineWorkers = workers.online || 0;
    console.log(`[Kryptex Monitor] ${label || address}: ${currentHash} | ${unpaidBalance} ${coin.toUpperCase()} unpaid | ${onlineWorkers} workers`);

    // Check thresholds
    if (threshold > 0 && unpaidBalance >= threshold) {
      console.log(`[Kryptex Monitor] ⚠️ ${label || address} reached threshold: ${unpaidBalance} ${coin.toUpperCase()}`);
    }

    // Save snapshot to DB
    await saveSnapshot(coinLower, address, label, result);

  } catch (error) {
    console.error(`[Kryptex Monitor] Failed for ${coinLower}/${address}:`, error.message);
  }
}

/**
 * Save miner snapshot to database
 */
async function saveSnapshot(coin, address, label, data) {
  try {
    const db = await getDb();
    const stats = data.stats || {};
    const balance = stats.balance || {};
    const hashrate = stats.hashrate || {};
    const workers = stats.workers || {};
    const workerTable = stats.workerTable || [];

    // Using INSERT ON CONFLICT (UPSERT) to keep only the latest snapshot per address.
    // This prevents the database from growing indefinitely with redundant historical data.
    // This requires a PRIMARY KEY or UNIQUE constraint on (coin, address) in the table schema.
    // e.g., CREATE TABLE kryptex_snapshots (..., PRIMARY KEY (coin, address));
    await db.run(`
      INSERT INTO kryptex_snapshots (
        coin, address, label, timestamp, hashrate_current, hashrate_30m, 
        hashrate_3h, hashrate_24h, balance_unpaid, balance_immature, 
        balance_total_paid, balance_reward_7d, balance_reward_30d, 
        workers_online, workers_offline, workers_total, worker_count, raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(coin, address) DO UPDATE SET
        label = excluded.label,
        timestamp = excluded.timestamp,
        hashrate_current = excluded.hashrate_current,
        hashrate_30m = excluded.hashrate_30m,
        hashrate_3h = excluded.hashrate_3h,
        hashrate_24h = excluded.hashrate_24h,
        balance_unpaid = excluded.balance_unpaid,
        balance_immature = excluded.balance_immature,
        balance_total_paid = excluded.balance_total_paid,
        balance_reward_7d = excluded.balance_reward_7d,
        balance_reward_30d = excluded.balance_reward_30d,
        workers_online = excluded.workers_online,
        workers_offline = excluded.workers_offline,
        workers_total = excluded.workers_total,
        worker_count = excluded.worker_count,
        raw_json = excluded.raw_json
    `, [
      coin, address, label || null, Date.now(),
      hashrate.current || '0 H/s', hashrate['30min'] || '0 H/s', hashrate['3h'] || '0 H/s', hashrate['24h'] || '0 H/s',
      balance.unpaid || 0, balance.immature || 0, balance.totalPaid || 0,
      balance.reward7d || 0, balance.reward30d || 0,
      workers.online || 0, workers.offline || 0, workers.total || 0,
      workerTable.length, JSON.stringify(data)
    ]);
  } catch (error) {
    console.error('[Kryptex Monitor] Failed to save snapshot:', error.message);
    // Add a check for older SQLite versions that don't support UPSERT
    if (error.message.includes('no such column: excluded.label') || error.message.includes('near "ON"')) {
        console.error('[Kryptex Monitor] UPSERT failed. Your version of SQLite might be too old. UPSERT was added in SQLite 3.24.0 (2018-06-04).');
    }
  }
}

/**
 * Get snapshot history for an address
 */
export async function getKryptexHistory(coin, address, limit = 50) {
  try {
    const db = await getDb();
    const rows = await db.all(`
      SELECT * FROM kryptex_snapshots 
      WHERE coin = ? AND address = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `, [coin.toLowerCase(), address, limit]);
    return rows;
  } catch (error) {
    console.error('[Kryptex Monitor] Failed to get history:', error.message);
    return [];
  }
}

/**
 * Get latest snapshot for an address
 */
export async function getKryptexLatest(coin, address) {
  try {
    const db = await getDb();
    const row = await db.get(`
      SELECT * FROM kryptex_snapshots 
      WHERE coin = ? AND address = ?
      ORDER BY timestamp DESC
      LIMIT 1
    `, [coin.toLowerCase(), address]);
    return row || null;
  } catch (error) {
    console.error('[Kryptex Monitor] Failed to get latest:', error.message);
    return null;
  }
}

/**
 * Get aggregated summary across all monitored addresses
 */
export async function getKryptexMonitorSummary() {
  try {
    const db = await getDb();
    const latest = await db.all(`
      SELECT coin, address, label, MAX(timestamp) as last_seen, hashrate_current, balance_unpaid, workers_online, workers_total
      FROM kryptex_snapshots
      GROUP BY coin, address
      ORDER BY last_seen DESC
    `);
    return latest;
  } catch (error) {
    console.error('[Kryptex Monitor] Failed to get summary:', error.message);
    return [];
  }
}

// Cleanup on module unload
process.on('exit', () => {
  stopKryptexMonitor();
});
