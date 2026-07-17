// core/telegram.js
// Browser-safe Telegram templates - works in both Node.js and browser environments
// Merged and debugged version with support for multiple call signatures

export const TELEGRAM_CONFIG = {
  ALERT_COOLDOWN_MS: 10 * 60 * 1000,          // 10 min
  WARNING_RIG_THRESHOLD: 3,
  RENTED_HEARTBEAT_MS: 10 * 60 * 1000,        // 1 hour (more reasonable than 10 min)
};

// Optimized HTML escaping (avoids double escaping)
const _amp = "&amp;";
const _lt = "&lt;";
const _gt = "&gt;";

export function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, _amp)
    .replace(/</g, _lt)
    .replace(/>/g, _gt);
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
 *
 * NOTE: Some templates have multiple signatures to support different call sites:
 *   - TelegramManager.jsx (browser, calls templates with simple args)
 *   - monitor.js / rental-monitor.js / rentalProcessor.js (server, calls with info objects)
 */
export const TelegramTemplates = {
  divider,

  // ─── ACTIVE RENTAL LINE (for heartbeat summaries) ───────────
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
    const paidStr = info?.price?.paid
      ? `💰 Paid: <code>${escapeHtml(info.price.paid)}</code> <b>${escapeHtml(info.price.currency || "BTC")}</b>\n`
      : "";
    return (
      `${perfEmoji} <b>${escapeHtml(algo)}</b> 🔀 <b>${escapeHtml(client)}</b> | ${escapeHtml(name)}\n` +
      `⏱ Remaining: ${remaining}\n` +
      `📡 Cur: <b>${cur}</b> | ` +
      `📊 Eff: <code>${typeof efficiency === "number" ? efficiency.toFixed(2) : efficiency}%</code>\n` +
      `📈 Avg: <code>${avg}</code> | Adv: <code>${ads}</code>\n` +
      paidStr +
      `${extra}${divider}\n`
    );
  },

  // ─── NEW RENTAL NOTIFICATION ─────────────────────────────────
  newRental: (account, r, paid, startStr, endStr, algo = "N/A", ads = "N/A") => {
    return (
      `🚀 <b>[NEW RENTAL]</b>\n` +
      `<b>Account:</b> <code>${formatAccount(account)}</code>\n` +
      `<b>Rig:</b> ${formatRig(r)}\n` +
      `<b>Algo:</b> <code>${escapeHtml(algo)}</code>\n` +
      `<b>Time:</b> ${formatTimeRange(startStr, endStr)}\n` +
      `💰 Paid: <code>${escapeHtml(paid)}</code>\n` +
      `Adv: <code>${escapeHtml(ads)}</code>\n` +
      `${divider}`
    );
  },

  // ─── RENTED NOTICE (monitor heartbeat / force notify) ────────
  rentedNotice: (type, r, info, acct, diff, rem, algo, ads) => {
    return (
      `🚀 <b>[${type}]</b>\n` +
      `<b>Account:</b> <code>${formatAccount(acct)}</code>\n` +
      `<b>Rig:</b> ${formatRig(r)}\n` +
      `<b>Algo:</b> <code>${escapeHtml(algo)}</code>\n` +
      `<b>Time:</b> ${formatTimeRange(info.startTime, info.endTime)}\n` +
      `💰 Paid: <code>${escapeHtml(info.price?.paid)} </code> <b> ${escapeHtml(info.price?.currency)}</b>\n` +
      `<b>Efficiency:</b> <b>${info.percent}%</b> (Diff: ${diff}%)\n` +
      `Adv: <code>${escapeHtml(ads)}</code>\n` +
      `<b>Remaining:</b> ${rem}\n` +
      `<b>Target to 100%:</b> ${info.targetHashrate || "N/A"}\n` +
      `${divider}\n`
    );
  },

  // ─── ZERO HASHRATE ALERT (dual signature) ───────────────────
  zeroHashrate: (...args) => {
    // Server signature: (acct, r, info, algo, ads)
    if (args.length >= 4 && typeof args[3] === "object" && args[3]?.algo) {
      const [acct, r, info, algo, ads] = args;
      return (
        `⚠️ <b>[ZERO HASHRATE]</b>\n` +
        `<b>Account:</b> <code>${formatAccount(acct)}</code>\n` +
        `${divider}\n` +
        `<b>Rig:</b> ${formatRig(r)}\n` +
        `<b>Algo:</b> <code>${escapeHtml(algo)}</code>\n` +
        `<b>Status:</b> 0 H/s (Target: ${info?.targetHashrate || "N/A"})\n` +
        `Adv: <code>${escapeHtml(ads)}</code>\n` +
        `<b>Rental:</b> <code>${r.id}</code>`
      );
    }
    // Browser signature: (account, r, elapsedMs, paid)
    const [account, r, elapsedMs, paid] = args;
    const elapsedStr = elapsedMs ? `${Math.floor(elapsedMs / 60000)}m` : "";
    return (
      `⚠️ <b>[ZERO HASHRATE]</b>\n` +
      `<b>Account:</b> <code>${formatAccount(account)}</code>\n` +
      `${divider}\n` +
      `<b>Rig:</b> ${formatRig(r)}\n` +
      `<b>Status:</b> 0 H/s for ${elapsedStr}\n` +
      `💰 Paid: <code>${escapeHtml(paid)}</code>\n` +
      `${divider}`
    );
  },

  // ─── LOW EFFICIENCY (browser, from TelegramManager.jsx) ─────
  lowEfficiency: (account, r, avg, suffix, efficiency, remainingMs, paid) => {
    const remStr = remainingMs
      ? `${Math.floor(remainingMs / 3600000)}h ${Math.floor((remainingMs % 3600000) / 60000)}m`
      : "N/A";
    return (
      `📉 <b>[LOW EFFICIENCY]</b>\n` +
      `<b>Account:</b> <code>${formatAccount(account)}</code>\n` +
      `${divider}\n` +
      `<b>Rig:</b> ${formatRig(r)}\n` +
      `<b>Efficiency:</b> <b>${parseFloat(efficiency).toFixed(2) || 0}%</b>\n` +
      `<b>Avg Hashrate:</b> ${avg} ${escapeHtml(suffix)}\n` +
      `<b>Remaining:</b> ${remStr}\n` +
      `💰 Paid: <code>${escapeHtml(paid)}</code>\n` +
      `${divider}`
    );
  },

  // ─── LOW EFFICIENCY (server, from monitor.js) ───────────────
  efficiency: (acct, r, info, efficiency, target, algo, ads) => {
    return (
      `📉 <b>[LOW EFFICIENCY]</b>\n` +
      `<b>Account:</b> <code>${formatAccount(acct)}</code>\n` +
      `${divider}\n` +
      `<b>Rig:</b> ${formatRig(r)}\n` +
      `<b>Algo:</b> <code>${escapeHtml(algo)}</code>\n` +
      `<b>Efficiency:</b> <b>${efficiency}%</b>\n` +
      `<b>Average:</b> ${info.niceAverageHashrate}\n` +
      `Adv: <code>${escapeHtml(ads)}</code>\n` +
      `<b>Target to 100%:</b> ${target.toFixed(2)} ${info.hashrate.suffix || ""}`
    );
  },

  // ─── STARTUP ALERT (dual signature) ─────────────────────────
  startup: (...args) => {
    // Server signature: (acct, r, info, ads, efficiency, target, algo)
    if (args.length >= 4 && typeof args[2] === "object" && args[2]?.startTime !== undefined) {
      const [acct, r, info, ads, efficiency, target, algo] = args;
      return (
        `⏱ <b>[STARTUP ALERT]</b>\n` +
        `<b>Account:</b> <code>${formatAccount(acct)}</code>\n` +
        `${divider}\n` +
        `<b>Rig:</b> ${formatRig(r)}\n` +
        `<b>Algo:</b> <code>${escapeHtml(algo)}</code>\n` +
        `<b>Initial Eff:</b> ${efficiency}%\n` +
        `Adv: <code>${escapeHtml(ads)}</code>\n` +
        `💰 Paid: <code>${escapeHtml(info.price?.paid)} </code> <b> ${escapeHtml(info.price?.currency)}</b>\n` +
        `<b>Time:</b> ${formatTimeRange(info.startTime)}\n` +
        `<b>Target:</b> ${target.toFixed(2)} ${info.hashrate.suffix || ""}`
      );
    }
    // Browser signature: (account, r, avg, suffix, efficiency, paid)
    const [account, r, avg, suffix, efficiency, paid] = args;
    return (
      `⏱ <b>[STARTUP ALERT]</b>\n` +
      `<b>Account:</b> <code>${formatAccount(account)}</code>\n` +
      `${divider}\n` +
      `<b>Rig:</b> ${formatRig(r)}\n` +
      `<b>Efficiency:</b> <b>${parseFloat(efficiency).toFixed(2) || 0}%</b>\n` +
      `<b>Avg Hashrate:</b> ${avg} ${escapeHtml(suffix)}\n` +
      `💰 Paid: <code>${escapeHtml(paid)}</code>\n` +
      `${divider}`
    );
  },

  // ─── COMPLETION ALERT / ALMOST COMPLETE (dual signature) ────
  completionAlert: (...args) => {
    // Server signature: (acct, r, info, efficiency, target, algo)
    if (args.length >= 3 && typeof args[2] === "object" && args[2]?.startTime) {
      const [acct, r, info, efficiency, target, algo] = args;
      return (
        `🏁 <b>[ALMOST COMPLETE]</b>\n` +
        `<b>Algo:</b> <code>${escapeHtml(algo)}</code>\n` +
        `<b>Rig:</b> ${formatRig(r)}\n` +
        `<b>Account:</b> <code>${formatAccount(acct)}</code>\n` +
        `${divider}\n` +
        `<b>Time:</b> ${formatTimeRange(info.startTime)}\n` +
        `<b>Final Eff:</b> ${efficiency}%\n` +
        `<b>Target:</b> ${target.toFixed(2)}`
      );
    }
    // Browser signature: (account, r, avg, suffix, efficiency, paid)
    const [account, r, avg, suffix, efficiency, paid] = args;
    return (
      `🏁 <b>[ALMOST COMPLETE]</b>\n` +
      `<b>Account:</b> <code>${formatAccount(account)}</code>\n` +
      `${divider}\n` +
      `<b>Rig:</b> ${formatRig(r)}\n` +
      `<b>Efficiency:</b> <b>${parseFloat(efficiency).toFixed(2) || 0}%</b>\n` +
      `<b>Avg Hashrate:</b> ${avg} ${escapeHtml(suffix)}\n` +
      `💰 Paid: <code>${escapeHtml(paid)}</code>\n` +
      `${divider}`
    );
  },

  // ─── COMPLETION SUCCESS (dual signature) ────────────────────
  completionSuccess: (...args) => {
    // Server signature: (acct, r, info, efficiency, avg, suffix, algo) – 7 args
    if (args.length === 7) {
      const [acct, r, info = { price: {} }, efficiency, avg, suffix, algo] = args;
      return (
        `✅ <b>[RENTAL SUCCESS]</b>\n` +
        `<b>Account:</b> <code>${formatAccount(acct)}</code>\n` +
        `${divider}\n` +
        `<b>Rig:</b> ${formatRig(r)}\n` +
        `<b>Algo:</b> <code>${escapeHtml(algo)}</code>\n` +
        `<b>Avg Speed:</b> ${avg} ${escapeHtml(suffix)}\n` +
        `<b>Final Efficiency:</b> <b>${parseFloat(efficiency).toFixed(2)}%</b>\n` +
        `💰 Paid: <code>${escapeHtml(info.price?.paid)}</code> <b>${escapeHtml(info.price?.currency)}</b>`
      );
    }
    // Browser signature: (acct, r, info, efficiency, ads, avg, suffix, algo) – 8 args
    const [acct, r, info = { price: {} }, efficiency, ads, avg, suffix, algo] = args;
    return (
      `✅ <b>[RENTAL SUCCESS]</b>\n` +
      `<b>Account:</b> <code>${formatAccount(acct)}</code>\n` +
      `${divider}\n` +
      `<b>Rig:</b> ${formatRig(r)}\n` +
      `<b>Algo:</b> <code>${escapeHtml(algo)}</code>\n` +
      `<b>Avg Speed:</b> ${avg} ${escapeHtml(suffix)}\n` +
      `Adv: <code>${escapeHtml(ads)}</code>\n` +
      `<b>Final Efficiency:</b> <b>${parseFloat(efficiency).toFixed(2)}%</b>\n` +
      `💰 Paid: <code>${escapeHtml(info.price?.paid)}</code> <b>${escapeHtml(info.price?.currency)}</b>`
    );
  },

  // ─── PERFECT EFFICIENCY 100% (dual signature) ───────────────
  perfectEfficiency: (...args) => {
    // Server signature: (acct, r, efficiency, info, remainingMs, algo) – 6 args
    if (args.length === 6 && typeof args[3] === "object") {
      const [acct, r, efficiency, info, remainingMs, algo] = args;
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
    }
    // Browser signature: (account, r, efficiencyVal, paid, remainingMs) – 5 args
    const [account, r, efficiencyVal, paid, remainingMs] = args;
    const remH = Math.floor(remainingMs / 3600000);
    return (
      `✅ <b>[PERFECT 100%]</b>\n` +
      `<b>Account:</b> <code>${formatAccount(account)}</code>\n` +
      `${divider}\n` +
      `<b>Rig:</b> ${formatRig(r)}\n` +
      `<b>Status:</b> Running perfectly at ${parseFloat(efficiencyVal).toFixed(2)}%\n` +
      `<b>Remaining:</b> ~${remH}h\n` +
      `💰 Paid: <code>${escapeHtml(paid)}</code>\n` +
      `${divider}`
    );
  },

  // ─── RENTAL FINISHED (dual signature) ───────────────────────
  finished: (...args) => {
    // If 4 args: (r, info, algo, ads)
    // If 3 args: (r, info, algo) – ads omitted
    const [r, info, algo, ads] = args;
    const adsStr = ads ? `Adv: <code>${escapeHtml(ads)}</code>\n` : "";
    return (
      `🏁 <b>[RENTAL FINISHED]</b>\n` +
      `<b>Account:</b> <code>${formatAccount(r.client)}</code>\n` +
      `${divider}\n` +
      `<b>Rig:</b> ${formatRig(r)}\n` +
      `<b>Algo:</b> <code>${escapeHtml(algo)}</code>\n` +
      adsStr +
      `<b>Final Avg:</b> ${info.niceAverageHashrate}\n` +
      `<b>Final Eff:</b> <b>${info.percent}%</b>\n` +
      `💰 Total Paid: <code>${escapeHtml(info.price?.paid)} </code> <b> ${escapeHtml(info.price?.currency)}</b>`
    );
  },

  // ─── HEARTBEAT SUMMARY (dual signature) ─────────────────────
  heartbeatSummary: (...args) => {
    // Object signature: ({ totals, activeRentals, ... })
    if (args.length === 1 && typeof args[0] === "object" && !Array.isArray(args[0]) && args[0] !== null) {
      const data = args[0];
      const totals = data?.totals || {};
      const activeRentals = data?.activeRentals || [];

      let summary = `📊 <b>SUMMARY Merg</b> [${new Date().toLocaleTimeString()}]\n`;
      summary += `${divider}\n`;
      summary += `🟢 Online: <b>${totals.rigs - totals.offline - totals.disabled || 0}</b> / Renting: <b>${totals.rented || 0}</b>\n`;
      summary += `🔴 Offline: <b>${totals.offline || 0}</b> / Disabled: <b>${totals.disabled || 0}</b>\n`;
      summary += `📦 Total Rigs: <b>${totals.rigs || 0}</b>\n`;
      summary += `${divider}\n`;

      if (activeRentals && activeRentals.length > 0) {
        summary += `<b>Active Rentals:</b>\n\n`;
        for (const r of activeRentals) {
          const eff = typeof r.efficiency === "number" ? r.efficiency.toFixed(2) : r.efficiency || "0";
          summary += `• <b>${escapeHtml(r.name || r.id)}</b> | Eff: <code>${eff}%</code> | Diff: <code>${r.orderDiff || "0"}%</code>\n`;
        }
        summary += `${divider}\n`;
      } else {
        summary += `<i>No active rentals</i>\n`;
      }
      return summary;
    }

    // Many-argument signature: (barChart, online, rented, offline, disabled, total, lines, time, rented24h, algos)
    const [barChart, online, rented, offline, disabled, total, lines, time, rented24h, algos] = args;
    const rentedCount = typeof rented === "number" ? rented : parseInt(rented) || 0;

    let summary = `📊 <b>SUMMARY Merg</b> [${time || new Date().toLocaleTimeString()}]\n`;
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
      summary += `<b>Active Rentals Detail:</b>\n\n<i>No active rentals</i>\n`;
    }
    return summary;
  },

  // ─── MANUAL NOTICE (from TelegramManager.jsx "Send Now") ────
  manualNotice: (r, account, avg, suffix, roi, remStr, progress, paid) => {
    return (
      `📋 <b>[MANUAL NOTICE]</b>\n` +
      `<b>Account:</b> <code>${formatAccount(account)}</code>\n` +
      `${divider}\n` +
      `<b>Rig:</b> ${formatRig(r)}\n` +
      `<b>Algo:</b> <code>${escapeHtml(r?.rig?.type || r?.algorithm || r?.algo || "N/A")}</code>\n` +
      `<b>Avg:</b> <code>${avg}</code> ${escapeHtml(suffix)}\n` +
      `<b>ROI:</b> <code>${roi}%</code> | <b>Progress:</b> <code>${progress}%</code>\n` +
      `<b>Remaining:</b> ${remStr}\n` +
      `💰 Paid: <code>${escapeHtml(paid)}</code>\n` +
      `${divider}`
    );
  },

  // ─── HERO MINERS SUMMARY ────────────────────────────────────
  herominersSummary: (data) => {
    if (!data || !data.liveStats) return "No HeroMiners data available.";
    return (
      `⛏️ <b>HeroMiners Stats for ${escapeHtml(data.coin)}</b>\n` +
      `${divider}\n` +
      `<b>Address:</b> <code>${escapeHtml(data.address)}</code>\n` +
      `<b>Hashrate:</b> ${data.liveStats.currentHashrate} (Avg 24h: ${data.liveStats.avg24h})\n` +
      `<b>Workers:</b> ${data.liveStats.workersOnline} / ${data.liveStats.workersTotal}\n` +
      `${divider}\n` +
      `<b>Pending:</b> ${data.paymentStats.pendingBalance} (${data.paymentStats.pendingUSD})\n` +
      `<b>Total Paid:</b> ${data.paymentStats.totalPaid} (${data.paymentStats.totalPaidUSD})\n` +
      `<b>Paid (24h):</b> ${data.paymentStats.paid24h}\n` +
      `${divider}\n` +
      `<b>Shares (Valid/Total):</b> ${data.shareStats.total.valid} / ${data.shareStats.total.total}\n` +
      `<b>Efficiency:</b> ${data.shareStats.total.efficiency}%\n` +
      `<b>Blocks Found:</b> ${data.blockStats.totalBlocks}\n` +
      `${divider}\n` +
      `<i>Last Share: ${data.liveStats.lastShare}</i>`
    );
  },

  // ─── RIG STATUS WARNING ─────────────────────────────────────
  rigStatusWarning: (acct, rig, algo) =>
    `⚠️ <b>[RIG WARNING]</b>\n` +
    `${formatAccount(acct)}\n` +
    `${formatRig(rig)}\n` +
    `<b>Algo:</b> <code>${escapeHtml(algo)}</code>\n` +
    `<b>Status:</b> <code>${rig.status?.status || rig.status}</code>`,

  // ─── HIGH WARNING COUNT ────────────────────────────────────
  highWarningCount: (acct, count) =>
    `⚠️ <b>[SYSTEM ALERT]</b>\n` +
    `${formatAccount(acct)}\n` +
    `<b>High Warning Count:</b> <b>${count}</b> rigs in warning state.`,
};

// ============================================================
// SERVER-ONLY: Template reload function (safe for browser)
// ============================================================
export function reloadTelegramTemplates() {
  return TelegramTemplates;
}