// rentalProcessor.js - Complete upgraded version
import { dbRunAsync, dbGetAsync } from "./dbHelpers.js";
import { logger } from "../logger.js";
import { TELEGRAM_CONFIG, TelegramTemplates } from "../../src/core/telegram.js";
import {
  getMrrAlgorithmUnit,
  calculatePriceComparison,
  normalizeAlgoForNiceHash,
  getAlgoMapping,
} from "../../src/core/mapping.js";
import { getBtcPriceData } from "../../src/core/priceUtils.js";
import { getMonitorNhActiveOrders, sendTelegramInternal } from "../monitor/helpers.js";
import { extractRentalInfo } from "../utils.js";
import { getNiceHashPriceValue } from "../../src/core/mrrUtils.js";

const { ALERT_COOLDOWN_MS } = TELEGRAM_CONFIG;

const lastAlertTimes = new Map();
const monitorNhPriceCache = new Map();
const monitorNhPriceErrorCache = new Map();

// ============================================================
// HELPER: Format hashrate for display
// ============================================================
function formatHashrate(value, suffix) {
  const num = Number.parseFloat(value || 0);
  if (!Number.isFinite(num) || num <= 0) return "0 H/s";
  
  const units = [" H/s", " KH/s", " MH/s", " GH/s", " TH/s", " PH/s", " EH/s"];
  let idx = 0;
  let scaled = num;
  while (scaled >= 1000 && idx < units.length - 1) {
    scaled /= 1000;
    idx += 1;
  }
  const unit = suffix || units[idx] || "H/s";
  return `${scaled.toFixed(2)}${unit.toUpperCase()}`;
}

// ============================================================
// HELPER: Resolve algorithm for display
// ============================================================
function resolveRentalAlgo(rental, info) {
  const algo = info?.algo || 
               rental?.algo || 
               rental?.algorithm || 
               rental?.rig?.type || 
               rental?.miningAlgorithm || 
               "N/A";
  
  try {
    const mapping = getAlgoMapping(algo);
    return mapping.displayName || algo;
  } catch (err) {
    return algo;
  }
}

// ============================================================
// HELPER: Parse UTC time consistently
// ============================================================
function parseUtcTime(dateString) {
    if (!dateString) return 0;
    const s = String(dateString).trim();
    if (!s) return 0;
    
    // Try direct Date parsing first (handles ISO, UTC, etc.)
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.getTime();
    
    // Try adding UTC suffix if missing
    if (!s.endsWith("UTC") && !s.endsWith("Z") && !s.includes("+") && !s.includes("-")) {
        const d2 = new Date(s + " UTC");
        if (!isNaN(d2.getTime())) return d2.getTime();
    }
    
    // Try parsing with timezone offset
    try {
        const d3 = new Date(s.replace(/UTC/g, 'GMT'));
        if (!isNaN(d3.getTime())) return d3.getTime();
    } catch (err) {
        // Ignore
    }
    
    return 0;
}

