import { db } from "./db.js";
import { mrrApiCall, mrrConfigs } from "./mrr.js";
import { isAggregate } from "./nh.js";
import { extractRentalInfo, extractRigInfo } from "./utils.js";
import { logger } from "./logger.js";
import { TELEGRAM_CONFIG, TelegramTemplates } from "../src/core/telegram.js";
import { ALGO_DISPLAY_NAMES, getAlgoDisplayName } from "../src/core/mapping.js";
import { dbGetAsync, dbRunAsync, dbAllAsync } from "./monitor/dbHelpers.js";
import { extractArray, sendTelegramInternal, getTelegramStatus, setTelegramStatus } from "./monitor/helpers.js";
import { processRental, isRealRental } from "./monitor/rentalProcessor.js";

// const getAlgoDisplayName = (code) => {
//   if (!code) return "N/A";
//   const uc = String(code).toUpperCase();
//   return ALGO_DISPLAY_NAMES[uc] || code;
// };

// Re-export for backward compatibility with other modules
export { sendTelegramInternal, getTelegramStatus, setTelegramStatus };

const resolveRentalAlgo = (r, info) =>
  info?.algo ||
  r?.algo ||
  r?.algorithm ||
  r?.miningAlgorithm ||
  r?.rig?.type ||
  r?.rig?.algo ||
  r?.type ||
  "N/A";

function getRentalIdFromRig(rig) {
  const candidates = [
    rig?.status?.rentalid,
    rig?.status?.rental_id,
    rig?.status?.rentalId,
    rig?.rentalid,
    rig?.rental_id,
    rig?.rentalId,
    rig?.current_rental_id,
    rig?.currentRentalId,
    rig?.rental?.id,
  ];

  const found = candidates.find(
    (value) =>
      value !== undefined &&
      value !== null &&
      String(value).trim() !== "" &&
      String(value).trim() !== "0",
  );
  return found === undefined ? "" : String(found).trim();
}

