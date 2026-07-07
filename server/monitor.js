// server/monitor.js - SIMPLIFIED WORKING VERSION

import { logger } from './logger.js';
import { db } from './db.js';
import { mrrApiCall, mrrConfigs } from './mrr.js';
import { resolveNhClient, getNiceHashApp, isAggregate, nhConfigs } from './nh.js';
import { extractRentalInfo, extractRigInfo } from './utils.js';
import { TELEGRAM_CONFIG, TelegramTemplates } from '../src/core/telegram.js';
import { 
  ALGO_DISPLAY_NAMES, 
  HASHRATE_SUFFIXES, 
  normalizeAlgoForNiceHash, 
  getMrrAlgorithmUnit, 
  calculatePriceComparison
} from '../src/core/mapping.js';
import { getBtcPriceData } from '../src/core/priceUtils.js';

// ============================================================
// SIMPLE HELPERS
// ============================================================

const getAlgoDisplayName = (code) => {
  if (!code) return 'N/A';
  const normalized = normalizeAlgoForNiceHash(code);
  if (normalized && normalized !== 'UNKNOWN') return ALGO_DISPLAY_NAMES[normalized] || normalized;
  const uc = String(code).toUpperCase();
  return ALGO_DISPLAY_NAMES[uc] || code;
};

const resolveRentalAlgo = (r, info) =>
  info?.algo || r?.algo || r?.algorithm || r?.miningAlgorithm || r?.rig?.type || r?.rig?.algo || r?.type || 'N/A';

function parseUtcTime(dateString) {
  if (!dateString) return 0;
  const s = String(dateString).trim();
  if (!s) return 0;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.getTime();
  if (!s.endsWith('UTC') && !s.endsWith('Z') && !s.includes('+') && !s.includes('-')) {
    const d2 = new Date(s + ' UTC');
    if (!isNaN(d2.getTime())) return d2.getTime();
  }
  return 0;
}

