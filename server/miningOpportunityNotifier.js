import path from "path";
import fs from "node:fs/promises";
import sqlite3 from "sqlite3";
import * as cheerio from "cheerio";
import { normalizeAlgo, getAlgoDisplayName } from "../src/core/mapping.js";
import { fetchAndSaveCoinPrices, getCoinPricesFromDb } from "./coinGecko/coinGeckoClient.js";
import { getBtcPrice } from "./utils/priceUtils.js";
import { getCoinGeckoId } from "./coinGecko/coinMapping.js";
import { CONFIG } from "./config.js";
import { scrapeHeroMinersGlobal } from "./miners/heroMiners.js";
import { scrapeMiningDutchGlobal } from "./miners/miningDutch.js";
import { scrapeMinerstat } from "./miners/minerstat.js";
import { scrapeWhatToMine } from "./miners/whatToMine.js";
import { getK1PoolGlobal } from "./miners/k1pool.js";

const DATA_DIR = path.resolve(process.cwd(), "data");
const TRENDS_DB_PATH = path.join(DATA_DIR, "mining_trends.db");
const COMMON_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
};

let lastNotifiedOpportunities = new Map();
let opportunityDb = null;
let dbInitPromise = null;

const numberValue = (value) => {
  if (value === null || value === undefined || value === "") return 0;
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseFloat(
          String(value)
            .replace(/,/g, "")
            .replace(/[^\d.-]/g, ""),
        );
  return Number.isFinite(parsed) ? parsed : 0;
};

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

