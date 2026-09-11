// core/telegram.js
// Browser-safe Telegram templates - works in both Node.js and browser environments

export const TELEGRAM_CONFIG = {
  ALERT_COOLDOWN_MS: 5 * 60 * 1000,
  WARNING_RIG_THRESHOLD: 3,
  RENTED_HEARTBEAT_MS: 3 * 60 * 1000,
};

export function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function formatAccount(account) {
  return escapeHtml(account || "N/A");
}

export function formatRig(r) {
  return `${escapeHtml(r?.name || r?.id || "N/A")} (<code>${escapeHtml(r?.id || "N/A")}</code>)`;
}

export function formatHashrate(value, suffix) {
  const num = Number.parseFloat(value || 0);
  if (!Number.isFinite(num) || num <= 0) return "0 N/A";
  return `${num.toFixed(2)} ${suffix || ""}`.trim();
}

export function formatTimeRange(start, end) {
  return `${start || "N/A"} - ${end || "N/A"}`;
}

const divider = "━━━━━━━━━━━━━━";

/**
 * Shared Telegram Templates
 * All templates are browser-safe and don't use Node.js modules
 */
export const TelegramTemplates = {
  divider,

  activeRentalLine: (
    perfEmoji,
    algo,
    name,
    remaining,
    efficiency,
    roi,
    avg,
    ads,
    cur,
    target,
    extra,
    client,
    info = { price: {} },
  ) => {
    const paid = info?.price?.paid ?? "N/A";
    const currency = info?.price?.currency ?? "BTC";
    return (
      `${perfEmoji} <b>${escapeHtml(algo)}</b> 🔀 <b>${escapeHtml(client)}</b> | ${escapeHtml(name)}\n` +
      `⏱ Remaining: ${remaining}\n` +
      `📡 Cur: <b>${cur}</b> | ` +
      `📊 Eff: <code>${typeof efficiency === "number" ? efficiency.toFixed(2) : efficiency}%</code>\n` +
      `📈 Avg: <code>${avg}</code> | Adv: <code>${ads}</code>\n` +
      `💰 Paid: <code>${escapeHtml(paid)}</code> <b>${escapeHtml(currency)}</b>\n` +
      `${extra}${divider}\n`
    );
  },

  rentedNotice: (type, r, info = {}, acct, diff, rem, algo, ads) => {
    return (
      `🚀 <b>[${type}]</b>\n` +
      `<b>Account:</b> <code>${formatAccount(acct)}</code>\n` +
      `<b>Rig:</b> ${formatRig(r)}\n` +
      `<b>Algo:</b> <code>${escapeHtml(algo)}</code>\n` +
      `<b>Time:</b> ${formatTimeRange(info.startTime, info.endTime)}\n` +
      `💰 Paid: <code>${escapeHtml(info.price?.paid)} </code> <b> ${escapeHtml(info.price?.currency)}</b>\n` +
      `<b>Efficiency:</b> <b>${info.percent ?? "N/A"}%</b> \n` +
      `Adv: <code>${escapeHtml(ads || info.hashrate?.advertised?.nice || info.hashrate?.advertised || info.hashrate?.suffix || "N/A")}</code>\n` +
      `<b>Remaining:</b> <code>${escapeHtml(rem)}</code>\n` +
      // `<b>Target to 100%:</b> ${info.targetHashrate || "N/A"}\n` +
      `${divider}\n`
    );
  },

  newRental: (account, r, info = {}, startStr, endStr, algo = "N/A", ads = "N/A") => {
    return (
      `🚀 <b>[NEW RENTAL]</b>\n` +
      `<b>Account:</b> <code>${formatAccount(account)}</code>\n` +
      `${divider}\n` +
      `<b>Rig:</b> ${formatRig(r)}\n` +
      `<b>Algo:</b> <code>${escapeHtml(algo)}</code>\n` +
      `<b>Time:</b> ${formatTimeRange(startStr, endStr)}\n` +
      `💰 Paid: <code>${escapeHtml(info.price?.paid)} </code> <b> ${escapeHtml(info.price?.currency)}</b>\n` +
      `Adv: <code>${escapeHtml(ads)}</code>\n` +
      `${divider}\n`
    );
  },

  zeroHashrate: (acct, r, info, algo) => {
    return (
      `⚠️ <b>[ZERO HASHRATE]</b>\n` +
      `<b>Account:</b> <code>${formatAccount(acct)}</code>\n` +
      `${divider}\n` +
      `<b>Rig:</b> ${formatRig(r)}\n` +
      `<b>Algo:</b> <code>${escapeHtml(algo)}</code>\n` +
      `<b>Status:</b> 0 H/s (Target: ${info.targetHashrate || "N/A"})\n` +
      `Adv: <code>${
        info.niceAdvertisedHashrate || info.hashrate?.advertised?.nice || "N/A"
      }</code>\n` +
      `<b>Rental:</b> <code>${r.id || "N/A"}</code>`
    );
  },

  nhOrderZeroHashrate: (account, order, algo) => {
    const orderId = order?.id || order?.orderId || "N/A";
    const limit = order?.limit ?? "N/A";
    const price = order?.price ?? "N/A";
    const paid = order?.payedAmount ?? "N/A";
    const rigsCount = order?.rigsCount ?? "N/A";
    return (
      `⚠️ <b>[ZERO HASHRATE]</b>\n` +
      `<b>Account:</b> <code>${formatAccount(account)}</code>\n` +
      `${divider}\n` +
      `<b>Order:</b> <code>${escapeHtml(String(orderId).length > 8 ? String(orderId).slice(0, 8) + "..." : String(orderId))}</code>\n` +      `<b>Algo:</b> <code>${escapeHtml(algo)}</code>\n` +
      `<b>Status:</b> <code>ACTIVE but 0 H/s</code>\n` +
      `<b>Rigs:</b> <code>${escapeHtml(String(rigsCount))}</code>\n` +
      `<b>Limit:</b> <code>${escapeHtml(String(limit))}</code>\n` +
      `<b>Price:</b> <code>${escapeHtml(String(price))}</code> BTC\n` +
      `<b>Paid:</b> <code>${escapeHtml(String(paid))}</code> BTC\n` +
      `${divider}`
    );
  },

  efficiency: (acct, r, info, efficiency, target, algo, ads) => {
    return (
      `📉 <b>[LOW EFFICIENCY]</b>\n` +
      `<b>Account:</b> <code>${formatAccount(acct)}</code>\n` +
      `${divider}\n` +
      `<b>Rig:</b> ${formatRig(r)}\n` +
      `<b>Algo:</b> <code>${escapeHtml(algo)}</code>\n` +
      `<b>Efficiency:</b> <b>${efficiency}%</b>\n` +
      `<b>Average:</b> ${info.niceAverageHashrate || "N/A"}\n` +
      `Adv: <code>${
        ads || info.niceAdvertisedHashrate || "N/A"
      }</code>\n` +
      `<b>Target to 100%:</b> ${target?.toFixed(2) || "N/A"} ${info.hashrate?.suffix || ""}`
    );
  },

  startup: (acct, r, info, efficiency, target, algo) => {
    return (
      `⏱ <b>[STARTUP ALERT]</b>\n` +
      `<b>Account:</b> <code>${formatAccount(acct)}</code>\n` +
      `${divider}\n` +
      `<b>Rig:</b> ${formatRig(r)}\n` +
      `<b>Algo:</b> <code>${escapeHtml(algo)}</code>\n` +
      `<b>Initial Eff:</b> ${efficiency}%\n` +
      `Adv: <code>${
        info.niceAdvertisedHashrate || info.hashrate?.advertised?.nice || "N/A"
      }</code>\n` +
      `💰 Paid: <code>${escapeHtml(info.price?.paid)} </code> <b> ${escapeHtml(info.price?.currency)}</b>\n` +
      `<b>Time:</b> ${formatTimeRange(info.startTime, info.endTime)}\n` +
      `<b>Target:</b> ${target?.toFixed(2) || "N/A"} ${info.hashrate?.suffix || ""}`
    );
  },

  completionAlert: (
    acct,
    r,
    info, 
    efficiency, 
    target, 
    algo) => {
    return (
      `🏁 <b>[ALMOST COMPLETE]</b>\n` +
      `<b>Algo:</b> <code>${escapeHtml(algo)}</code>\n` +
      `<b>Rig:</b> ${formatRig(r)}\n` +
      `<b>Account:</b> <code>${formatAccount(acct)}</code>\n` +
      `${divider}\n` +
      `<b>Time:</b> ${formatTimeRange(info.startTime)}\n` +
      `<b>Final Eff:</b> ${efficiency || 0}%\n` +
      `<b>Target:</b> ${target?.toFixed(2) || "N/A"}`
    );
  },

  completionSuccess: (  
    acct,
    r,
    info = { price: {} },
    efficiency,
    adv,
    avg,
    suffix,
    algo,
  ) => {
    return (
      `✅ <b>[RENTAL SUCCESS]</b>\n` +
      `<b>Account:</b> <code>${formatAccount(acct)}</code>\n` +
      `${divider}\n` +
      `<b>Rig:</b> ${formatRig(r)}\n` +
      `<b>Algo:</b> <code>${escapeHtml(algo)}</code>\n` +
      `<b>Avg Speed:</b> ${avg} ${suffix}\n` +
      `<b>Final Efficiency:</b> <b>${parseFloat(efficiency).toFixed(2)}%</b>\n` +
      `💰Paid: <code>${escapeHtml(info.price?.paid)}</code> <b>${escapeHtml(info.price?.currency)}</b>`
    );
  },

  perfectEfficiency: (
    acct, 
    r, 
    efficiency, 
    info, 
    remainingMs, 
    algo) => {
    const remH = Math.floor(remainingMs / 3600000);
    return (
      `✅ <b>[PERFECT 100%]</b>\n` +
      `<b>Account:</b> <code>${formatAccount(acct)}</code>\n` +
      `${divider}\n` +
      `<b>Rig:</b> ${formatRig(r)}\n` +
      `<b>Algo:</b> <code>${escapeHtml(algo)}</code>\n` +
      `<b>Status:</b> Running perfectly at ${efficiency}%\n` +
      `<b>Remaining:</b> ~${remH}h\n` +
      `💰 Paid: <code>${escapeHtml(info.price?.paid)} </code> <b> ${escapeHtml(info.price?.currency)}</b>`
    );
  },

  highRoiAlert: (acct, r, info = {}, roi) => {
    return (
      `💹 <b>[HIGH ROI]</b>\n` +
      `<b>Account:</b> <code>${formatAccount(acct)}</code>\n` +
      `${divider}\n` +
      `<b>Rig:</b> ${formatRig(r)}\n` +
      `<b>Algo:</b> <code>${escapeHtml(info.algo || r?.algo || r?.algorithm || "N/A")}</code>\n` +
      `<b>ROI:</b> <b>${Number.isFinite(Number(roi)) ? Number(roi).toFixed(2) : "N/A"}%</b>\n` +
      `💰 Paid: <code>${escapeHtml(info.price?.paid ?? "N/A")}</code> <b>${escapeHtml(info.price?.currency ?? "BTC")}</b>`
    );
  },

  finished: (r, info, algo) => {
    return (
      `🏁 <b>[RENTAL FINISHED]</b>\n` +
      `<b>Account:</b> <code>${formatAccount(r.client)}</code>\n` +
      `${divider}\n` +
      `<b>Rig:</b> ${formatRig(r)}\n` +
      `<b>Algo:</b> <code>${escapeHtml(algo)}</code>\n` +
      `<b>Final Avg:</b> ${info.niceAverageHashrate}\n` +
      `<b>Final Eff:</b> <b>${info.percent}%</b>\n` +
      `<b>Total 💰 Paid: <code>${escapeHtml(info.price?.paid)} </code> <b> ${escapeHtml(info.price?.currency)}</b>`
    );
  },

  heartbeatSummary: (...args) => {
    let barChart;
    let online;
    let rented;
    let offline;
    let disabled;
    let total;
    let lines;
    let time;
    let rented24h;
    let algos;

    if (args.length === 1 && typeof args[0] === "object" && !Array.isArray(args[0]) && args[0] !== null) {
      const data = args[0];
      online = data.onlineAll ?? data.online ?? 0;
      rented = data.rentedAll ?? data.rented ?? 0;
      offline = data.offlineAll ?? data.offline ?? 0;
      disabled = data.disabledAll ?? data.disabled ?? 0;
      total = data.totalAll ?? data.total ?? 0;
      time = data.monitorTime ?? data.time ?? new Date().toLocaleTimeString();
      rented24h = data.rented24h ?? 0;
      algos = Array.isArray(data.onlineAlgoLines)
        ? data.onlineAlgoLines
        : Array.isArray(data.algos)
        ? data.algos
        : [];
      if (Array.isArray(data.activeRentalLines)) {
        lines = data.activeRentalLines;
      } else if (Array.isArray(data.activeRentals) && data.activeRentals.every((item) => typeof item === 'string')) {
        lines = data.activeRentals;
      } else {
        lines = [];
      }
    } else {
      [
        barChart,
        online,
        rented,
        offline,
        disabled,
        total,
        lines,
        time,
        rented24h,
        algos,
      ] = args;
    }

    const rentedCount =
      typeof rented === "number" ? rented : parseInt(rented) || 0;

    let summary = `📊 <b>SUMMARY</b>\n`;
    summary += `🆕 Renting: <b><code>${rentedCount}</code></b>\n`;
    summary += `🟢 Online: <b>${online || 0}</b>\n`;
    summary += `🔴 Offline: <b>${offline || 0}</b> | Disabled: <b>${disabled || 0}</b>\n`;
    summary += `📦 Total Rigs: <b>${total || 0}</b>\n`;
    summary += `${divider}\n`;

    if (algos && algos.length > 0) {
      summary += `<b>Algorithms Online:</b>\n${algos.join("\n")}\n`;
      summary += `${divider}\n`;
    }

    if (lines && lines.length > 0) {
      summary += `<b>Active Rentals Detail:</b>\n\n`;
      summary += lines.join("");
    } else {
      summary += `<b>Active Rentals Detail:</b>\n\n`;
      summary += `<i>No active rentals</i>\n`;
    }

    return summary;
  },

  rigStatusWarning: (acct, rig, algo) =>
    `⚠️ <b>[RIG WARNING]</b>\n
    ${formatAccount(acct)}\n
   ${formatRig(rig)}\n
   <b>Algo:</b> <code>${escapeHtml(algo)}</code>\n
   <b>Status:</b> <code>${rig.status?.status || rig.status}</code>`,

  highWarningCount: (acct, count) =>
    `⚠️ <b>[SYSTEM ALERT]</b>\n 
  ${formatAccount(acct)}\n
  <b>High Warning Count:</b> <b>${count}</b> rigs in warning state.`
  ,

  manualNotice: (r, account, avg, suffix, roi, remStr, progress, paid) => {
    return (
      `🔔 <b>[MANUAL NOTICE]</b>\n` +
      `<b>Account:</b> <code>${formatAccount(account)}</code>\n` +
      `${divider}\n` +
      `<b>Rig:</b> ${formatRig(r)}\n` +
      `<b>Avg:</b> ${avg} ${suffix}\n` +
      `<b>ROI:</b> ${roi}%\n` +
      `<b>Remaining:</b> ${remStr}\n` +
      `<b>Progress:</b> ${progress}%\n` +
      `💰 Paid: <code>${escapeHtml(paid)}</code>\n` +
      `${divider}`
    );
  },
};

// ============================================================
// SERVER-ONLY: Template reload function (safe for browser)
// ============================================================

/**
 * Reload templates - kept for backward compatibility.
 * In browser, this returns the existing templates.
 * In Node.js, you can override this with a server-side implementation.
 */
export function reloadTelegramTemplates() {
  // In browser environments, this just returns the static templates
  // Server can override this by importing a separate server module
  return TelegramTemplates;
}