// ============================================================
// HELPER: Format remaining time
// ============================================================
function formatRemainingTime(remainingMs) {
    if (remainingMs <= 0) return "Finished";
    if (!Number.isFinite(remainingMs)) return "N/A";
    
    const seconds = Math.floor(remainingMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    const remainingMinutes = minutes % 60;
    
    if (days > 0) {
        return `${days}d ${remainingHours}h ${remainingMinutes}m`;
    } else if (hours > 0) {
        return `${hours}h ${remainingMinutes}m`;
    } else if (minutes > 0) {
        return `${minutes}m`;
    } else {
        return `${seconds}s`;
    }
}

/**
 * Checks if a rental is actively mining and has data, or is new enough to be considered valid.
 * This filters out "ghost" rentals that are stuck in a rented state without ever starting.
 */
// rentalProcessor.js - Simplified isRealRental function

/**
 * Checks if a rental is real based on two simple criteria:
 * 1. Started less than 7 days ago
 * 2. OR has remaining time (not finished)
 */
export function isRealRental(rental, info, now = Date.now()) {
    if (!rental || !info) return false;
    
    const rentalId = rental.id || rental.rentalid || rental.rental_id;
    if (!rentalId) return false;

    // ============================================================
    // ✅ CRITICAL: Check if this is actually a rental or just a rig with a rental ID
    // ============================================================
    // Rentals have these fields, rigs don't
    const hasRentalFields = Boolean(
        rental.start_time || 
        rental.startTime || 
        rental.end_time || 
        rental.endTime || 
        rental.price || 
        rental.paid
    );
    
    // If it doesn't have rental fields, it's just a rig, not a rental
    if (!hasRentalFields) {
        logger.debug(`[monitor:isRealRental] ${rentalId} is a rig with rental ID, not a real rental (no rental fields).`);
        return false;
    }

    // Parse times
    const rawStart = info.startTime || rental.start_time || rental.startTime || 0;
    const rawEnd = info.endTime || rental.end_time || rental.endTime || 0;
    const startT = parseUtcTime(rawStart);
    const endT = parseUtcTime(rawEnd);

    // ============================================================
    // ✅ Must have valid start AND end times
    // ============================================================
    if (startT <= 0 || endT <= 0) {
        logger.debug(`[monitor:isRealRental] ${rentalId} has invalid times (start: ${startT}, end: ${endT}), skipping.`);
        return false;
    }

    // ============================================================
    // ✅ Must have remaining time (not finished)
    // ============================================================
    const remainingMs = Math.max(0, endT - now);
    if (remainingMs <= 0) {
        logger.debug(`[monitor:isRealRental] ${rentalId} is finished, skipping.`);
        return false;
    }

    // ============================================================
    // ✅ Must have either hashrate OR payment
    // ============================================================
    const currentHash = parseFloat(info.hashrate?.current || 0);
    const averageHash = parseFloat(info.hashrate?.average || 0);
    const paidAmount = parseFloat(info.price?.paid || rental.price || 0);
    const hasActivity = currentHash > 0 || averageHash > 0 || paidAmount > 0;

    if (!hasActivity) {
        logger.debug(`[monitor:isRealRental] ${rentalId} has no activity (hashrate or payment), skipping.`);
        return false;
    }

    logger.debug(`[monitor:isRealRental] ${rentalId} is a real rental (remaining: ${formatRemainingTime(remainingMs)}, hashrate: ${currentHash > 0 || averageHash > 0}, paid: ${paidAmount > 0})`);
    return true;
}

function hasActiveRentalSignal(rental, info, now = Date.now()) {
    const rentalId = rental.id || rental.rentalid || rental.rental_id;
    if (!rentalId) return false;

    // ============================================================
    // ✅ CRITICAL: Must have rental fields
    // ============================================================
    const hasRentalFields = Boolean(
        rental.start_time || 
        rental.startTime || 
        rental.end_time || 
        rental.endTime || 
        rental.price || 
        rental.paid ||
        info.startTime ||
        info.endTime
    );
    
    if (!hasRentalFields) {
        return false;
    }

    // Parse times
    const endT = parseUtcTime(info.endTime || rental.end_time || rental.endTime || 0);
    
    // Must have future end time
    if (endT <= 0 || endT <= now) {
        return false;
    }

    // Must have either timing or price
    const hasTiming = Boolean(info.startTime || rental.start_time || rental.startTime);
    const hasPrice = parseFloat(info?.price?.paid || rental?.price || 0) > 0;
    
    // Check status
    const statusRaw = rental?.status || rental?.state || rental?.rig?.status;
    const status = String(typeof statusRaw === 'object' ? statusRaw?.status || '' : statusRaw || '').toLowerCase();
    const isActiveStatus = status.includes('rented') || status.includes('active') || status.includes('running');

    return (hasTiming || hasPrice || isActiveStatus) && endT > now;
}

/**
 * Fetches the price of an active NiceHash order that matches the rental's algorithm.
 * @param {object} rental - The MRR rental object.
 * @param {string} acct - The account name (e.g., 'BT', 'PH').
 * @returns {Promise<number|null>} The price of the matched order, or null if not found.
 */
async function getNiceHashOrderPriceForRental(rental, acct) {
    try {
        const nhAlgo = normalizeAlgoForNiceHash(rental.algo);
        if (!nhAlgo || nhAlgo === "UNKNOWN" || nhAlgo === "N/A") {
            return null;
        }

        const activeOrders = await getMonitorNhActiveOrders(acct);
        const matchedOrder = activeOrders.find(
            (order) => normalizeAlgoForNiceHash(order?.algorithm?.enumName || order?.algorithm || order?.algo) === nhAlgo
        );

        if (matchedOrder) {
            const price = parseFloat(matchedOrder.price || 0);
            return price > 0 ? price : null;
        }
    } catch (err) {
        logger.error(`[monitor] Error in getNiceHashOrderPriceForRental for rental ${rental.id}: ${err.message}`);
    }

    return null;
}

async function sendTelegramNotification(message, options = {}) {
    const text = String(message || "").trim();
    if (!text) return;

    try {
        await sendTelegramInternal(text);
        if (options.onSuccess) await options.onSuccess();
    } catch (err) {
        if (options.onFailure) await options.onFailure(err);
    }
}

async function getPriceRoi(info, acct, now) {
    try {
        const nhAlgo = normalizeAlgoForNiceHash(info.algo);
        if (!nhAlgo || nhAlgo === "UNKNOWN" || nhAlgo === "N/A") throw new Error("Unsupported algorithm");

        const cacheKey = `${nhAlgo}:${acct}`;
        const cachedError = monitorNhPriceErrorCache.get(cacheKey);
        if (cachedError && now - cachedError.ts < 10 * 60 * 1000) {
            throw new Error(cachedError.message);
        }

        let nhP = monitorNhPriceCache.get(cacheKey);

        if (!nhP) {
            const activeOrders = await getMonitorNhActiveOrders(acct);
            const matchedOrder = activeOrders.find(
                (order) => normalizeAlgoForNiceHash(order?.algorithm || order?.algo || order?.type) === nhAlgo
            );
            if (!matchedOrder) throw new Error(`No active NiceHash order found for ${nhAlgo}`);

            nhP = {
                price: parseFloat(matchedOrder?.price ?? matchedOrder?.marketPrice ?? matchedOrder?.fixedPrice ?? 0) || 0,
                unit: getMrrAlgorithmUnit(nhAlgo),
            };
            if (nhP.price <= 0) throw new Error("NiceHash price unavailable");
            monitorNhPriceCache.set(cacheKey, nhP);
            monitorNhPriceErrorCache.delete(cacheKey);
        }

        const mrrBtcData = getBtcPriceData(info.price);
        const mrrUnit = getMrrAlgorithmUnit(info.algo);
        const advertised = parseFloat(info.hashrate.advertised);
        const durationHours = Number.parseFloat(info.duration) || 0;

        const mrrPriceNorm = (durationHours > 0 && advertised > 0)
            ? (mrrBtcData.value / (durationHours / 24)) / advertised
            : 0;

        if (nhP.price > 0 && mrrPriceNorm > 0) {
            return calculatePriceComparison(mrrPriceNorm, mrrUnit, nhP.price, nhP.unit);
        }
    } catch (err) {
        const nhAlgoForLog = normalizeAlgoForNiceHash(info.algo);
        const cacheKey = `${nhAlgoForLog}:${acct}`;
        const cachedError = monitorNhPriceErrorCache.get(cacheKey);
        if (!cachedError || cachedError.message !== err.message || now - cachedError.ts >= 10 * 60 * 1000) {
            monitorNhPriceErrorCache.set(cacheKey, { message: err.message, ts: now });
            logger.warn(`[monitor] ROI price skipped for ${cacheKey}: ${err.message}`);
        }
    }
    return null;
}

export async function processRental(rental, acct, now, forceNotify, notifiedRentalIdsThisRun, notifications, liveRig = null) {
    const info = extractRentalInfo(rental, liveRig);
    const isValidRental = isRealRental(rental, info, now);

    if (!isValidRental) {
        logger.debug(`[monitor:process] Skipped invalid or ghost rental: ${rental.id || 'N/A'}`);
        return { isValid: false };
    }

    // ✅ Use consistent UTC parsing
    const startT = parseUtcTime(info.startTime);
    const endT = parseUtcTime(info.endTime);
    
    const totalDurationMs = startT > 0 && endT > 0 ? endT - startT : 0;
    const elapsedMs = startT > 0 ? Math.max(0, Math.min(now - startT, totalDurationMs)) : 0;
    const remainingMs = endT > 0 ? Math.max(0, endT - now) : 0;

    // ============================================================
    // EXTRACT HASHRATE VALUES - KEEP CURRENT AND AVERAGE SEPARATE
    // ============================================================
    const advertised = parseFloat(info.hashrate?.advertised || 0);
    const average = parseFloat(info.hashrate?.average || 0);
    const suffix = info.hashrate?.suffix || "H/s";

    // Get current hashrate from extractRentalInfo output
    const current = parseFloat(info.hashrate?.current || 0);

    // Log raw values for debugging
    logger.debug(`[monitor] ${rental.id} - Raw: current=${current}, avg=${average}, adv=${advertised}`);

    // ============================================================
    // FORMAT HASHRATE VALUES FOR DISPLAY
    // ============================================================
    let currentDisplay;
    if (current > 0) {
      currentDisplay = formatHashrate(current, suffix);
    } else if (average > 0) {
      currentDisplay = formatHashrate(average, suffix);
    } else {
      currentDisplay = "⚠️ 0 H/s";
    }

    const avgDisplay = average > 0 ? formatHashrate(average, suffix) : "0 H/s";
    const advDisplay = advertised > 0 
        ? formatHashrate(advertised, suffix)
        : "0 H/s";

    // Log formatted values for debugging
    logger.debug(`[monitor] ${rental.id} - Formatted: cur=${currentDisplay}, avg=${avgDisplay}, adv=${advDisplay}`);

    const totalExpectedHashes = advertised * (totalDurationMs / 1000);
    const actualHashesDone = average * (elapsedMs / 1000);
    const remainingHashesNeeded = totalExpectedHashes - actualHashesDone;
    const requiredHashrate = remainingMs > 0 ? remainingHashesNeeded / (remainingMs / 1000) : 0;
    const displayTarget = Number.isFinite(requiredHashrate) && requiredHashrate > 0 ? requiredHashrate : 0;
    const efficiency = parseFloat(info.percent || 0);

    const priceRoi = await getPriceRoi(info, acct, now);
    const orderDiff = priceRoi !== null && !isNaN(priceRoi) ? priceRoi : (100 - efficiency).toFixed(1);

    const row = await dbGetAsync(`SELECT last_notified, low_hashrate_start, zero_hashrate_start FROM rentals WHERE id = ?`, [String(rental.id)]).catch(() => null);

    let lowHashStart = row?.low_hashrate_start || 0;
    let zeroHashStart = row?.zero_hashrate_start || 0;
    let lastNotified = row?.last_notified || 0;

    await dbRunAsync(
        `INSERT INTO rentals (id, name, client, start_time, end_time, algo, target_100, order_diff, last_updated, low_hashrate_start, zero_hashrate_start, current_hashrate, average_hashrate, advertised_hashrate, price_paid, last_notified) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET 
           name=excluded.name, client=excluded.client, algo=excluded.algo, order_diff=excluded.order_diff, start_time=excluded.start_time, end_time=excluded.end_time, target_100=excluded.target_100, last_updated=excluded.last_updated, low_hashrate_start=excluded.low_hashrate_start, zero_hashrate_start=excluded.zero_hashrate_start, current_hashrate=excluded.current_hashrate, average_hashrate=excluded.average_hashrate, advertised_hashrate=excluded.advertised_hashrate, price_paid=excluded.price_paid`,
        [String(rental.id), liveRig?.name || rental.name || rental.id, acct, startT, endT, info.algo, displayTarget, orderDiff, now, lowHashStart, zeroHashStart, current, average, advertised, info.price.paid, lastNotified]
    ).catch(err => logger.error(`[monitor:db] Upsert error for ${rental.id}: ${err.message}`));

    if (startT > 0) {
        await dbRunAsync("INSERT OR IGNORE INTO rental_history (id, start_time) VALUES (?, ?)", [String(rental.id), startT]);
    }

    // --- Alerts ---
    if (efficiency < 50) {
        if (lowHashStart === 0) lowHashStart = now;
        if (now - lowHashStart >= 900000) {
            const alertKey = `${rental.id}_low_50`;
            if (now - (lastAlertTimes.get(alertKey) || 0) > ALERT_COOLDOWN_MS) {
                const msg = TelegramTemplates.efficiency(acct, rental, info, efficiency, displayTarget, info.algo);
                sendTelegramNotification(msg, { type: "LOW EFFICIENCY", label: `Low efficiency ${acct} ${rental.id}` });
                lastAlertTimes.set(alertKey, now);
            }
        }
    } else {
        lowHashStart = 0;
    }

    const isTrulyStalled = current === 0 && average === 0;
    if (current === 0) {
        if (zeroHashStart === 0) zeroHashStart = now;
        if (now - zeroHashStart >= 600000 && isTrulyStalled) {
            const alertKey = `${rental.id}_zero_10m`;
            if (now - (lastAlertTimes.get(alertKey) || 0) > ALERT_COOLDOWN_MS) {
                const msg = TelegramTemplates.zeroHashrate(acct, rental, info, info.algo, advDisplay);
                sendTelegramNotification(msg, { type: "ZERO HASHRATE", label: `Zero hashrate ${acct} ${rental.id}` });
                lastAlertTimes.set(alertKey, now);
            }
        }
    } else {
        zeroHashStart = 0;
    }

    // --- New Rental Notification ---
    const isNewToMonitor = lastNotified === 0;
    const alreadyNotifiedThisRun = notifiedRentalIdsThisRun.has(String(rental.id));
    if (!alreadyNotifiedThisRun && (forceNotify || isNewToMonitor)) {
        notifiedRentalIdsThisRun.add(String(rental.id));
        const hbType = forceNotify ? "MONITOR" : "NEW RENTAL";
        
        // ✅ Use the formatRemainingTime helper
        const remStr = formatRemainingTime(remainingMs);
        const rentalForNotice = { ...rental, name: liveRig?.name || rental.name || rental.id };
        
        // ✅ Get the algorithm display name
        const algoDisplay = resolveRentalAlgo(rental, info);
        
        const msg = forceNotify
            ? TelegramTemplates.rentedNotice(
                hbType,
                rentalForNotice,
                info,
                acct,
                orderDiff, // ROI
                remStr,
                algoDisplay,
                advDisplay
            )
            : TelegramTemplates.newRental(
                acct,
                rentalForNotice,
                info.price?.paid || "0.00",
                info.startTime,
                info.endTime,
                algoDisplay,
                advDisplay
            );

        sendTelegramNotification(msg, {
          type: hbType,
            label: `${hbType} ${acct} ${rental.id}`,
            onSuccess: async () => {
                await dbRunAsync(`UPDATE rentals SET last_notified = ? WHERE id = ?`, [now, String(rental.id)]);
                notifications.push({ id: rental.id, client: acct, status: "Sent", telegram: "ok" });
            },
            onFailure: (tgErr) => {
                notifications.push({ id: rental.id, client: acct, status: "Failed", error: tgErr.message });
            },
        });
    } else if (!alreadyNotifiedThisRun) {
        notifications.push({ id: rental.id, client: acct, status: "Skipped", reason: "Already notified" });
    }

    // --- Build Summary Line with PROPER HASHRATE VALUES ---
    const remStr_s = formatRemainingTime(remainingMs);
    const perfEmoji = efficiency >= 100 ? "✅" : efficiency >= 90 ? "🟢" : efficiency >= 70 ? "🔵" : efficiency >= 50 ? "🟡" : "🔴";

    // ✅ Get the algorithm display name for the summary
    const algoDisplay = resolveRentalAlgo(rental, info);

    // ============================================================
    // BUILD ACTIVE RENTAL LINE WITH CORRECT PARAMETER ORDER
    // ============================================================
    const activeRentalLine = TelegramTemplates.activeRentalLine(
        perfEmoji,                    // 1: perfEmoji
        algoDisplay,                  // 2: algo (FIXED: using resolved algorithm)
        liveRig?.name || rental.name || rental.id, // 3: name
        remStr_s,                     // 4: remaining
        efficiency,                   // 5: efficiency
        orderDiff,                    // 6: roi
        avgDisplay,                   // 7: avg
        advDisplay,                   // 8: ads
        currentDisplay,               // 9: cur
        displayTarget,                // 10: target
        acct,                         // 11: client
        info                          // 12: info
    );

    return {
        isValid: true,
        activeRentalLine,
        efficiency,
        target: displayTarget,
        current,
        average,
        advertised,
        remainingMs,
        remStr: remStr_s
    };
}