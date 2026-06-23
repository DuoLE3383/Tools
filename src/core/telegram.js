// core/telegram.js
// Browser-safe Telegram templates - works in both Node.js and browser environments

export const TELEGRAM_CONFIG = {
  ALERT_COOLDOWN_MS: 10 * 60 * 1000,
  WARNING_RIG_THRESHOLD: 3,
  RENTED_HEARTBEAT_MS: 60 * 60 * 1000,
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
    return (
      `${perfEmoji} <b>${escapeHtml(algo)}</b> 🔀 <code>${escapeHtml(client)}</code> | ${escapeHtml(name)}\n` +
      `⏱ Remaining: <code> ${escapeHtml(remaining)}</code>\n` +
      `📡 Cur: <code>${cur}</code> | ` + `📈 Avg: <code>${avg}</code>\n` + 
      `📊 Eff: <b>${typeof efficiency === "number" ? efficiency.toFixed(2) : efficiency}%</b> | Adv: <code>${ads}</code>\n` +
      `💰 Paid: <b><code>${escapeHtml(info.price?.paid)}</code> ${escapeHtml(info.price?.currency)}</b>\n` +
      `${extra}${divider}\n`
    );
  },

  rentedNotice: (type, r, info, acct, diff, rem, algo, ads) => {
    return (
      `🚀 <b>[${type}]</b>\n` +
      `<b>Account:</b> <code>${escapeHtml(formatAccount(acct))}</code>\n` +
      `${divider}\n` +
      `<b>Rig:</b> ${escapeHtml(formatRig(r))}\n` +
      `<b>Algo:</b> <code>${escapeHtml(algo)}</code>\n` +
      `<b>Time:</b> ${escapeHtml(formatTimeRange(info.startTime, info.endTime))}\n` +
      `${divider}\n` +
      `<b>Paid:</b> <code> ${escapeHtml(info.price.paid)}</code> ${escapeHtml(info.price?.currency)}\n` +
      `<b>Efficiency:</b> <b>${escapeHtml(info.percent)}%</b> (Diff: ${escapeHtml(diff)}%)\n` +
      `Adv: <code>${escapeHtml(ads)}</code>\n` +
      `<b>Remaining:</b> ${escapeHtml(rem)}\n` +
      `<b>Target to 100%:</b> ${escapeHtml(info.targetHashrate || "N/A")}`
    );
  },

  zeroHashrate: (acct, r, info, algo, ads) => {
    return (
      `⚠️ <b>[ZERO HASHRATE]</b>\n` +
      `<b>Account:</b> <code>${formatAccount(acct)}</code>\n` +
      `${divider}\n` +
      `<b>Rig:</b> ${formatRig(r)}\n` +
      `<b>Algo:</b> <code>${escapeHtml(algo)}</code>\n` +
      `<b>Status:</b> 0 H/s (Target: ${escapeHtml(info.targetHashrate)})\n` +
      `Adv: <code>${escapeHtml(ads)}</code>\n` +
      `<b>Rental:</b> <code>${escapeHtml(r.id)}</code>`
    );
  },

  efficiency: (acct, r, info, efficiency, target, algo, ads) => {
    return (
      `📉 <b>[LOW EFFICIENCY]</b>\n` +
      `<b>Account:</b> <code>${formatAccount(acct)}</code>\n` +
      `${divider}\n` +
      `<b>Rig:</b> ${formatRig(r)}\n` +
      `<b>Algo:</b> <code>${escapeHtml(algo)}</code>\n` +
      `<b>Efficiency:</b> <b>${escapeHtml(efficiency)}%</b>\n` +
      `<b>Average:</b> ${escapeHtml(info.niceAverageHashrate)}\n` +
      `Adv: <code>${escapeHtml(ads)}</code>\n` +
      `<b>Target to 100%:</b> ${escapeHtml(target.toFixed(2))} ${escapeHtml(info.hashrate.suffix || "")}`
    );
  },

  startup: (acct, r, info, efficiency, target, algo, ads) => {
    return (
      `⏱ <b>[STARTUP ALERT]</b>\n` +
      `<b>Account:</b> <code>${formatAccount(acct)}</code>\n` +
      `${divider}\n` +
      `<b>Rig:</b> ${formatRig(r)}\n` +
      `<b>Algo:</b> <code>${escapeHtml(algo)}</code>\n` +
      `<b>Initial Eff:</b> ${escapeHtml(efficiency)}%\n` +
      `Adv: <code>${escapeHtml(ads)}</code>\n` +
      `<b>Paid:</b> <code> ${escapeHtml(info.price.paid)}</code> ${escapeHtml(info.price?.currency)}\n` +
      `<b>Time:</b> ${formatTimeRange(escapeHtml(info.startTime))}\n` +
      `<b>Target:</b> ${escapeHtml(target.toFixed(2))} ${escapeHtml(info.hashrate.suffix || "")}`
    );
  },

  completionAlert: (acct, r, info, efficiency, target, algo) => {
    return (
      `🏁 <b>[ALMOST COMPLETE]</b>\n` +
      `<b>Algo:</b> <code>${escapeHtml(algo)}</code>\n` +
      `<b>Rig:</b> ${formatRig(r)}\n` +
      `<b>Account:</b> <code>${escapeHtml(formatAccount(acct))}</code>\n` +
      `${divider}\n` +
      `<b>Time:</b> ${formatTimeRange(escapeHtml(info.startTime))}\n` +
      `<b>Final Eff:</b> ${escapeHtml(efficiency)}%\n` +
      `<b>Target:</b> ${escapeHtml(target.toFixed(2))}`
    );
  },

  completionSuccess: (
    acct,
    r,
    info = { price: {} },
    efficiency,
    avg,
    suffix,
    algo,
  ) => {
    return (
      `✅ <b>[RENTAL SUCCESS]</b>\n` +
      `<b>Account:</b> <code>${escapeHtml(formatAccount(acct))}</code>\n` +
      `${divider}\n` +
      `<b>Rig:</b> ${escapeHtml(formatRig(r))}\n` +
      `<b>Algo:</b> <code>${escapeHtml(algo)}</code>\n` +
      `<b>Avg Speed:</b> ${escapeHtml(avg)} ${escapeHtml(suffix)}\n` +
      `<b>Final Efficiency:</b> <b>${escapeHtml(parseFloat(efficiency).toFixed(2))}%</b>\n` +
      `<b>Paid:</b><code> ${escapeHtml(info.price.paid)}</code>${escapeHtml(info.price?.currency)}`
    );
  },

  perfectEfficiency: (acct, r, efficiency, info, remainingMs, algo) => {
    const remH = Math.floor(remainingMs / 3600000);
    return (
      `🎊 <b>[PERFECT 100%]</b>\n` +
      `<b>Account:</b> <code>${escapeHtml(formatAccount(acct))}</code>\n` +
      `${divider}\n` +
      `<b>Rig:</b> ${escapeHtml(formatRig(r))}\n` +
      `<b>Algo:</b> <code>${escapeHtml(algo)}</code>\n` +
      `<b>Status:</b> Running perfectly at ${escapeHtml(efficiency)}%\n` +
      `<b>Remaining:</b> ~${escapeHtml(remH)}h\n` +
      `<b>Cost:</b> <code> ${escapeHtml(info.price.paid)}</code>${escapeHtml(info.price.currency)}`
    );
  },

  finished: (r, info, algo) => {
    return (
      `🏁 <b>[RENTAL FINISHED]</b>\n` +
      `<b>Account:</b> <code>${escapeHtml(formatAccount(r.client))}</code>\n` +
      `${divider}\n` +
      `<b>Rig:</b> ${escapeHtml(formatRig(r))}\n` +
      `<b>Algo:</b> <code>${escapeHtml(algo)}</code>\n` +
      `<b>Final Avg:</b> ${escapeHtml(info.niceAverageHashrate)}\n` +
      `<b>Final Eff:</b> <b>${escapeHtml(info.percent)}%</b>\n` +
      `<b>Total Paid:</b> <code> ${escapeHtml(info.price.paid)}</code> ${escapeHtml(info.price.currency)}`
    );
  },

  heartbeatSummary: (
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
  ) => {
    const rentedCount = typeof rented === 'number' ? rented : parseInt(rented) || 0;
    
    let summary = `📊 <b>SUMMARY</b> [${time || new Date().toLocaleTimeString()}]\n`;
    summary += `${divider}\n`;
    summary += `🟢 Online: <b>${online || 0}</b> / Renting: <b>${rentedCount}</b>\n`;
    summary += `🔴 Offline: <b>${offline || 0}</b> / Disabled: <b>${disabled || 0}</b>\n`;
    summary += `📦 Total Rigs: <b>${total || 0}</b>\n`;
    summary += `🆕 Rented (24h): <b>${rented24h || 0}</b>\n`;
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
    `⚠️ <b>[RIG WARNING]</b>\n<b>MRR:</b> ${formatAccount(acct)}\n<b>Rig:</b> ${formatRig(rig)}\n<b>Algo:</b> <code>${escapeHtml(algo)}</code>\n<b>Status:</b> <code>${rig.status?.status || rig.status}</code>`,
    
  highWarningCount: (acct, count) =>
    `⚠️ <b>[SYSTEM ALERT]</b>\n<b>MRR:</b> ${formatAccount(acct)}\n<b>High Warning Count:</b> <b>${count}</b> rigs in warning state.`,
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