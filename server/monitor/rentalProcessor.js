// rentalProcessor.js - Complete upgraded version
import { dbRunAsync, dbGetAsync } from "./dbHelpers.js";
import { logger } from "../logger.js";
import { TELEGRAM_CONFIG, TelegramTemplates } from "../../src/core/telegram.js";
import {
  normalizeAlgoForNiceHash,
  getMrrAlgorithmUnit,
  calculatePriceComparison,
  getAlgoDisplayName,
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
  
  const units = ["H/s", "KH/s", "MH/s", "GH/s", "TH/s", "PH/s", "EH/s", "ZH/s"];
  let idx = 0;
  let scaled = num;
  while (scaled >= 1000 && idx < units.length - 1) {
    scaled /= 1000;
    idx += 1;
  }
  const unit = suffix || units[idx] || "H/s";
  return `${scaled.toFixed(2)}${unit.toUpperCase()}`;
}

/**
 * Checks if a rental is actively mining and has data, or is new enough to be considered valid.
 * This filters out "ghost" rentals that are stuck in a rented state without ever starting.
 */
export function isRealRental(rental, info, now = Date.now()) {
    if (!rental || !info) {
        logger.debug(`[monitor:isRealRental] Skipped due to missing rental or info object.`);
        return false;
    }

    const rentalId = rental.id || rental.rentalid || rental.rental_id;
    if (!rentalId) {
        logger.debug(`[monitor:isRealRental] Skipped due to missing rental ID.`);
        return false;
    }

    // Check for any sign of activity
    const currentHash = parseFloat(info.hashrate?.current || 0);
    const averageHash = parseFloat(info.hashrate?.average || 0);
    const paidAmount = parseFloat(info.price?.paid || 0);

    // If there's any activity or payment, it's real
    if (paidAmount > 0 || averageHash > 0) {
        logger.debug(`[monitor:isRealRental] Rental ${rentalId} is real (has paid amount or hashrate).`);
        return true;
    }

    // For new rentals, check their age
    const rawStart = info.startTime || rental.start_time || rental.startTime || rental.created_at || 0;
    if (!rawStart) {
        if (parseFloat(rental.price || 0) > 0) {
            logger.debug(`[monitor:isRealRental] Rental ${rentalId} is real (has price).`);
            return true;
        }
        logger.debug(`[monitor:isRealRental] Rental ${rentalId} is NOT real (no activity and no start time).`);
        return false;
    }

    const startT = new Date(String(rawStart).endsWith("UTC") ? rawStart : `${rawStart} UTC`).getTime();
    const ageMs = now - startT;

    // Grace period: if it started in the last hour, consider it real.
    if (ageMs > 0 && ageMs < 60 * 60 * 1000) {
        logger.debug(`[monitor:isRealRental] Rental ${rentalId} is considered real (in 1-hour grace period).`);
        return true;
    }

    // If it has a price or advertised hashrate, consider it real
    const advertisedHash = parseFloat(info.hashrate?.advertised || 0);
    const price = parseFloat(info.price?.paid || info.price?.price || rental.price || 0);
    if (advertisedHash > 0 || price > 0) {
        logger.debug(`[monitor:isRealRental] Rental ${rentalId} is real (has advertised hashrate or price).`);
        return true;
    }

    logger.debug(`[monitor:isRealRental] Rental ${rentalId} is a ghost (age: ${Math.round(ageMs / 1000)}s, no activity).`);
    return false;
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
            // This is a common case for algos not on NiceHash, so we just return null.
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

    const parseUtc = (d) => {
        if (!d) return 0;
        const s = String(d);
        return new Date(s.endsWith("UTC") || s.endsWith("Z") || s.includes("+") ? s : s + " UTC").getTime();
    };

    const startT = parseUtc(info.startTime);
    const endT = parseUtc(info.endTime);
    const totalDurationMs = startT > 0 && endT > 0 ? endT - startT : 0;
    const elapsedMs = startT > 0 ? Math.max(0, Math.min(now - startT, totalDurationMs)) : 0;
    const remainingMs = endT > 0 ? Math.max(0, endT - now) : 0;

    // ============================================================
    // EXTRACT HASHRATE VALUES - KEEP CURRENT AND AVERAGE SEPARATE
    // ============================================================
    const advertised = parseFloat(info.hashrate?.advertised || 0);
    const average = parseFloat(info.hashrate?.average || 0);
    const current = parseFloat(info.hashrate?.current || rental?.hashrate?.current || 0);
    const suffix = info.hashrate?.suffix || "H/s";

    // Log raw values for debugging
    logger.debug(`[monitor] ${rental.id} - Raw: current=${current}, avg=${average}, adv=${advertised}`);

    // ============================================================
    // FORMAT HASHRATE VALUES FOR DISPLAY
    // ============================================================
    const currentDisplay = current > 0 
        ? formatHashrate(current, suffix)
        : "0 H/s";

    const avgDisplay = average > 0 
        ? formatHashrate(average, suffix)
        : "0 H/s";

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
    const withinReasonableStart = startT > 0 && elapsedMs < 10 * 60 * 1000;
    const alreadyNotifiedThisRun = notifiedRentalIdsThisRun.has(String(rental.id));
    if (!alreadyNotifiedThisRun && (forceNotify || (isNewToMonitor && withinReasonableStart))) {
        notifiedRentalIdsThisRun.add(String(rental.id));
        const hbType = forceNotify ? "MONITOR" : "RENTING";

        const remD = Math.floor(remainingMs / 86400000);
        const remH = Math.floor((remainingMs % 86400000) / 3600000);
        const remM = Math.floor((remainingMs % 3600000) / 60000);
        const remStr = remainingMs <= 0 ? "Finished" : remD > 0 ? `${remD}d ${remH}h` : `${remH}h ${remM}m`;

        const rentalForNotice = { ...rental, name: liveRig?.name || rental.name || rental.id };

        const msg = TelegramTemplates.rentedNotice(hbType, rentalForNotice, info, acct, remStr, info.algo, advDisplay);

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
    const hasEndTime = endT > 0;
    const isFinished_s = remainingMs <= 0;
    const remD_s = Math.floor(remainingMs / 86400000);
    const remH_s = Math.floor((remainingMs % 86400000) / 3600000);
    const remM_s = Math.floor((remainingMs % 3600000) / 60000);

    const remStr_s = isFinished_s ? "Finished" : hasEndTime ? (remD_s > 0 ? `${remD_s}d ${remH_s}h` : `${remH_s}h ${remM_s}m`) : "Active";
    const perfEmoji = efficiency >= 100 ? "✅" : efficiency >= 90 ? "🟢" : efficiency >= 70 ? "🔵" : efficiency >= 50 ? "🟡" : "🔴";

    const nhOrderPrice = await getNiceHashOrderPriceForRental(order.price, rental, acct);
    // ============================================================
    // BUILD SPEED STATUS - Use average as fallback when current is 0
    // ============================================================
    let speedStatus;
    if (current > 0) {
        // Current has data - use it
        speedStatus = currentDisplay;
    } else if (average > 0) {
        // Current is 0 but average has data - rental IS mining, use average
        speedStatus = avgDisplay;
    } else {
        // Both are 0 - truly stalled
        speedStatus = "⚠️ 0 H/s";
    }

    // Log for debugging
    logger.debug(`[monitor] ${rental.id} - SpeedStatus: ${speedStatus} (current=${current}, avg=${average})`);

    // ============================================================
    // BUILD ACTIVE RENTAL LINE WITH CORRECT PARAMETER ORDER
    // ============================================================
    const activeRentalLine = TelegramTemplates.activeRentalLine(
        perfEmoji,                    // 1: perfEmoji
        getAlgoDisplayName(info.algo), // 2: algo
        liveRig?.name || rental.name || rental.id, // 3: name
        remStr_s,                     // 4: remaining
        efficiency,                   // 5: efficiency
        orderDiff,                    // 6: roi
        speedStatus,                  // 9: cur (current hashrate - uses average as fallback)
        advDisplay,                   // 8: ads (advertised hashrate)
        avgDisplay,                   // 7: avg (average hashrate)
        displayTarget,                // 10: target
        "",                           // 11: extra
        acct,                         // 12: client
        info                          // 13: info
    );

    return {
        isValid: true,
        activeRentalLine,
    };
}