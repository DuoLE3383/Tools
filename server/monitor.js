// server/monitor.js - SIMPLIFIED WORKING VERSION

import { db } from './db.js';
import fs from 'fs';
import { mrrApiCall, mrrConfigs, markGhostRental, mrrGetCache } from './mrr.js';
import { resolveNhClient, getNiceHashApp, isAggregate, nhConfigs } from './nh.js';
import { extractRentalInfo, extractRigInfo } from './utils.js';
import { TELEGRAM_CONFIG, TelegramTemplates } from '../src/core/telegram.js';
import { ALGO_DISPLAY_NAMES } from '../src/core/mapping.js';

// Import utilities
import { 
  getRentalIdFromRig, 
  getRigLookupKeys, 
  isRentalActive, 
  isLiveRigCurrentlyRented,
  resolveRentalAlgo,
  parseUtcDate
} from './mrr/rental-utils.js';

import { 
  isRealRental, 
  splitRentals as validateRentals,
} from './mrr/rental-validator.js';

import { 
  cleanHashrateUnit, 
  convertHashrateValue, 
  ALGO_MAPPING,
  getPerformanceEmoji 
} from './mrr/hashrate-utils.js';

import { 
  extractArray, 
  deduplicateByKey, 
  groupBy 
} from './mrr/array-utils.js';

import { 
  escapeHtml, 
  buildGroupedMessages 
} from './mrr/telegram-utils.js';

import { 
  dbGetAsync, 
  dbRunAsync, 
  dbAllAsync, 
  initRentalTables 
} from './mrr/db-utils.js';

import { Cache, TTLMap } from './mrr/cache-utils.js';

// ==========================
//  CONFIGURATION
// ==========================

const { ALERT_COOLDOWN_MS, WARNING_RIG_THRESHOLD } = TELEGRAM_CONFIG;
const RENTED_HEARTBEAT_MS = 15 * 60 * 1000;

// ==========================
//  TELEGRAM BOT CONFIGURATION
// ==========================

const TELEGRAM_BOTS = {
  MAIN_BOT: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
    name: 'Main Bot',
  },
  MINE_BOT: {
    token: process.env.TELEGRAM_MINE_BOT_TOKEN,
    chatId: process.env.TELEGRAM_GROUP_ID,
    name: 'Mining Bot',
  }
};

// ==========================
//  STATE
// ==========================

let isMonitorRunning = false;
const monitorInitTracker = new Set();
const lastAlertTimes = new Map([['global_summary', Date.now()]]);
const lastRigStates = new Map();

// Use TTLMap for caches
const nhPriceCache = new TTLMap(60000);
const nhPriceErrorCache = new TTLMap(600000);
const nhOrdersCache = new TTLMap(60000);
const ghostCache = new TTLMap(300000);

// ==========================
//  HELPERS
// ==========================

async function maybeDelay(key) {
  if (!monitorInitTracker.has(key)) {
    console.log(`[Monitor] First-time load delay (1s) for: ${key}`);
    await new Promise(r => setTimeout(r, 1000));
    monitorInitTracker.add(key);
  }
}

// ==========================
//  NICEHASH HELPERS
// ==========================

export async function getMonitorNhActiveOrders(clientName) {
  const cacheKey = String(clientName || 'BT').toUpperCase();
  const cached = nhOrdersCache.get(cacheKey);
  if (cached) return cached;

  const cfg = nhConfigs[cacheKey];
  if (!cfg?.apiKey || !cfg?.apiSecret || !cfg?.orgId) return [];

  const { client } = resolveNhClient(cacheKey);
  if (!client) return [];

  const result = await getNiceHashApp(client).hashpower.getMyOrders({ op: 'LE', limit: 100 });
  const rawList = result?.list || result?.myOrders || (Array.isArray(result) ? result : []);
  const activeOrders = rawList.filter(o => String(o?.status?.code || o?.status || '').toUpperCase() === 'ACTIVE');
  nhOrdersCache.set(cacheKey, activeOrders);
  return activeOrders;
}

// ==========================
//  TELEGRAM FUNCTIONS - UPGRADED
// ==========================

/**
 * Get health status for both Telegram bots
 */