function getRigLookupKeys(rental, fallbackId = "") {
  return [
    rental?.id,
    rental?.rentalid,
    rental?.rental_id,
    rental?.rentalId,
    rental?.rigid,
    rental?.rig_id,
    rental?.rigId,
    rental?.rig?.id,
    fallbackId,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function isRentalFinished(now, endTs, sourceRig) {
  if (endTs > 0) return now >= endTs;

  const statusRaw = sourceRig?.status;
  const status = String(
    typeof statusRaw === "object" ? statusRaw.status : statusRaw || "",
  ).toLowerCase();
  const hasLiveRentalId = Boolean(getRentalIdFromRig(sourceRig));
  const rentedFlag = Boolean(sourceRig?.status?.rented);

  return !(
    rentedFlag ||
    hasLiveRentalId ||
    status.includes("rented") ||
    status.includes("active")
  );
}

function hasInactiveRentalStatus(rental) {
  const statusCandidates = [
    rental?.status,
    rental?.state,
    rental?.rental_status,
    rental?.rentalStatus,
    rental?.rig?.status,
  ];
  const status =
    statusCandidates
      .map((value) =>
        String(
          typeof value === "object" ? value?.status : value || "",
        ).toLowerCase(),
      )
      .find(Boolean) || "";

  return [
    "finished",
    "complete",
    "completed",
    "cancelled",
    "canceled",
    "expired",
    "ended",
  ].some((token) => status.includes(token));
}

function isRentalActive(now, endTs, sourceRig, rental) {
  if (hasInactiveRentalStatus(rental)) return false;
  if (endTs > 0) return now < endTs;

  const statusRaw =
    sourceRig?.status ??
    rental?.status ??
    rental?.state ??
    rental?.rental_status ??
    rental?.rentalStatus;
  const status = String(
    typeof statusRaw === "object" ? statusRaw.status : statusRaw || "",
  ).toLowerCase();
  const hasLiveRentalId = Boolean(getRentalIdFromRig(sourceRig));
  const rentedFlag = Boolean(
    sourceRig?.status?.rented || rental?.status?.rented,
  );

  return (
    rentedFlag ||
    hasLiveRentalId ||
    status.includes("rented") ||
    status.includes("active") ||
    status.includes("running")
  );
}

function isLiveRigCurrentlyRented(rig) {
  if (!rig) return false;
  const statusRaw = rig?.status;
  const status = String(
    typeof statusRaw === "object" ? statusRaw.status : statusRaw || "",
  ).toLowerCase();
  return (
    Boolean(getRentalIdFromRig(rig)) &&
    (status.includes("rented") ||
      status.includes("active") ||
      status.includes("running"))
  );
}

// ==========================
function getRealRentalCount(rentals) {
  if (!Array.isArray(rentals)) return 0;

  let count = 0;
  for (const rental of rentals) {
    const info = extractRentalInfo(rental);
    if (isRealRental(rental, info)) {
      count++;
    }
  }
  return count;
}

/**
 * Processes rig status changes and sends alerts if necessary.
 * @param {object} rig - The rig object from MRR.
 * @param {string} acct - The account name.
 * @param {number} now - The current timestamp.
 */
function handleRigStatusChanges(rig, acct, now) {
  const statusRaw = rig.status;
  const status = String(
    typeof statusRaw === "object" ? statusRaw.status : statusRaw || "",
  ).toLowerCase();
  const onlineFlag =
    typeof rig?.status?.online === "boolean"
      ? rig.status.online
      : Boolean(rig?.online);

  const isOffline = status.includes("offline") || !onlineFlag;
  const isDisabled = status.includes("disabled");
  const isWarning = status.includes("warning");

  const currentStatus = isOffline
    ? "OFFLINE"
    : isDisabled
      ? "DISABLED"
      : isWarning
        ? "WARNING"
        : "OK";

  const rigIdKey = `rig_state_${acct}_${rig.id}`;
  const prevStatus = lastRigStates.get(rigIdKey);
  const isStatusChanged = prevStatus !== undefined && prevStatus !== currentStatus;
  const isCriticalChange = currentStatus === "WARNING";

  if (isStatusChanged && isCriticalChange) {
    const rigAlertKey = `alert_${rigIdKey}_${currentStatus}`;
    const lastRigAlert = lastAlertTimes.get(rigAlertKey) || 0;

    if (now - lastRigAlert > ALERT_COOLDOWN_MS) {
      const rigMsg = TelegramTemplates.rigStatusWarning(
        acct,
        rig,
        resolveRentalAlgo(rig),
      );
      sendTelegramInternal(rigMsg, { label: `Rig warning ${acct}`, type: "RIG WARNING" });
      lastAlertTimes.set(rigAlertKey, now);
    }
  }
  lastRigStates.set(rigIdKey, currentStatus);
}

// ==========================
//  Global State (Persisted in DB)
// ==========================

let isMonitorRunning = false;
const monitorInitTracker = new Set();
async function maybeDelay(key) {
  if (!monitorInitTracker.has(key)) {
    logger.debug(`[Monitor] First-time load delay (1s) for: ${key}`);
    await new Promise((r) => setTimeout(r, 1000));
    monitorInitTracker.add(key);
  }
}

// ==========================
//  Constants
// ==========================

const { ALERT_COOLDOWN_MS, WARNING_RIG_THRESHOLD } = TELEGRAM_CONFIG;

const RENTED_HEARTBEAT_MS = 15 * 60 * 1000;

const lastAlertTimes = new Map([["global_summary", 0]]);
const lastRigStates = new Map();

// ==========================
//  Helper: HTML escaping
// ==========================

// ==========================
//  Main monitoring function
// ==========================
export async function runRentalMonitor(
  forceNotify = false,
  clientScope = "ALL",
) {
  if (isMonitorRunning) {
    logger.debug(
      `[Monitor] Run already in progress (force=${forceNotify}), skipping to prevent nonce collisions...`,
    );
    return { notifications: [], summary: { error: "Monitor already running" } };
  }
  isMonitorRunning = true;
  try {
    await maybeDelay("runRentalMonitor");
    const requestedScope = String(clientScope || "ALL")
      .trim()
      .toUpperCase();
    const scopeList = requestedScope.split(",").map((s) => s.trim());

    const allConfiguredAccts = Object.keys(mrrConfigs).filter(
      (k) => mrrConfigs[k].apiKey && mrrConfigs[k].apiSecret,
    );

    const mrrAccts =
      scopeList.includes("ALL") ||
      scopeList.includes("VN") ||
      scopeList.some((s) => isAggregate(s))
        ? allConfiguredAccts
        : allConfiguredAccts.filter((acct) =>
            scopeList.includes(acct.toUpperCase()),
          );

    const now = Date.now();
    const notifications = [];
    const activeRentalLines = [];
    const accountMetrics = [];
    const allRentedRigs = [];
    const currentActiveRentalIds = new Set();
    const globalRentalsMap = new Map();
    const notifiedRentalIdsThisRun = new Set();

    const queueTelegramMessage = (message, options = {}) => {
      const text = String(message || "").trim();
      if (!text) return;
      queuedTelegramMessages.push({
        message: text,
        label: options.label || "Monitor",
        type: options.type || options.label || "Monitor",
        summary: options.summary || null,
        onSuccess: options.onSuccess,
        onFailure: options.onFailure,
      });
    };

    await new Promise((resolve) => {
      db.serialize(() => {
        db.run(
          `CREATE TABLE IF NOT EXISTS rentals (
        id TEXT PRIMARY KEY, name TEXT, client TEXT, start_time INTEGER, end_time INTEGER, algo TEXT,
        target_100 REAL, order_diff REAL, last_updated INTEGER, last_notified INTEGER,
        low_hashrate_start INTEGER, zero_hashrate_start INTEGER, current_hashrate TEXT,
        average_hashrate TEXT, advertised_hashrate TEXT, price_paid TEXT
      )`,
          (err) => {
            if (err)
              logger.error(
                `[monitor:db] Failed to create rentals table: ${err.message}`,
              );
          },
        );

        db.run(
          `CREATE TABLE IF NOT EXISTS rental_history (id TEXT PRIMARY KEY, start_time INTEGER)`,
          (err) => {
            if (err)
              logger.error(
                `[monitor:db] Failed to create rental_history table: ${err.message}`,
              );
          },
        );

        db.run(
          "DELETE FROM rental_history WHERE start_time < ?",
          [Date.now() - 172800000],
          () => resolve(),
        );
      });
    });

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayStartTs = todayStart.getTime();

    if (mrrAccts.length === 0) {
      logger.warn(
        `[${new Date().toLocaleTimeString()}] No accounts for scope: ${requestedScope}`,
      );
      return {
        notifications: [],
        summary: { error: "No accounts configured" },
      };
    }

    logger.info(
      `[${new Date().toLocaleTimeString()}] Starting check for ${mrrAccts.length} accounts...`,
    );

    // ------------------------------------------------------------------
    //  Process each MRR account
    // ------------------------------------------------------------------

    let totalAll = 0;
    let availableAll = 0;
    let rentedAll = 0;
    let offlineAll = 0;
    let disabledAll = 0;
    let warningAll = 0;
    let onlineAll = 0;

    const successfulAccts = [];
    const globalOnlineAlgos = new Map();

    await Promise.all(
      mrrAccts.map(async (acct) => {
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
          error: false,
        };

        try {
          const [rigsRes, boughtRes, soldRes] = await Promise.all([
            mrrApiCall({ endpoint: "/rig/mine", clientNameRaw: acct }),
            mrrApiCall({
              endpoint: "/rental",
              query: { type: "bought" },
              clientNameRaw: acct,
            }),
            mrrApiCall({
              endpoint: "/rental",
              query: { type: "sold" },
              clientNameRaw: acct,
            }),
          ]);

          if (rigsRes.statusCode === 200 && rigsRes.data?.success) {
            const rigList = extractArray(rigsRes.data);
            const rentedRigs = [];
            let availableCount = 0;
            let offlineCount = 0;
            let disabledCount = 0;
            let warningCount = 0;
            let onlineCount = 0;

            for (const rig of rigList) {
              const statusRaw = rig.status;
              const status = String(
                typeof statusRaw === "object"
                  ? statusRaw.status
                  : statusRaw || "",
              ).toLowerCase();
              const rentedFlag = Boolean(rig?.status?.rented);
              const rentalId = getRentalIdFromRig(rig);
              const onlineFlag =
                typeof rig?.status?.online === "boolean"
                  ? rig.status.online
                  : Boolean(rig?.online);

              const isRented =
                rentedFlag ||
                status.includes("rented") ||
                status.includes("active") ||
                (rentalId && rentalId !== "0");
              const isDisabled = status.includes("disabled");
              const isOffline = status.includes("offline") || !onlineFlag;
              const isWarning = status.includes("warning");
              const isAvailable =
                !isRented &&
                !isDisabled &&
                onlineFlag &&
                (status.includes("available") ||
                  status.includes("online") ||
                  status === "");

              handleRigStatusChanges(rig, acct, now);

              if (isRented) {
                rentedRigs.push(rig);
                const detailKey = rentalId || String(rig.id || "").trim();
                if (!detailKey) continue;
                harvestedRentalIds.add(detailKey);
                rigLookupByRentalId.set(detailKey, rig);
                rigLookupByRentalId.set(String(rig.id), rig);
              }
              if (isAvailable) availableCount++;
              if (isOffline) offlineCount++;
              if (isDisabled) disabledCount++;
              if (isWarning) warningCount++;
              if (onlineFlag) {
                onlineCount++;
                const algoName = (rig.algo || rig.type || "N/A").toUpperCase();
                globalOnlineAlgos.set(
                  algoName,
                  (globalOnlineAlgos.get(algoName) || 0) + 1,
                );
              }
            }

            if (warningCount >= WARNING_RIG_THRESHOLD) {
              const alertKeyWarn = `${acct}_warn`;
              const lastWarnAlert = lastAlertTimes.get(alertKeyWarn) || 0;
              if (now - lastWarnAlert > ALERT_COOLDOWN_MS) {
                const warnMsg = TelegramTemplates.highWarningCount(
                  acct,
                  warningCount,
                );
                sendTelegramInternal(warnMsg, {
                  type: "SYSTEM ALERT",
                  label: `High warning count ${acct}`,
                  onFailure: (e) =>
                    logger.error(`[monitor] Warn alert failed: ${e.message}`),
                });
                lastAlertTimes.set(alertKeyWarn, now);
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
            allRentedRigs.push(...rentedRigs.map((r) => ({ ...r, acct })));
            successfulAccts.push(acct);
          } else if (rigsRes.data) {
            const errMsg =
              rigsRes.data.data?.message ||
              rigsRes.data.message ||
              rigsRes.data.error ||
              "Unknown";
            logger.warn(
              `[${new Date().toLocaleTimeString()}] Account ${acct} rig list failed: ${errMsg}`,
            );
            metric.error = true;
          }

          const soldRentalsRaw = extractArray(soldRes.data || {}).map((r) => ({
            ...r,
            __rentalSide: "sold",
          }));
          const boughtRentalsRaw = extractArray(boughtRes.data || {}).map(
            (r) => ({ ...r, __rentalSide: "bought" }),
          );
          const allRentalsRaw = [...boughtRentalsRaw, ...soldRentalsRaw];
          logger.info(
            `[monitor:${acct}] rentals fetched: sold=${soldRentalsRaw.length}, bought=${boughtRentalsRaw.length}, rig-rented-flags=${harvestedRentalIds.size}`,
          );

          if (boughtRentalsRaw.length > 0) {
            logger.info(
              `[monitor:${acct}] Ignoring ${boughtRentalsRaw.length} bought rental(s) for seller heartbeat; only sold rentals affect ROI/active detail.`,
            );
          }

          const rentalsMap = new Map();
          allRentalsRaw.forEach((r) => {
            if (r && r.id) {
              rentalsMap.set(String(r.id), r);
              globalRentalsMap.set(String(r.id), r);
              for (const key of getRigLookupKeys(r)) {
                if (!rentalsMap.has(key)) rentalsMap.set(key, r);
                if (!globalRentalsMap.has(key)) globalRentalsMap.set(key, r);
              }
            }
          });

          const missingIds = Array.from(harvestedRentalIds).filter(
            (hid) => !rentalsMap.has(hid),
          );
          if (missingIds.length > 0) {
            await Promise.all(
              missingIds.map(async (hid) => {
                try {
                  const hRes = await mrrApiCall({
                    endpoint: `/rental/${hid}`,
                    clientNameRaw: acct,
                  });
                  const hData = hRes.data?.data || hRes.data;
                  if (hRes.statusCode === 200 && hData && !hData.error) {
                    if (!hData.id) hData.id = hid;
                    rentalsMap.set(hid, hData);
                    globalRentalsMap.set(hid, hData);
                  }
                } catch (err) {}
              }),
            );
          }

          for (const [rid, rig] of rigLookupByRentalId.entries()) {
            if (!rentalsMap.has(rid)) {
              rentalsMap.set(rid, {
                id: rid,
                name: rig.name,
                status: rig.status,
                hashrate: { current: rig.hashrate || 0 },
                rig: { id: rig.id, type: rig.algo || rig.type },
              });
              globalRentalsMap.set(rid, rentalsMap.get(rid));
            }
          }

          const rentals = Array.from(
            new Map(
              Array.from(rentalsMap.values()).map((r) => [
                String(r?.id || r?.rentalid || r?.rental_id || ""),
                r,
              ]),
            ).values(),
          ).filter((r) => r && (r.id || r.rentalid || r.rental_id));

          let realRentalCount = 0;
          for (const rental of rentals) {
            const liveRig = getRigLookupKeys(rental).map((key) => rigLookupByRentalId.get(key)).find(Boolean);
            const info = extractRentalInfo(rental);
            const parseUtc = (d) => {
                if (!d) return 0;
                const s = String(d);
                return new Date(s.endsWith("UTC") || s.endsWith("Z") || s.includes("+") ? s : s + " UTC").getTime();
            };
            const endT = parseUtc(info.endTime);
            if (!isRentalActive(now, endT, liveRig, rental)) {
                await dbRunAsync(`DELETE FROM rentals WHERE id = ?`, [String(rental.id)]).catch(() => {});
                continue;
            }

            const activeRentalId = String(rental.id || rental.rentalid || rental.rental_id || "").trim();
            if (activeRentalId) currentActiveRentalIds.add(activeRentalId);

            const result = await processRental(rental, acct, now, forceNotify, notifiedRentalIdsThisRun, notifications, liveRig);

            if (result.isValid) {
                realRentalCount++;
                if (result.activeRentalLine) {
                    activeRentalLines.push(result.activeRentalLine);
                }
            }
          }

          metric.rented = realRentalCount;
          accountMetrics.push(metric);
          if (!metric.error) successfulAccts.push(acct);
        } catch (err) {
          logger.error(
            `[${new Date().toLocaleTimeString()}] [monitor:error] Client ${acct}: ${err.message}`,
          );
          metric.error = true;
          accountMetrics.push(metric);
        }
      }),
    );

    const successfulAcctList = Array.from(new Set(successfulAccts));

    if (currentActiveRentalIds.size > 0 && successfulAcctList.length > 0) {
      const activePlaceholders = Array.from(currentActiveRentalIds)
        .map(() => "?")
        .join(",");
      const clientPlaceholders = successfulAcctList.map(() => "?").join(",");
      await dbRunAsync(
        `DELETE FROM rentals WHERE client IN (${clientPlaceholders}) AND id NOT IN (${activePlaceholders})`,
        [...successfulAcctList, ...Array.from(currentActiveRentalIds)],
      ).catch((err) =>
        logger.warn(
          `[monitor:db] Failed to prune stale rentals: ${err.message}`,
        ),
      );
    } else if (successfulAcctList.length > 0) {
      const placeholders = successfulAcctList.map(() => "?").join(",");
      await dbRunAsync(
        `DELETE FROM rentals WHERE client IN (${placeholders})`,
        successfulAcctList,
      ).catch((err) =>
        logger.warn(
          `[monitor:db] Failed to clear stale rentals: ${err.message}`,
        ),
      );
    }

    const rented24hRow = await dbGetAsync(
      "SELECT COUNT(*) as count FROM rental_history WHERE start_time >= ?",
      [todayStartTs],
    );
    const rented24hCount = rented24hRow ? rented24hRow.count : 0;

    // ------------------------------------------------------------------
    //  Detect and notify finished rentals (no longer present in API)
    // ------------------------------------------------------------------
    if (successfulAcctList.length > 0) {
      const placeholders = successfulAcctList.map(() => "?").join(",");
      const finishedRentals = await dbAllAsync(
        `SELECT * FROM rentals WHERE last_updated < ? AND client IN (${placeholders})`,
        [now, ...successfulAcctList],
      );

      for (const fr of finishedRentals) {
        const endTs = Number(fr.end_time || 0);
        const lastUpdatedTs = Number(fr.last_updated || 0);
        const hadRealEndTime = endTs > 0;
        const endedRecently =
          hadRealEndTime && endTs <= now && now - endTs < 6 * 60 * 60 * 1000;
        const wentMissingRecently =
          lastUpdatedTs > 0 && now - lastUpdatedTs < 10 * 60 * 1000;

        if (!endedRecently && !wentMissingRecently) {
          await dbRunAsync(`DELETE FROM rentals WHERE id = ?`, [fr.id]);
          continue;
        }

        let enriched = { ...fr };
        try {
          const res = await mrrApiCall({
            endpoint: `/rental/${fr.id}`,
            clientNameRaw: fr.client,
            silent: true,
          });
          if (res && res.statusCode === 200 && res.data) {
            const d = res.data.data || res.data;
            if (d && typeof d === "object") enriched = { ...enriched, ...d };
          }
        } catch (e) {}

        const info = extractRentalInfo(enriched);
        const finishAds =
          info.niceAdvertisedHashrate ||
          info.hashrate?.advertised?.nice ||
          info.hashrate?.advertised ||
          info.hashrate?.suffix ||
          "N/A";
        const finishMsg = TelegramTemplates.finished(
          { ...enriched, client: fr.client },
          info,
          resolveRentalAlgo(enriched, info),
          finishAds,
        );
        sendTelegramNotification(finishMsg, {
          type: "RENTAL FINISHED",
          label: `Finished ${fr.client} ${fr.id}`,
          summary: { // This summary object seems unused, but keeping it for now
            account: fr.client,
            rig: enriched.name || enriched.id,
            algo: resolveRentalAlgo(enriched, info),
            paid: `${info.price.paid} ${info.price.currency}`,
            avg: info.niceAverageHashrate,
            ads: finishAds,
            eff: `${parseFloat(info.percent || 0).toFixed(2)}%`,
          },
          onSuccess: async () => {
            notifications.push({
              id: fr.id,
              client: fr.client,
              status: "Sent",
              type: "Finished",
              telegram: "ok",
            });
            await dbRunAsync(`DELETE FROM rentals WHERE id = ?`, [fr.id]);
          },
          onFailure: async (e) => {
            logger.warn(
              `[${new Date().toLocaleTimeString()}] [monitor] Finish notice failed for ${fr.id}: ${e.message}`,
            );
            notifications.push({
              id: fr.id,
              client: fr.client,
              status: "Failed",
              type: "Finished",
              error: e.message,
            });
            await dbRunAsync(`DELETE FROM rentals WHERE id = ?`, [fr.id]);
          },
        });
      }
    }

    const shouldSendCombinedSummary =
      forceNotify ||
      now - (lastAlertTimes.get("global_summary") || 0) >= RENTED_HEARTBEAT_MS;

    const totalRealRentals = accountMetrics.reduce(
      (sum, metric) => sum + (Number(metric.rented) || 0),
      0,
    );

    rentedAll =
      totalRealRentals > 0 ? totalRealRentals : activeRentalLines.length;

    // Log the filtering
    if (currentActiveRentalIds.size !== rentedAll) {
      logger.info(
        `[Monitor] 📊 Real rentals: ${rentedAll} (${currentActiveRentalIds.size - rentedAll} ghost rentals filtered out)`,
      );
    }

    if (
      shouldSendCombinedSummary &&
      (accountMetrics.length > 0 || activeRentalLines.length > 0)
    ) {
      const maxBarLen = 30;
      const barChart = accountMetrics
        .map((am) => {
          const ratio = totalAll > 0 ? am.total / totalAll : 0;
          const filled = Math.max(1, Math.round(ratio * maxBarLen));
          const bar = "█".repeat(filled);
          const statusNote = am.error ? " [ERROR]" : am.total;
          return `<code>${am.name.padEnd(4)}${bar.padEnd(maxBarLen + 1)}${statusNote}</code>`;
        })
        .join("\n");

      const finishTime = new Date().toLocaleTimeString();
      const onlineAlgoLines = Array.from(globalOnlineAlgos.entries())
        .sort((a, b) => b[1] - a[1])
        .map(
          ([algo, count]) => `• ${getAlgoDisplayName(algo)}: <b>${count}</b>`,
        );

      try {
        const summaryBase = (linesSubset) =>
          TelegramTemplates.heartbeatSummary(
            barChart,
            onlineAll, 
            rentedAll, // ✅ Using real rental count
            offlineAll,
            disabledAll,
            totalAll,
            linesSubset,
            finishTime,
            rented24hCount,
            onlineAlgoLines,
          );

        const summaryChunks = [];
        let currentLines = [];
        for (const line of activeRentalLines) {
          const nextLines = [...currentLines, line];
          const nextMsg = summaryBase(nextLines);
          if (currentLines.length > 0 && nextMsg.length > 3600) {
            summaryChunks.push(summaryBase(currentLines));
            currentLines = [line];
          } else {
            currentLines = nextLines;
          }
        }
        if (currentLines.length > 0 || activeRentalLines.length === 0) {
          summaryChunks.push(summaryBase(currentLines));
        }

        for (const msg of summaryChunks) {
          await sendTelegramInternal(msg);
        }
        lastAlertTimes.set("global_summary", now);
      } catch (e) {
        logger.error(
          `[${new Date().toLocaleTimeString()}] [monitor] Summary send failed: ${e.message}`,
        );
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
        // FIXED: Only include real rentals in the summary
        activeRentals: allRentedRigs
          .filter((r) => {
            const rentalDetail = globalRentalsMap.get(String(r.id));
            if (!rentalDetail) return false;
            const info = extractRentalInfo(rentalDetail, r);
            const result = isRealRental(rentalDetail, info);
            if (!result) {
              logger.debug(
                `[Monitor] Filtered out ghost rental from summary: ${r.id}`,
              );
            }
            return result;
          })
          .map((r) => {
            const rentalDetail = globalRentalsMap.get(String(r.id));
            const info = rentalDetail
              ? extractRentalInfo(rentalDetail)
              : { percent: 0 };
            const eff = rentalDetail ? parseFloat(info.percent || 0) : 0;
            return {
              account: r.acct,
              id: r.id,
              name: r.name || r.id,
              efficiency: eff,
              orderDiff: (100 - eff).toFixed(1),
            };
          }),
      },
    };
  } finally {
    isMonitorRunning = false;
  }
}
