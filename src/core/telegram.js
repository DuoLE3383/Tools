// core/telegram.js - Complete upgraded version
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
  if (!Number.isFinite(num) || num <= 0) return "0 H/s";
  const units = ["H/s", "KH/s", "MH/s", "GH/s", "TH/s", "PH/s", "EH/s", "ZH/s"];
  let idx = 0;
  let scaled = num;
  while (scaled >= 1000 && idx < units.length - 1) {
    scaled /= 1000;
    idx += 1;
  }
  const unit = suffix || units[idx] || "H/s";
  return `${scaled.toFixed(2)} ${unit}`;
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

  // ============================================================
  // ACTIVE RENTAL LINE - FIXED PARAMETER ORDER
  // ============================================================
  activeRentalLine: (
    perfEmoji, // 1: performance emoji
    algo, // 2: algo
    name, // 3: rig name
    remaining, // 4: remaining time
    efficiency, // 5: efficiency percentage
    roi, // 6: roi percentage
    cur, // 7: current hashrate
    avg, // 8: average hashrate
    adv,  // 9: advertised hashrate
    target, // 10: target hashrate
    extra, // 11: extra info
    client, // 12: client/account
    info = { price: {} } // 13: price info
  ) => {
    const shortName = String(name || "N/A")
      .replace(/\s+/g, " ")
      .trim();

    const displayName =
      shortName.length > 18 ? `${shortName.slice(0, 17)}...` : shortName;

    // Format all values with proper display
    const avgDisplay = avg || "⚠️ H/s";
    const advDisplay = adv || "⚠️ H/s";
    const curDisplay = cur || "⚠️ H/s";
    
    // Ensure cur has warning if it's 0
    const finalCurDisplay = curDisplay === "0 H/s" || curDisplay === "0" 
      ? "⚠️ 0 H/s" 
      : curDisplay;

    return (
      `${perfEmoji} <b>${escapeHtml(algo)}</b> 🔀 <code>${escapeHtml(client)}</code> | ${escapeHtml(displayName)}\n` +
      `⏱️ Remaining: <code> ${escapeHtml(remaining)}</code>\n` +
      `📡 Cur: <code>${escapeHtml(finalCurDisplay)}</code> | 📈 Avg: <code>${escapeHtml(avgDisplay)}</code>\n` +
      `📢 Adv: <code>${escapeHtml(advDisplay)}</code> | 📊 Eff: <b>${typeof efficiency === "number" ? efficiency.toFixed(2) : efficiency}%</b>\n` +
      `💰 Paid: <b><code>${escapeHtml(info.price?.paid || "0.00")}</code> ${escapeHtml(info.price?.currency || "BTC")}</b>\n` +
      `${extra}${divider}\n`
    );
  },

  rentedNotice: (type, r, info, acct, rem, algo, ads) => {
    return (
      `🚀 <b>[${type}]</b>\n` +
      `<b>Account:</b> <code>${escapeHtml(formatAccount(acct))}</code>\n` +
      `${divider}\n` +
      `${escapeHtml(formatRig(r))}\n` +
      `<b>Algo:</b> <code>${escapeHtml(algo)}</code>\n` +
      `<b>Time:</b> ${escapeHtml(formatTimeRange(info.startTime, info.endTime))}\n` +
      `${divider}\n` +
      `<b>Paid:</b> <code> ${escapeHtml(info.price.paid)}</code> ${escapeHtml(info.price?.currency)}\n` +
      `<b>Efficiency:</b> <b>${escapeHtml(info.percent)}%</b> \n` +
      `📢 Adv: <code>${escapeHtml(ads)}</code>\n` +
      `<b>Remaining:</b> ${escapeHtml(rem)}\n` +
      `<b>Target to 100%:</b> ${escapeHtml(info.targetHashrate || "N/A")}`
    );
  },

  zeroHashrate: (acct, r, info, algo, ads) => {
    return (
      `⚠️ <b>[ZERO HASHRATE]</b>\n` +
      `<b>Account:</b> <code>${formatAccount(acct)}</code>\n` +
      `${divider}\n` +
      `${formatRig(r)}\n` +
      `<b>Algo:</b> <code>${escapeHtml(algo)}</code>\n` +
      `<b>Status:</b> 0 H/s (Target: ${escapeHtml(info.targetHashrate)})\n` +
      `📢 Adv: <code>${escapeHtml(ads)}</code>\n` +
      `<b>Rental:</b> <code>${escapeHtml(r.id)}</code>`
    );
  },

  efficiency: (acct, r, info, efficiency, target, algo, ads, diff) => {
    return (
      `📉 <b>[LOW EFFICIENCY]</b>\n` +
      `<b>Account:</b> <code>${formatAccount(acct)}</code>\n` +
      `${divider}\n` +
      `${formatRig(r)}\n` +
      `<b>Algo:</b> <code>${escapeHtml(algo)}</code>\n` +
      `<b>Efficiency:</b> <b>${escapeHtml(efficiency)}%</b> (Diff: ${escapeHtml(diff)}%)\n` +
      `<b>Average:</b> ${escapeHtml(info.niceAverageHashrate)}\n` +
      `📢 Adv: <code>${escapeHtml(ads)}</code>\n` +
      `<b>Target to 100%:</b> ${escapeHtml(target.toFixed(2))} ${escapeHtml(info.hashrate.suffix || "")}`
    );
  },

  startup: (acct, r, info, efficiency, target, algo, ads) => {
    return (
      `⏱ <b>[STARTUP ALERT]</b>\n` +
      `<b>Account:</b> <code>${formatAccount(acct)}</code>\n` +
      `${divider}\n` +
      `${formatRig(r)}\n` +
      `<b>Algo:</b> <code>${escapeHtml(algo)}</code>\n` +
      `<b>Initial Eff:</b> ${escapeHtml(efficiency)}%\n` +
      `📢 Adv: <code>${escapeHtml(ads)}</code>\n` +
      `<b>Paid:</b> <code> ${escapeHtml(info.price.paid)}</code> ${escapeHtml(info.price?.currency)}\n` +
      `<b>Time:</b> ${formatTimeRange(escapeHtml(info.startTime))}\n` +
      `<b>Target:</b> ${escapeHtml(target.toFixed(2))} ${escapeHtml(info.hashrate.suffix || "")}`
    );
  },

  completionAlert: (acct, r, info, efficiency, target, algo) => {
    return (
      `🏁 <b>[ALMOST COMPLETE]</b>\n` +
      `<b>Algo:</b> <code>${escapeHtml(algo)}</code>\n` +
      `${formatRig(r)}\n` +
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
      `<b>Account:</b> ${escapeHtml(formatAccount(acct))}\n` +
      `${divider}\n` +
      `${escapeHtml(formatRig(r))}\n` +
      `<b>Algo:</b> <code>${escapeHtml(algo)}</code>\n` +
      `<b>Avg Speed:</b> ${escapeHtml(avg)} ${escapeHtml(suffix)}\n` +
      `<b>Final Efficiency:</b> <b>${escapeHtml(parseFloat(efficiency).toFixed(2))}%</b>\n` +
      `<b>Paid:</b><code> ${escapeHtml(info.price.paid)}</code>${escapeHtml(info.price?.currency)}`
    );
  },

  perfectEfficiency: (acct, r, efficiency, info, remainingMs, algo) => {
    const remH = Math.floor(remainingMs / 3600000);
    return (
      `✅ <b>[PERFECT 100%]</b>\n` +
      `<b>Account:</b> <code>${escapeHtml(formatAccount(acct))}</code>\n` +
      `${divider}\n` +
      `${escapeHtml(formatRig(r))}\n` +
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
      `${escapeHtml(formatRig(r))}\n` +
      `<b>Algo:</b> <code>${escapeHtml(algo)}</code>\n` +
      `<b>Final Avg:</b> ${escapeHtml(info.niceAverageHashrate)}\n` +
      `<b>Final Eff:</b> <b>${escapeHtml(info.percent)}%</b>\n` +
      `<b>Total Paid:</b> <code> ${escapeHtml(info.price.paid)}</code> ${escapeHtml(info.price.currency)}`
    );
  },

  // ============================================================
  // HEARTBEAT SUMMARY - FIXED
  // ============================================================
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
    const rentedCount = typeof rented === "number" ? rented : parseInt(rented) || 0;

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

    // Better handling of rental details
    if (lines && Array.isArray(lines) && lines.length > 0) {
      summary += `<b>Active Rentals Detail:</b>\n\n`;
      const validLines = lines.filter(line => line && line.trim() && line.trim() !== '');
      if (validLines.length > 0) {
        summary += validLines.join("");
      } else {
        summary += `<i>No active rentals with valid data</i>\n`;
      }
    } else {
      summary += `<b>Active Rentals Detail:</b>\n\n`;
      summary += `<i>No active rentals found</i>\n`;
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

export function reloadTelegramTemplates() {
  return TelegramTemplates;
}