// miningTelegram.js
import sqlite3 from "sqlite3";
import fs from "node:fs/promises";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const TRENDS_DB_PATH = path.join(DATA_DIR, "mining_trends.db");

let opportunityDb = null;
let dbInitPromise = null;

// =========================
//  DB
// =========================
function openDb() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(TRENDS_DB_PATH, (err) => {
      if (err) return reject(err);
      resolve(db);
    });
  });
}

export async function getTrendDb() {
  if (opportunityDb) return opportunityDb;
  if (dbInitPromise) return dbInitPromise;
  dbInitPromise = (async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const db = await openDb();
    await run(db, "PRAGMA journal_mode = WAL");
    await run(db, `CREATE TABLE IF NOT EXISTS mining_opportunities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      algo TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      pool_btc_per_day REAL DEFAULT 0,
      nh_price_btc REAL DEFAULT 0,
      mrr_price_btc REAL DEFAULT 0,
      spread_pct REAL DEFAULT 0,
      profit_status TEXT DEFAULT 'neutral',
      pool_miners INTEGER DEFAULT 0,
      trend_direction TEXT DEFAULT 'stable',
      summary_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
    await run(db, `CREATE INDEX IF NOT EXISTS idx_opp_algo_time 
      ON mining_opportunities(algo, captured_at)`);
    opportunityDb = db;
    return db;
  })();
  return dbInitPromise;
}

export function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

export function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

// =========================
//  Telegram send (TELEGRAM_MINE_BOT_TOKEN)
// =========================
export async function sendMineTelegram(message) {
  const botToken = process.env.TELEGRAM_MINE_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_GROUP_ID;
  if (!botToken || !chatId) {
    console.warn("[mine:tg] TELEGRAM_MINE_BOT_TOKEN or TELEGRAM_GROUP_ID not configured");
    return null;
  }
  const text = String(message || "").trim();
  if (!text) return null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            chat_id: chatId, 
            text, 
            parse_mode: "HTML", 
            disable_web_page_preview: true 
          }),
        }
      );
      const data = await res.json();
      if (res.ok && data?.ok) return data;
      throw new Error(data?.description || `HTTP ${res.status}`);
    } catch (err) {
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 500));
      else console.error("[mine:tg] Failed to send:", err.message);
    }
  }
  return null;
}

// =========================
//  Send Opportunity Alert
// =========================
export async function sendOpportunityAlert(opp) {
  const emoji = opp.spreadPct >= 20 ? "🔥" : opp.spreadPct >= 10 ? "💰" : "✅";
  const msg = `${emoji} <b>Mining Opportunity</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `<b>Algo:</b> <code>${opp.label}</code>\n` +
    `<b>Pool Revenue:</b> <code>${opp.poolBtcPerDay.toFixed(8)} BTC/day</code>\n` +
    `<b>NiceHash Cost:</b> <code>${opp.nhPriceBtc.toFixed(8)} BTC/day</code>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `<b>Spread:</b> <code>${opp.spreadPct >= 0 ? "+" : ""}${opp.spreadPct.toFixed(2)}%</code>\n` +
    `<b>Source:</b> ${opp.source}\n` +
    `<b>Miners:</b> ${opp.poolMiners}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `<b>${opp.recommendation || ""}</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n<i>Updated every 15 min</i>`;
  await sendMineTelegram(msg);
}

// =========================
//  Send Summary
// =========================
export async function sendMiningSummary(topOpps) {
  const lines = topOpps.map((o, i) => {
    const pct = o.spreadPct >= 0 ? "+" + o.spreadPct.toFixed(2) : o.spreadPct.toFixed(2);
    const emoji = o.spreadPct >= 20 ? "🔥" : o.spreadPct >= 10 ? "💰" : "✅";
    return `${emoji} <b>${i + 1}. ${o.label}</b> — ${o.poolBtcPerDay.toFixed(8)} BTC/day (${pct}%) | ${o.poolMiners} miners`;
  });
  const msg = `📊 <b>Mining Opportunity Summary</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `<b>Time:</b> ${new Date().toLocaleTimeString()}\n` +
    `<b>Profitable algos:</b> ${topOpps.length}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    lines.join("\n") +
    `\n━━━━━━━━━━━━━━━━━━\n` +
    `<i>Updated automatically every 30 min</i>`;
  await sendMineTelegram(msg);
}

// =========================
//  Get Mining Status
// =========================
export async function getMiningStatus() {
  try {
    const db = await getTrendDb();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const stats = await all(db,
      `SELECT COUNT(*) as total, 
        SUM(CASE WHEN profit_status = 'profitable' THEN 1 ELSE 0 END) as profitable,
        SUM(CASE WHEN profit_status = 'loss' THEN 1 ELSE 0 END) as loss,
        SUM(CASE WHEN profit_status = 'neutral' THEN 1 ELSE 0 END) as neutral,
        AVG(spread_pct) as avg_spread, MAX(spread_pct) as max_spread,
        SUM(pool_miners) as total_miners
       FROM mining_opportunities WHERE captured_at >= ?`, [oneHourAgo]
    );
    const latest = await all(db,
      `SELECT algo, coin_name, coin_id, pool_btc_per_day, spread_pct, profit_status, pool_miners
       FROM mining_opportunities WHERE captured_at >= ? AND spread_pct IS NOT NULL
       ORDER BY spread_pct DESC LIMIT 10`, [oneHourAgo]
    );
    return { success: true, timestamp: new Date().toISOString(), summary: stats[0] || {}, topOpportunities: latest };
  } catch (err) { 
    return { success: false, error: err.message }; 
  }
}

// =========================
//  Send Mining Status
// =========================
export async function sendMiningStatus() {
  const status = await getMiningStatus();
  if (!status.success) return status;
  const s = status.summary;
  const msg = `${s.profitable > 0 ? "🟢" : "🔴"} <b>Mining System Status</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n<b>Time:</b> ${new Date().toLocaleString()}\n` +
    `<b>Algos:</b> ${s.total}\n<b>Miners:</b> ${(s.total_miners || 0).toLocaleString()}\n` +
    `━━━━━━━━━━━━━━━━━━\n<b>Profitability:</b>\n  🟢 Profitable: ${s.profitable}\n  🟡 Neutral: ${s.neutral}\n  🔴 Loss: ${s.loss}\n` +
    `━━━━━━━━━━━━━━━━━━\n<b>Stats:</b>\n  📊 Avg Spread: ${(s.avg_spread || 0).toFixed(2)}%\n  📈 Max Spread: ${(s.max_spread || 0).toFixed(2)}%\n` +
    `━━━━━━━━━━━━━━━━━━\n<i>System scans every 15 minutes</i>`;
  await sendMineTelegram(msg);
  return { success: true };
}