export async function getTelegramHealth() {
  return {
    mainBot: {
      tokenPresent: !!process.env.TELEGRAM_BOT_TOKEN,
      chatIdPresent: !!process.env.TELEGRAM_CHAT_ID,
      configured: !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_CHAT_ID,
    },
    mineBot: {
      tokenPresent: !!process.env.TELEGRAM_MINE_BOT_TOKEN,
      chatIdPresent: !!process.env.TELEGRAM_GROUP_ID,
      configured: !!process.env.TELEGRAM_MINE_BOT_TOKEN && !!process.env.TELEGRAM_GROUP_ID,
    }
  };
}

/**
 * Get Telegram notification status
 */
export async function getTelegramStatus() {
  try {
    await dbRunAsync(db, "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)");
    const row = await dbGetAsync(db, "SELECT value FROM settings WHERE key = 'telegram_enabled'");
    return { enabled: row ? row.value === 'true' : true };
  } catch (err) {
    console.warn('[monitor:db] Failed to fetch telegram status:', err.message);
    return { enabled: true };
  }
}

/**
 * Set Telegram notification status
 */
export async function setTelegramStatus(enabled) {
  const val = enabled ? 'true' : 'false';
  await dbRunAsync(db, "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)");
  await dbRunAsync(
    db,
    "INSERT INTO settings (key, value) VALUES ('telegram_enabled', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [val]
  );
  return { enabled: !!enabled };
}

/**
 * Send message via Telegram (supports both bots)
 * @param {string} message - The message to send
 * @param {string} botType - 'MAIN_BOT' or 'MINE_BOT'
 * @param {object} options - Additional options
 */