function formatRemainingTime(remainingMs) {
  if (remainingMs <= 0) return 'Finished';
  const seconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const rh = hours % 24;
  const rm = minutes % 60;
  if (days > 0) return `${days}d ${rh}h ${rm}m`;
  if (hours > 0) return `${hours}h ${rm}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

function escapeHtml(text) {
  return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getRentalIdFromRig(rig) {
  const candidates = [
    rig?.status?.rentalid, rig?.status?.rental_id, rig?.status?.rentalId,
    rig?.rentalid, rig?.rental_id, rig?.rentalId,
    rig?.current_rental_id, rig?.currentRentalId, rig?.rental?.id,
  ];
  const found = candidates.find(v => v !== undefined && v !== null && String(v).trim() !== '' && String(v).trim() !== '0');
  return found === undefined ? '' : String(found).trim();
}

function getRigLookupKeys(rental, fallbackId = '') {
  return [
    rental?.id, rental?.rentalid, rental?.rental_id, rental?.rentalId,
    rental?.rigid, rental?.rig_id, rental?.rigId, rental?.rig?.id, fallbackId,
  ].map(v => String(v || '').trim()).filter(Boolean);
}

function isLiveRigCurrentlyRented(rig) {
  if (!rig) return false;
  const status = String(typeof rig?.status === 'object' ? rig.status.status : rig.status || '').toLowerCase();
  return Boolean(getRentalIdFromRig(rig)) && (status.includes('rented') || status.includes('active') || status.includes('running'));
}

function extractArray(payload, keys = ['rentals', 'rigs', 'list', 'result', 'items', 'data']) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key];
    if (payload.data && Array.isArray(payload.data[key])) return payload.data[key];
  }
  if (Array.isArray(payload.data)) return payload.data;
  if (payload.rentals && Array.isArray(payload.rentals)) return payload.rentals;
  if (payload.data && typeof payload.data === 'object') return extractArray(payload.data, keys);
  return [];
}

// ============================================================
// SIMPLE: Check if this is a real rental (has data)
// ============================================================
function isRealRental(rental, info) {
  if (!rental || !info) return false;
  
  // Must have a rental ID
  const rentalId = rental.id || rental.rentalid || rental.rental_id;
  if (!rentalId) return false;

  // Check if it has real data
  const currentHash = parseFloat(info.hashrate?.current || 0);
  const averageHash = parseFloat(info.hashrate?.average || 0);
  const advertisedHash = parseFloat(info.hashrate?.advertised || 0);
  const paidAmount = parseFloat(info.price?.paid || rental.price || 0);
  const hasHashrate = currentHash > 0 || averageHash > 0 || advertisedHash > 0;
  const hasPayment = paidAmount > 0;

  // Check if it has valid times
  const startT = parseUtcTime(info.startTime || rental.start_time || rental.startTime || 0);
  const endT = parseUtcTime(info.endTime || rental.end_time || rental.endTime || 0);
  const hasValidTime = startT > 0 && endT > 0 && endT > startT;

  // Check status
  const status = String(rental?.status || rental?.state || '').toLowerCase();
  const isActiveStatus = status.includes('rented') || status.includes('active') || status.includes('running');

  // A rental is real if: has data OR has valid time OR has active status
  return hasHashrate || hasPayment || hasValidTime || isActiveStatus;
}

// ============================================================
// DATABASE HELPERS
// ============================================================

function dbGetAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbRunAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function dbAllAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// ============================================================
// TELEGRAM
// ============================================================

export async function getTelegramStatus() {
  try {
    await dbRunAsync("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)");
    const row = await dbGetAsync("SELECT value FROM settings WHERE key = 'telegram_enabled'");
    return { enabled: row ? row.value === 'true' : true };
  } catch (err) {
    return { enabled: true };
  }
}

export async function setTelegramStatus(enabled) {
  const val = enabled ? 'true' : 'false';
  await dbRunAsync("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)");
  await dbRunAsync(
    "INSERT INTO settings (key, value) VALUES ('telegram_enabled', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [val]
  );
  return { enabled: !!enabled };
}

export async function sendTelegramInternal(message) {
  const status = await getTelegramStatus();
  if (!status.enabled) {
    console.log('[telegram] Notifications disabled.');
    return { ok: true };
  }
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) throw new Error('Telegram credentials missing');
  const text = String(message || '').trim();
  if (!text) throw new Error('Message empty');
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
  });
  const data = await res.json();
  if (res.ok && data?.ok) return data;
  throw new Error(data?.description || `HTTP ${res.status}`);
}

// ============================================================
// NICEHASH
// ============================================================

const MONITOR_NH_ORDERS_TTL = 60 * 1000;
const monitorNhOrdersCache = new Map();

function getMonitorNhAlgoPriceUnit(order, fallbackAlgo) {
  const algo = normalizeAlgoForNiceHash(order?.algorithm || order?.algo || order?.type || fallbackAlgo);
  return getMrrAlgorithmUnit(algo);
}

async function getMonitorNhActiveOrders(clientName) {
  const cacheKey = String(clientName || 'BT').toUpperCase();
  const cached = monitorNhOrdersCache.get(cacheKey);
  if (cached && (Date.now() - cached.ts < MONITOR_NH_ORDERS_TTL)) return cached.orders;
  const cfg = nhConfigs[cacheKey];
  if (!cfg?.apiKey || !cfg?.apiSecret || !cfg?.orgId) return [];
  const { client } = resolveNhClient(cacheKey);
  if (!client) return [];
  const result = await getNiceHashApp(client).hashpower.getMyOrders({ op: 'LE', limit: 100 });
  const rawList = result?.list || result?.myOrders || (Array.isArray(result) ? result : []);
  const activeOrders = rawList.filter(o => String(o?.status?.code || o?.status || '').toUpperCase() === 'ACTIVE');
  monitorNhOrdersCache.set(cacheKey, { orders: activeOrders, ts: Date.now() });
  return activeOrders;
}

// ============================================================
// CONSTANTS
// ============================================================

const { ALERT_COOLDOWN_MS, WARNING_RIG_THRESHOLD } = TELEGRAM_CONFIG;
const RENTED_HEARTBEAT_MS = 10 * 60 * 1000;

const lastAlertTimes = new Map([['global_summary', Date.now()]]);
const lastRigStates = new Map();
const monitorNhPriceCache = new Map();
const monitorNhPriceErrorCache = new Map();

let isMonitorRunning = false;

// ============================================================
// MAIN MONITOR FUNCTION - SIMPLIFIED
// ============================================================

export async function runRentalMonitor(forceNotify = false, clientScope = 'ALL') {
  if (isMonitorRunning) {
    console.log(`[Monitor] Already running, skipping...`);
    return { notifications: [], summary: { error: 'Monitor already running' } };
  }
  
  isMonitorRunning = true;
  
  try {
    const requestedScope = String(clientScope || 'ALL').trim().toUpperCase();
    const scopeList = requestedScope.split(',').map(s => s.trim());

    const allConfiguredAccts = Object.keys(mrrConfigs).filter(
      k => mrrConfigs[k].apiKey && mrrConfigs[k].apiSecret
    );

    const mrrAccts = (scopeList.includes('ALL') || scopeList.includes('VN') || scopeList.some(s => isAggregate(s)))
      ? allConfiguredAccts
      : allConfiguredAccts.filter(acct => scopeList.includes(acct.toUpperCase()));

    const now = Date.now();
    const notifications = [];
    const activeRentalLines = [];
    const accountMetrics = [];
    const allRentedRigs = [];
    const successfulAccts = [];
    const currentActiveRentalIds = new Set();
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

    if (mrrAccts.length === 0) {
      console.warn(`[${new Date().toLocaleTimeString()}] No accounts for scope: ${requestedScope}`);
      return { notifications: [], summary: { error: 'No accounts configured' } };
    }

    console.log(`[${new Date().toLocaleTimeString()}] Starting check for ${mrrAccts.length} accounts...`);

    // ============================================================
    // PROCESS EACH ACCOUNT
    // ============================================================
    let totalAll = 0;
    let availableAll = 0;
    let rentedAll = 0;
    let offlineAll = 0;
    let disabledAll = 0;
    let warningAll = 0;
    let onlineAll = 0;

    await Promise.all(mrrAccts.map(async (acct) => {
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
        const [rigsRes, boughtRes, soldRes] = await Promise.all([
          mrrApiCall({ endpoint: '/rig/mine', clientNameRaw: acct }),
          mrrApiCall({ endpoint: '/rental', query: { type: 'bought' }, clientNameRaw: acct }),
          mrrApiCall({ endpoint: '/rental', query: { type: 'sold' }, clientNameRaw: acct })
        ]);

        // Process rigs - get rented rigs
        if (rigsRes.statusCode === 200 && rigsRes.data?.success) {
          const rigList = extractArray(rigsRes.data);
          const rentedRigs = [];
          let availableCount = 0;
          let offlineCount = 0;
          let disabledCount = 0;
          let warningCount = 0;
          let onlineCount = 0;

          for (const rig of rigList) {
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

          metric.total = rigList.length;
          metric.online = onlineCount;
          metric.offline = offlineCount;
          metric.disabled = disabledCount;
          metric.warning = warningCount;

          totalAll += rigList.length;
          availableAll += availableCount;
          offlineAll += offlineCount;
          disabledAll += disabledCount;
          warningAll += warningCount;
          onlineAll += onlineCount;
          allRentedRigs.push(...rentedRigs.map(r => ({ ...r, acct })));
          successfulAccts.push(acct);
        } else if (rigsRes.data) {
          const errMsg = rigsRes.data.data?.message || rigsRes.data.message || rigsRes.data.error || 'Unknown';
          console.warn(`[${new Date().toLocaleTimeString()}] Account ${acct} rig list failed: ${errMsg}`);
          metric.error = true;
        }

        // Process rentals
        const soldRentalsRaw = extractArray(soldRes.data || {}).map(r => ({ ...r, __rentalSide: 'sold' }));
        const boughtRentalsRaw = extractArray(boughtRes.data || {}).map(r => ({ ...r, __rentalSide: 'bought' }));
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
        const realRentals = [];
        const ghostRentalIds = [];

        for (const [rentalId, r] of rentalsMap) {
          const info = extractRentalInfo(r);
          if (!isRealRental(r, info)) {
            ghostRentalIds.push(rentalId);
          } else {
            realRentals.push([rentalId, r]);
          }
        }

        if (ghostRentalIds.length > 0) {
          console.log(`[monitor:${acct}] Skipping ${ghostRentalIds.length} ghost rentals.`);
        }

        let realRentalCount = 0;
        for (const [rentalId, r] of realRentals) {
          const info = extractRentalInfo(r);

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

          const startT = parseUtcTime(info.startTime);
          const endT = parseUtcTime(info.endTime);
          
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
              let nhP = monitorNhPriceCache.get(cacheKey);
              if (!nhP) {
                const activeOrders = await getMonitorNhActiveOrders(acct);
                const matchedOrder = activeOrders.find(o => normalizeAlgoForNiceHash(o?.algorithm || o?.algo || o?.type) === nhAlgo);
                if (matchedOrder) {
                  nhP = {
                    price: parseFloat(matchedOrder?.price ?? matchedOrder?.marketPrice ?? matchedOrder?.fixedPrice ?? 0) || 0,
                    unit: getMonitorNhAlgoPriceUnit(matchedOrder, nhAlgo)
                  };
                  if (nhP.price > 0) monitorNhPriceCache.set(cacheKey, nhP);
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

    // Get 24h rental count
    const rented24hRow = await dbGetAsync(
      "SELECT COUNT(*) as count FROM rental_history WHERE start_time >= ?",
      [todayStartTs]
    );
    const rented24hCount = rented24hRow ? rented24hRow.count : 0;

    // Flush queued messages
    await flushQueuedTelegramMessages();

    // ============================================================
    // SEND SUMMARY
    // ============================================================
    rentedAll = accountMetrics.reduce((sum, m) => sum + (Number(m.rented) || 0), 0);

    // Log the rental count
    console.log(`[Monitor] 📊 Real rentals: ${rentedAll}`);

    const shouldSendSummary = forceNotify || (now - (lastAlertTimes.get('global_summary') || 0) >= RENTED_HEARTBEAT_MS);

    if (shouldSendSummary && (accountMetrics.length > 0 || activeRentalLines.length > 0)) {
      const maxBarLen = 30;
      const barChart = accountMetrics.map(am => {
        const ratio = totalAll > 0 ? am.total / totalAll : 0;
        const filled = Math.max(1, Math.round(ratio * maxBarLen));
        const bar = '█'.repeat(filled);
        const statusNote = am.error ? ' [ERROR]' : am.total;
        return `<code>${am.name.padEnd(4)}${bar.padEnd(maxBarLen + 1)}${statusNote}</code>`;
      }).join('\n');

      const finishTime = new Date().toLocaleTimeString();
      const onlineAlgoLines = Array.from(globalOnlineAlgos.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([algo, count]) => `• ${getAlgoDisplayName(algo)}: <b>${count}</b>`);

      try {
        const summaryMsg = TelegramTemplates.heartbeatSummary(
          barChart,
          onlineAll,
          rentedAll,
          offlineAll,
          disabledAll,
          totalAll,
          activeRentalLines,
          finishTime,
          rented24hCount,
          onlineAlgoLines
        );

        await sendTelegramInternal(summaryMsg);
        lastAlertTimes.set('global_summary', now);
      } catch (e) {
        console.error(`[${new Date().toLocaleTimeString()}] [monitor] Summary send failed: ${e.message}`);
      }
    }

    return {
      notifications,
      summary: {
        scope: requestedScope,
        accounts: mrrAccts,
        totals: {
          rigs: totalAll,
          available: availableAll,
          rented: rentedAll,
          offline: offlineAll,
          disabled: disabledAll,
          warning: warningAll,
        },
        perAccount: accountMetrics,
      },
    };
  } finally {
    isMonitorRunning = false;
  }
}

// ============================================================
// FORCE CHECK
// ============================================================

export async function forceCheckRentals(clientScope = 'ALL') {
  console.log(`[Monitor] 🔄 Force check triggered for scope: ${clientScope}`);
  try {
    const result = await runRentalMonitor(true, clientScope);
    if (result.summary?.error) {
      return { success: false, message: `Force check failed: ${result.summary.error}`, result };
    }
    return {
      success: true,
      message: `Force check completed. Found ${result.summary.totals?.rented || 0} active rentals.`,
      result
    };
  } catch (error) {
    return { success: false, message: `Force check error: ${error.message}` };
  }
}