async function getTrendDb() {
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

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function all(db, sql, params = []) {
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
async function sendMineTelegram(message) {
  // This is a lazy import to avoid circular dependency issues if monitor.js imports this file.
  const { getOpportunityAlertsStatus } = await import("./monitor.js");
  const tgStatus = await getOpportunityAlertsStatus();
  if (!tgStatus.enabled) {
    console.log("[mine:tg] Opportunity notifications disabled via global setting.");
    return { ok: true, description: "Notifications disabled" };
  }

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
          body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
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
//  Fetch NH and MRR prices from local API
// =========================
async function fetchPrices(algos, type) {
  if (!Array.isArray(algos) || algos.length === 0) return {};
  const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
  const settled = await Promise.allSettled(
    algos.map(async (algo) => {
      try {
        let url;
        if (type === "nh") {
          url = `${baseUrl}/api/v2/hashpower/order/price?algorithm=${encodeURIComponent(algo)}&client=BT`;
        } else {
          url = `${baseUrl}/api/v2/mrr/rentals?algo=${encodeURIComponent(algo)}&limit=1`;
        }
        const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!r.ok) return [algo, 0];
        const d = await r.json();
        let price = 0;
        if (type === "nh") {
          price = parseFloat(d?.price ?? d?.fixedPrice ?? d?.marketPrice ?? 0);
        } else {
          const rental = d?.data?.rentals?.[0] || d?.data?.[0] || {};
          price = parseFloat(rental.price || rental.min_price || rental.rate || 0);
        }
        return [algo, Number.isFinite(price) ? price : 0];
      } catch { return [algo, 0]; }
    })
  );
  const results = {};
  for (const item of settled) {
    if (item.status === "fulfilled") results[item.value[0]] = item.value[1];
  }
  return results;
}

function calculateProfitability(poolBtc, nhPrice, coinPrices = null) {
  const result = { spreadPct: null, status: "neutral", recommendation: "", profitBtc: 0, profitUsd: 0 };
  if (poolBtc > 0 && nhPrice > 0) {
    const spread = ((poolBtc - nhPrice) / nhPrice) * 100;
    result.spreadPct = spread;
    result.profitBtc = poolBtc - nhPrice;
    if (coinPrices?.usd) result.profitUsd = result.profitBtc * coinPrices.usd;
    // spread > 0: pool revenue exceeds NH cost → buy cheap NH hashrate, mine pool
    if (spread > CONFIG.SPREAD_THRESHOLD_PCT) { result.status = "profitable"; result.recommendation = "✅ Buy hashrate on NiceHash, mine on pool"; }
    // spread < 0: NH pays more than pool → mine pool, sell hashrate on NH
    else if (spread < -CONFIG.SPREAD_THRESHOLD_PCT) { result.status = "profitable"; result.recommendation = "✅ Mine on pool, sell hashrate on NiceHash"; }
    else { result.status = "neutral"; result.recommendation = "➖ Break-even"; }
  }
  return result;
}

function extractCoinNames(heroRows, dutchRows, minerstatRows, wtmRows, k1poolRows) {
  const coinNames = new Set();
  const allRows = [
    ...(heroRows || []),
    ...(dutchRows || []),
    ...(minerstatRows || []),
    ...(wtmRows || []),
    ...(k1poolRows || []),
  ];

  for (const row of allRows) {
    if (row.coin) coinNames.add(row.coin.toUpperCase());
    if (row.subdomain) coinNames.add(row.subdomain.toUpperCase());
    if (row.algorithm) coinNames.add(row.algorithm.toUpperCase());
    if (row.tag) coinNames.add(row.tag.toUpperCase());
    if (row.symbol) coinNames.add(row.symbol.toUpperCase());
  }
  return Array.from(coinNames);
}

async function sendOpportunityAlert(opp) {
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
    `━━━━━━━━━━━━━━━━━━\n\n<i>Pool revenue</i> = value mined from pool with this hashrate\n` +
    `<i>NH/MRR cost</i> = price to get same hashrate on marketplace\n` +
    `\n<i>Updated every 15 min</i>`;
  await sendMineTelegram(msg);
}

export async function scanMiningOpportunities(force = false) {
  console.log(`[mine:scan] Scanning...`);

  try {
    await fetchAndSaveCoinPrices(force);
  } catch (err) {
    console.warn('[mine:scan] CoinGecko fetch failed:', err.message);
  }

  const btcPrice = await getBtcPrice(); // warm cache

  const [heroRes, dutchRes, minerstatRes, wtmRes, k1poolRes] = await Promise.all([
    scrapeHeroMinersGlobal(btcPrice, force),
    scrapeMiningDutchGlobal(btcPrice, force),
    scrapeMinerstat(btcPrice),
    scrapeWhatToMine(btcPrice),
    getK1PoolGlobal(),
  ]);

  const coinNames = extractCoinNames(
    heroRes?.coinStats,
    dutchRes?.coinStats,
    minerstatRes?.coinStats,
    wtmRes?.coinStats,
    k1poolRes?.coinStats);
  const coinIdMap = new Map();
  const coinIdSet = new Set();
  for (const name of coinNames) {
    const id = getCoinGeckoId(name);
    if (id) { coinIdMap.set(name, id); coinIdSet.add(id); }
  }

  let coinPrices = {};
  try {
    coinPrices = await getCoinPricesFromDb(Array.from(coinIdSet));
  } catch (err) {
    console.warn('[mine:scan] Failed to get coin prices:', err.message);
  }

  const algoSet = new Set();
  const allStats = [
    ...(heroRes?.coinStats || []),
    ...(dutchRes?.coinStats || []),
    ...(minerstatRes?.coinStats || []),
    ...(wtmRes?.coinStats || []),
    ...(k1poolRes?.coinStats || []),
  ];

  for (const row of allStats) {
    const algo = row.normalizedAlgo || normalizeAlgo(row.algorithm || row.algo || row.tag);
    if (algo && algo !== "UNKNOWN") algoSet.add(algo);
  }

  const algos = Array.from(algoSet).filter(Boolean);
  if (algos.length === 0) return { success: false, error: "No algos found" };

  const [nhPrices, mrrPrices] = await Promise.all([
    fetchPrices(algos, "nh"),
    fetchPrices(algos, "mrr"),
  ]);

  const buildAlgoMap = (rows) => {
    const map = new Map();
    if (!rows) return map;
    for (const row of rows) {
        const key = row.normalizedAlgo || normalizeAlgo(row.algorithm || row.algo || row.tag);
        if (!key || key === 'UNKNOWN') continue;

        const btcPerDay = numberValue(row.btcPerDay || row.btc_revenue) || (numberValue(row.usdPerDay || row.revenue) / btcPrice);

        if (!map.has(key)) map.set(key, { btcPerDay: 0, miners: 0 });
        const cur = map.get(key);
        cur.btcPerDay = Math.max(cur.btcPerDay, btcPerDay);
        cur.miners += numberValue(row.miners || row.poolMiners || 0);
    }
    return map;
  };

  const heroByAlgo = buildAlgoMap(heroRes?.coinStats);
  const dutchByAlgo = buildAlgoMap(dutchRes?.coinStats);
  const minerstatByAlgo = buildAlgoMap(minerstatRes?.coinStats);
  const wtmByAlgo = buildAlgoMap(wtmRes?.coinStats);
  const k1poolByAlgo = buildAlgoMap(k1poolRes?.coinStats);

  const opportunities = [];
  const now = new Date();

  for (const algo of algos) {
    const sources = [
      { name: 'HeroMiners', ...heroByAlgo.get(algo) },
      { name: 'Mining-Dutch', ...dutchByAlgo.get(algo) },
      { name: 'Minerstat', ...minerstatByAlgo.get(algo) },
      { name: 'WhatToMine', ...wtmByAlgo.get(algo) },
      { name: 'K1Pool', ...k1poolByAlgo.get(algo) },
    ];

    const bestPoolSource = sources.reduce((best, current) => ((current.btcPerDay || 0) > (best.btcPerDay || 0) ? current : best), { btcPerDay: 0 });

    const poolBtc = bestPoolSource.btcPerDay || 0;
    const poolMiners = bestPoolSource.miners || 0;
    const sourceName = bestPoolSource.name || 'N/A';
    
    const nhPrice = nhPrices[algo] || 0;
    const mrrPrice = mrrPrices[algo] || 0;
    const profit = calculateProfitability(poolBtc, nhPrice, null);
    const spread = profit.spreadPct;

    opportunities.push({
      algo,
      label: getAlgoDisplayName(algo),
      poolBtcPerDay: poolBtc,
      nhPriceBtc: nhPrice,
      mrrPriceBtc: mrrPrice,
      spreadPct: spread,
      profitStatus: profit.status,
      recommendation: profit.recommendation,
      poolMiners: poolMiners,
      source: sourceName,
    });
  }

  opportunities.sort((a, b) => (b.spreadPct ?? -Infinity) - (a.spreadPct ?? -Infinity));

  const db = await getTrendDb();
  const capturedAt = now.toISOString();
  const notifyMessages = [];

  for (const opp of opportunities) {
    try {
      await run(db,
        `INSERT INTO mining_opportunities (algo, captured_at, pool_btc_per_day, nh_price_btc, mrr_price_btc, spread_pct, profit_status, pool_miners)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [opp.algo, capturedAt, opp.poolBtcPerDay || 0, opp.nhPriceBtc || 0,
         opp.mrrPriceBtc || 0, opp.spreadPct ?? 0, opp.profitStatus || 'neutral', opp.poolMiners || 0]
      );
    } catch (err) {
      console.warn('[DB] Insert failed for', opp.algo, err.message);
    }

    if (opp.spreadPct !== null && opp.spreadPct >= CONFIG.SPREAD_THRESHOLD_PCT && opp.poolBtcPerDay > 0) {
      const lastNotified = lastNotifiedOpportunities.get(opp.algo) || 0;
      if (Date.now() - lastNotified > CONFIG.MIN_NOTIFY_INTERVAL_MS || force) {
        lastNotifiedOpportunities.set(opp.algo, Date.now());
        notifyMessages.push(opp);
      }
    }
  }

  if (notifyMessages.length > 0) {
    for (const opp of notifyMessages) {
      await sendOpportunityAlert(opp);
    }
  }

  const profitable = opportunities.filter((o) => o.profitStatus === "profitable");
  // if (profitable.length > 0) {
  //   await sendMiningSummary(profitable.slice(0, 10));
  // }

  const positiveCount = opportunities.filter(o => (o.spreadPct ?? 0) > 0).length;

  return {
    success: true,
    scannedAt: capturedAt,
    totalAlgos: algos.length,
    opportunities: opportunities.slice(0, 20),
    notificationsSent: notifyMessages.length,
    positiveCount,
    data: opportunities, // Ensure the full data is returned for the frontend to process
  };
}

// =========================
//  Summary send
// =========================
async function sendMiningSummary(topOpps) {
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
//  API route handler
// =========================
export async function handleMiningOpportunityScan(req, res) {
  try {
    const force = req.query?.force === "true";
    const result = await scanMiningOpportunities(force);
    res.json(result);
  } catch (err) {
    console.error("[mine:scan:error]", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

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
    const coinPrices = await getCoinPricesFromDb();
    return { success: true, timestamp: new Date().toISOString(), summary: stats[0] || {}, topOpportunities: latest, coinPrices };
  } catch (err) { return { success: false, error: err.message }; }
}

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

let scanInterval = null;

export function startMiningOpportunityScanner() {
  if (scanInterval) {
    console.log("[mine:scan] Scanner already running");
    return;
  }
  console.log("[mine:scan] Starting scanner (every 15 min)");

  // Initial scan
  scanMiningOpportunities(true).catch((err) => {
    console.error("[mine:scan] Initial scan failed:", err.message);
  });

  scanInterval = setInterval(() => {
    scanMiningOpportunities(false).catch((err) => {
      console.error("[mine:scan] Scheduled scan failed:", err.message);
    });
  }, 600 * 60 * 1000);
}

export function stopMiningOpportunityScanner() {
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
    console.log("[mine:scan] Scanner stopped");
  }
}