export async function sendTelegramInternal(message, botType = 'MAIN_BOT', options = {}) {
  // Check if notifications are globally enabled
  const status = await getTelegramStatus();
  if (!status.enabled) {
    console.log('[telegram] Notifications are globally disabled');
    return { ok: true, description: 'Notifications disabled' };
  }

  // Get bot configuration
  const botConfig = TELEGRAM_BOTS[botType];
  if (!botConfig) {
    console.warn(`[telegram] Unknown bot type: ${botType}, falling back to MAIN_BOT`);
    return sendTelegramInternal(message, 'MAIN_BOT', options);
  }

  const { token: botToken, chatId, name } = botConfig;

  if (!botToken || !chatId) {
    console.warn(`[telegram:${botType}] Credentials missing for ${name}`);
    throw new Error(`Telegram ${name} credentials missing`);
  }

  const text = String(message || '').trim();
  if (!text) throw new Error('Message empty');

  console.log(`[telegram:${botType}] Sending message (${text.length} chars)...`);

  const maxAttempts = options.maxAttempts || 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          chat_id: chatId, 
          text, 
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          ...options
        })
      });

      const data = await res.json();
      
      if (res.ok && data?.ok) {
        console.log(`[telegram:${botType}] Message sent successfully (attempt ${attempt})`);
        return { ok: true, data };
      }
      
      throw new Error(data?.description || `HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
      console.warn(`[telegram:${botType}] Attempt ${attempt} failed: ${err.message}`);
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, attempt * 500));
      }
    }
  }

  console.error(`[telegram:${botType}] Failed after ${maxAttempts} attempts: ${lastError.message}`);
  throw lastError;
}

/**
 * Send message to Mining bot (convenience function)
 */
export async function sendTelegramMine(message, options = {}) {
  return sendTelegramInternal(message, 'MINE_BOT', options);
}

/**
 * Send message to Main bot (convenience function)
 */
export async function sendTelegramMain(message, options = {}) {
  return sendTelegramInternal(message, 'MAIN_BOT', options);
}

// ==========================
//  MAIN MONITOR FUNCTION
// ==========================

export async function runRentalMonitor(forceNotify = false, clientScope = 'ALL') {
  if (isMonitorRunning) {
    console.log(`[Monitor] Run already in progress, skipping...`);
    return { notifications: [], summary: { error: 'Monitor already running' } };
  }
  isMonitorRunning = true;

  try {
    await maybeDelay('runRentalMonitor');
    await initRentalTables(db);

    const requestedScope = String(clientScope || 'ALL').trim().toUpperCase();
    const scopeList = requestedScope.split(',').map(s => s.trim());

    const allConfiguredAccts = Object.keys(mrrConfigs).filter(
      k => mrrConfigs[k].apiKey && mrrConfigs[k].apiSecret
    );

    const mrrAccts = (scopeList.includes('ALL') || scopeList.includes('VN') || scopeList.some(s => isAggregate(s)))
      ? allConfiguredAccts
      : allConfiguredAccts.filter(acct => scopeList.includes(acct.toUpperCase()));

    if (mrrAccts.length === 0) {
      console.warn(`[${new Date().toLocaleTimeString()}] No accounts for scope: ${requestedScope}`);
      return { notifications: [], summary: { error: 'No accounts configured' } };
    }

    console.log(`[${new Date().toLocaleTimeString()}] 🚀 Starting monitor for ${mrrAccts.length} accounts...`);

    const now = Date.now();
    const notifications = [];
    const activeRentalLines = [];
    const accountMetrics = [];
    const allRentedRigs = [];
    const successfulAccts = [];
    const currentActiveRentalIds = new Set();
    const currentActiveRealRentalIds = new Set();
    const globalRentalsMap = new Map();
    const globalOnlineAlgos = new Map();
    const queuedTelegramMessages = [];
    const notifiedRentalIdsThisRun = new Set();

    const queueTelegramMessage = (message, options = {}) => {
      const text = String(message || '').trim();
      if (!text) return;
      queuedTelegramMessages.push({
        message: text,
        label: options.label || 'Monitor',
        type: options.type || options.label || 'Monitor',
        summary: options.summary || null,
        onSuccess: options.onSuccess,
        onFailure: options.onFailure,
      });
    };

    const flushQueuedTelegramMessages = async () => {
      if (queuedTelegramMessages.length === 0) return;
      const groupedByType = new Map();
      for (const item of queuedTelegramMessages) {
        const type = String(item.type || item.label || 'Monitor');
        if (!groupedByType.has(type)) groupedByType.set(type, []);
        groupedByType.get(type).push(item);
      }
      for (const [type, items] of groupedByType.entries()) {
        for (const item of items) {
          try {
            await sendTelegramInternal(item.message);
            await item.onSuccess?.();
          } catch (err) {
            await item.onFailure?.(err);
          }
        }
      }
    };

    // Initialize database
    await new Promise((resolve) => {
      db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS rentals (
          id TEXT PRIMARY KEY, name TEXT, client TEXT, start_time INTEGER, end_time INTEGER, algo TEXT,
          target_100 REAL, order_diff REAL, last_updated INTEGER, last_notified INTEGER,
          low_hashrate_start INTEGER, zero_hashrate_start INTEGER, current_hashrate TEXT,
          average_hashrate TEXT, advertised_hashrate TEXT, price_paid TEXT
        )`, (err) => { if (err) console.error(`[monitor:db] Failed to create rentals table: ${err.message}`); });
        db.run(`CREATE TABLE IF NOT EXISTS rental_history (id TEXT PRIMARY KEY, start_time INTEGER)`,
          (err) => { if (err) console.error(`[monitor:db] Failed to create rental_history table: ${err.message}`); });
        db.run("DELETE FROM rental_history WHERE start_time < ?", [Date.now() - 172800000], () => resolve());
      });
    });

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayStartTs = todayStart.getTime();

    // ============================================================
    // PROCESS EACH ACCOUNT - FIXED WITH SAFETY CHECKS
    // ============================================================
    let totalAll = 0;
    let availableAll = 0;
    let rentedAll = 0;
    let ghostTotal = 0;
    let offlineAll = 0;
    let disabledAll = 0;
    let warningAll = 0;
    let onlineAll = 0;

    // ✅ Ensure mrrAccts is an array before iterating
    const accountsToProcess = Array.isArray(mrrAccts) ? mrrAccts : [];

    await Promise.all(accountsToProcess.map(async (acct) => {
      const harvestedRentalIds = new Set();
      const rigLookupByRentalId = new Map();

      const metric = {
        name: acct,
        total: 0,
        online: 0,
        rented: 0,
        offline: 0,
        disabled: 0,
        warning: 0,
        error: false
      };

      try {
        // ✅ Ensure responses are valid before processing
        const [rigsRes, boughtRes, soldRes] = await Promise.all([
          mrrApiCall({ endpoint: '/rig/mine', clientNameRaw: acct }),
          mrrApiCall({ endpoint: '/rental', query: { type: 'bought' }, clientNameRaw: acct }),
          mrrApiCall({ endpoint: '/rental', query: { type: 'sold' }, clientNameRaw: acct })
        ]);

        // ✅ Check if responses are valid before processing
        if (rigsRes && rigsRes.statusCode === 200 && rigsRes.data?.success) {
          const rigList = extractArray(rigsRes.data);
          // ✅ Ensure rigList is an array
          const rigs = Array.isArray(rigList) ? rigList : [];
          const rentedRigs = [];
          let availableCount = 0;
          let offlineCount = 0;
          let disabledCount = 0;
          let warningCount = 0;
          let onlineCount = 0;

          for (const rig of rigs) {
            // ✅ Skip if rig is invalid
            if (!rig) continue;
            
            const status = String(typeof rig.status === 'object' ? rig.status.status : rig.status || '').toLowerCase();
            const rentedFlag = Boolean(rig?.status?.rented);
            const rentalId = getRentalIdFromRig(rig);
            const onlineFlag = typeof rig?.status?.online === 'boolean' ? rig.status.online : Boolean(rig?.online);

            const isRented = rentedFlag || status.includes('rented') || status.includes('active') || (rentalId && rentalId !== '0');
            const isDisabled = status.includes('disabled');
            const isOffline = status.includes('offline') || !onlineFlag;
            const isWarning = status.includes('warning');

            if (isRented) {
              rentedRigs.push(rig);
              const detailKey = rentalId || String(rig.id || '').trim();
              if (detailKey) {
                harvestedRentalIds.add(detailKey);
                rigLookupByRentalId.set(detailKey, rig);
                rigLookupByRentalId.set(String(rig.id), rig);
              }
            }
            if (!isRented && !isDisabled && onlineFlag) availableCount++;
            if (isOffline) offlineCount++;
            if (isDisabled) disabledCount++;
            if (isWarning) warningCount++;
            if (onlineFlag) {
              onlineCount++;
              const algoName = (rig.algo || rig.type || 'N/A').toUpperCase();
              globalOnlineAlgos.set(algoName, (globalOnlineAlgos.get(algoName) || 0) + 1);
            }
          }

          metric.total = rigs.length;
          metric.online = onlineCount;
          metric.offline = offlineCount;
          metric.disabled = disabledCount;
          metric.warning = warningCount;

          totalAll += rigs.length;
          availableAll += availableCount;
          offlineAll += offlineCount;
          disabledAll += disabledCount;
          warningAll += warningCount;
          onlineAll += onlineCount;
          allRentedRigs.push(...rentedRigs.map(r => ({ ...r, acct })));
          successfulAccts.push(acct);
        } else if (rigsRes && rigsRes.data) {
          const errMsg = rigsRes.data.data?.message || rigsRes.data.message || rigsRes.data.error || 'Unknown';
          console.warn(`[${new Date().toLocaleTimeString()}] Account ${acct} rig list failed: ${errMsg}`);
          metric.error = true;
        }

        // ✅ Process rentals safely
        const soldRentalsRaw = soldRes && soldRes.data ? extractArray(soldRes.data).map(r => ({ ...r, __rentalSide: 'sold' })) : [];
        const boughtRentalsRaw = boughtRes && boughtRes.data ? extractArray(boughtRes.data).map(r => ({ ...r, __rentalSide: 'bought' })) : [];
        const allRentalsRaw = [...boughtRentalsRaw, ...soldRentalsRaw];

        const rentalsMap = new Map();
        allRentalsRaw.forEach(r => {
          if (r && r.id) {
            rentalsMap.set(String(r.id), r);
            globalRentalsMap.set(String(r.id), r);
            for (const key of getRigLookupKeys(r)) {
              if (!rentalsMap.has(key)) rentalsMap.set(key, r);
              if (!globalRentalsMap.has(key)) globalRentalsMap.set(key, r);
            }
          }
        });

        // Fetch missing rental details
        const missingIds = Array.from(harvestedRentalIds).filter(hid => !rentalsMap.has(hid));
        if (missingIds.length > 0) {
          await Promise.all(missingIds.map(async (hid) => {
            try {
              const hRes = await mrrApiCall({ endpoint: `/rental/${hid}`, clientNameRaw: acct });
              const hData = hRes.data?.data || hRes.data;
              if (hRes.statusCode === 200 && hData && !hData.error) {
                if (!hData.id) hData.id = hid;
                rentalsMap.set(hid, hData);
                globalRentalsMap.set(hid, hData);
              }
            } catch (err) { }
          }));
        }

        // Create rental entries for rigs with rental IDs
        for (const [rid, rig] of rigLookupByRentalId.entries()) {
          if (!rentalsMap.has(rid)) {
            rentalsMap.set(rid, {
              id: rid,
              name: rig.name,
              status: rig.status,
              hashrate: { current: rig.hashrate || 0 },
              rig: { id: rig.id, type: rig.algo || rig.type }
            });
            globalRentalsMap.set(rid, rentalsMap.get(rid));
          }
        }

        // ============================================================
        // PROCESS RENTALS - SIMPLIFIED
        // ============================================================
        let realRentalCount = 0;

        for (const [rentalId, r] of rentalsMap) {
          // Skip if not a real rental
          const info = extractRentalInfo(r);
          if (!isRealRental(r, info)) {
            console.log(`[monitor:${acct}] Skipping ghost rental: ${rentalId}`);
            continue;
          }

          const liveRig = getRigLookupKeys(r).map(key => rigLookupByRentalId.get(key)).find(Boolean);
          if (liveRig) {
            r.name = liveRig.name || r.name;
            if (!r.hashrate || typeof r.hashrate !== 'object') r.hashrate = {};
            const liveVal = parseFloat(liveRig.hashrate || liveRig.status?.hashrate || 0);
            if (liveVal > 0) {
              r.hashrate.current = liveVal;
            }
            if ((!r.algo || r.algo === 'Unknown') && liveRig.algo) {
              r.algo = liveRig.algo;
            }
          }

          const startT = parseUtcDate(info.startTime);
          const endT = parseUtcDate(info.endTime);
          
          // Skip if no valid times
          if (startT <= 0 || endT <= 0) {
            console.log(`[monitor:${acct}] Skipping rental with invalid times: ${rentalId}`);
            continue;
          }

          const remainingMs = Math.max(0, endT - now);
          
          // Skip if finished
          if (remainingMs <= 0) {
            console.log(`[monitor:${acct}] Skipping finished rental: ${rentalId}`);
            await dbRunAsync(`DELETE FROM rentals WHERE id = ?`, [String(r.id)]).catch(() => {});
            continue;
          }

          // Check if currently rented
          const isRented = isLiveRigCurrentlyRented(liveRig);
          if (!isRented && !currentActiveRentalIds.has(rentalId)) {
            // Not rented and not in active list - skip
            continue;
          }

          // This is a real active rental - count it
          realRentalCount++;
          currentActiveRentalIds.add(rentalId);

          // Get hashrate data
          const advertised = parseFloat(info.hashrate?.advertised || 0);
          const average = parseFloat(info.hashrate?.average || 0);
          const currentHash = parseFloat(info.hashrate?.current || 0);
          const efficiency = parseFloat(info.percent || 0);

          // Calculate target
          const totalDurationMs = endT - startT;
          const elapsedMs = Math.max(0, Math.min(now - startT, totalDurationMs));
          const totalExpectedHashes = advertised * (totalDurationMs / 1000);
          const actualHashesDone = average * (elapsedMs / 1000);
          const remainingHashesNeeded = totalExpectedHashes - actualHashesDone;
          const requiredHashrate = remainingMs > 0 ? remainingHashesNeeded / (remainingMs / 1000) : 0;
          const displayTarget = Number.isFinite(requiredHashrate) && requiredHashrate > 0 ? requiredHashrate : 0;

          // Calculate order diff
          let orderDiff = (100 - efficiency).toFixed(1);
          
          // Try to get NiceHash price for comparison
          try {
            const nhAlgo = normalizeAlgoForNiceHash(info.algo);
            if (nhAlgo && nhAlgo !== 'UNKNOWN' && nhAlgo !== 'N/A') {
              const cacheKey = `${nhAlgo}:${acct}`;
              let nhP = nhPriceCache.get(cacheKey);
              if (!nhP) {
                const activeOrders = await getMonitorNhActiveOrders(acct);
                const matchedOrder = activeOrders.find(o => normalizeAlgoForNiceHash(o?.algorithm || o?.algo || o?.type) === nhAlgo);
                if (matchedOrder) {
                  nhP = {
                    price: parseFloat(matchedOrder?.price ?? matchedOrder?.marketPrice ?? matchedOrder?.fixedPrice ?? 0) || 0,
                    unit: getMonitorNhAlgoPriceUnit(matchedOrder, nhAlgo)
                  };
                  if (nhP.price > 0) nhPriceCache.set(cacheKey, nhP);
                }
              }
              if (nhP?.price > 0 && advertised > 0) {
                const mrrBtcData = getBtcPriceData(r.price || info.price);
                const durationHours = parseFloat(info.duration) || 0;
                const mrrPriceNorm = durationHours > 0 && advertised > 0
                  ? mrrBtcData.value / (durationHours / 24) / advertised
                  : 0;
                if (mrrPriceNorm > 0) {
                  const roi = calculatePriceComparison(mrrPriceNorm, 'TH', nhP.price, nhP.unit);
                  if (roi !== null && !isNaN(roi)) orderDiff = roi;
                }
              }
            }
          } catch (err) {
            // Ignore - use default orderDiff
          }

          // Save to database
          await dbRunAsync(
            `INSERT INTO rentals (
              id, name, client, start_time, end_time, algo, target_100, order_diff, 
              last_updated, current_hashrate, average_hashrate, advertised_hashrate, price_paid
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET 
              name=excluded.name, client=excluded.client, algo=excluded.algo,
              start_time=excluded.start_time, end_time=excluded.end_time, 
              target_100=excluded.target_100, order_diff=excluded.order_diff,
              last_updated=excluded.last_updated,
              current_hashrate=excluded.current_hashrate, 
              average_hashrate=excluded.average_hashrate,
              advertised_hashrate=excluded.advertised_hashrate, 
              price_paid=excluded.price_paid`,
            [
              String(r.id), r.name || r.id, acct, startT, endT, info.algo,
              displayTarget, orderDiff, now, currentHash, average, advertised,
              info.price?.paid || 0
            ]
          ).catch(err => console.error(`[monitor:db] Upsert error for ${r.id}: ${err.message}`));

          // Build active rental line for summary
          const remStr = formatRemainingTime(remainingMs);
          const perfEmoji = efficiency >= 100 ? '✅' : 
                            efficiency >= 90 ? '🟢' : 
                            efficiency >= 70 ? '🔵' : 
                            efficiency >= 50 ? '🟡' : '🔴';
          
          const algo = resolveRentalAlgo(r, info);
          const speedStatus = currentHash > 0 ? `${info.niceHashrate}H` : '⚠️ 0 H/s';
          
          activeRentalLines.push(TelegramTemplates.activeRentalLine(
            perfEmoji,
            getAlgoDisplayName(algo),
            r.name || r.id,
            remStr,
            efficiency,
            orderDiff,
            info.niceAverageHashrate || '0.00',
            info.niceAdvertisedHashrate || 'N/A',
            speedStatus,
            displayTarget,
            '',
            acct,
            info
          ));

          // Send new rental notification if new
          const row = await dbGetAsync(`SELECT last_notified FROM rentals WHERE id = ?`, [String(r.id)]).catch(() => null);
          const lastNotified = row?.last_notified || 0;
          const isNew = lastNotified === 0;

          if (forceNotify || isNew) {
            const hbType = forceNotify ? 'MONITOR' : 'NEW RENTAL';
            const ads = info.niceAdvertisedHashrate || info.hashrate?.advertised?.nice || info.hashrate?.advertised || 'N/A';
            const msg = forceNotify
              ? TelegramTemplates.rentedNotice(hbType, r, info, acct, orderDiff, remStr, getAlgoDisplayName(algo), ads)
              : TelegramTemplates.newRental(acct, r, info.price?.paid || '0.00', info.startTime, info.endTime, getAlgoDisplayName(algo), ads);
            
            queueTelegramMessage(msg, {
              type: hbType,
              label: `${hbType} ${acct} ${r.id}`,
              onSuccess: async () => {
                await dbRunAsync(`UPDATE rentals SET last_notified = ? WHERE id = ?`, [now, String(r.id)]);
                notifications.push({ id: r.id, client: acct, status: 'Sent' });
              },
              onFailure: (err) => {
                notifications.push({ id: r.id, client: acct, status: 'Failed', error: err.message });
              }
            });
          }
        }

        metric.rented = realRentalCount;
        accountMetrics.push(metric);
        if (!metric.error) successfulAccts.push(acct);

      } catch (err) {
        console.error(`[${new Date().toLocaleTimeString()}] [monitor:error] Client ${acct}: ${err.message}`);
        metric.error = true;
        accountMetrics.push(metric);
      }
    }));

    // ============================================================
    // CLEANUP & FINISHED RENTALS
    // ============================================================
    const successfulAcctList = Array.from(new Set(successfulAccts));

    if (successfulAcctList.length > 0) {
      const placeholders = successfulAcctList.map(() => '?').join(',');
      
      // Delete rentals not in active list
      if (currentActiveRentalIds.size > 0) {
        const activePlaceholders = Array.from(currentActiveRentalIds).map(() => '?').join(',');
        await dbRunAsync(
          `DELETE FROM rentals WHERE client IN (${placeholders}) AND id NOT IN (${activePlaceholders})`,
          [...successfulAcctList, ...Array.from(currentActiveRentalIds)]
        ).catch((err) => console.warn(`[monitor:db] Failed to prune stale rentals: ${err.message}`));
      } else {
        await dbRunAsync(
          `DELETE FROM rentals WHERE client IN (${placeholders})`,
          successfulAcctList
        ).catch((err) => console.warn(`[monitor:db] Failed to clear stale rentals: ${err.message}`));
      }
    }

    // ✅ Flush queued telegram messages
    await flushQueuedTelegramMessages();

    // ✅ Return summary with safety checks
    return {
      notifications: notifications || [],
      summary: {
        scope: requestedScope || 'ALL',
        accounts: Array.isArray(mrrAccts) ? mrrAccts : [],
        totals: {
          rigs: totalAll || 0,
          available: availableAll || 0,
          rented: rentedAll || 0,
          offline: offlineAll || 0,
          disabled: disabledAll || 0,
          warning: warningAll || 0,
        },
        perAccount: Array.isArray(accountMetrics) ? accountMetrics : [],
        activeRentals: Array.isArray(allRentedRigs) ? allRentedRigs.filter(r => {
          if (!r) return false;
          const rentalDetail = globalRentalsMap.get(String(r.id));
          if (!rentalDetail) return false;
          const info = extractRentalInfo(rentalDetail);
          return isRealRental(rentalDetail, info);
        }).map(r => {
          const rentalDetail = globalRentalsMap.get(String(r.id));
          const eff = rentalDetail ? parseFloat(extractRentalInfo(rentalDetail).percent || 0) : 0;
          return {
            account: r.acct || 'unknown',
            id: r.id || 'unknown',
            name: r.name || r.id || 'unknown',
            efficiency: eff || 0,
            orderDiff: (100 - eff).toFixed(1) || '0.0'
          };
        }) : [],
        ghostRentals: Array.from(ghostCache.keys() || []).map(id => {
          const cached = ghostCache.get(id);
          return {
            id: id || 'unknown',
            name: cached?.name || 'Unknown',
            account: cached?.client || 'Unknown',
            reason: cached?.reason || 'No mining activity detected',
            detectedAt: cached?.detectedAt || now || Date.now()
          };
        })
      }
    };

  } catch (error) {
    console.error('[Monitor] Loop error:', error.message);
    return {
      notifications: [],
      summary: { error: error.message }
    };
  } finally {
    isMonitorRunning = false;
  }
}

// ==========================
//  EXPOSE ADDITIONAL FUNCTIONS
// ==========================

export async function getGhostRentals(client) {
  try {
    return await dbAllAsync(db, 
      `SELECT * FROM ghost_rentals_log WHERE client = ? ORDER BY detected_at DESC`,
      [client]
    );
  } catch (err) {
    console.error(`[monitor] Failed to fetch ghost rentals: ${err.message}`);
    return [];
  }
}

export async function clearGhostRentals(client) {
  try {
    await dbRunAsync(db,
      `UPDATE ghost_rentals_log SET cleaned_up = 1 WHERE client = ?`,
      [client]
    );
    return true;
  } catch (err) {
    console.error(`[monitor] Failed to clear ghost rentals: ${err.message}`);
    return false;
  }
}