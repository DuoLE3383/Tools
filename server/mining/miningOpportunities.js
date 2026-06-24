// miningOpportunities.js
import path from "path";
import * as cheerio from "cheerio";
import {
  normalizeAlgo,
  getAlgorithmDisplayName,
} from "../../src/core/mapping.js";
import { fetchAndSaveCoinPrices, getCoinPricesFromDb } from "../coinGecko/coinGeckoClient.js";
import { getBtcPrice } from "../utils/priceUtils.js"; // This seems to be a custom util, assuming it exists
import { getCoinGeckoId } from "../coinGecko/coinMapping.js";
import { CONFIG } from "../config.js";
import {
  sendOpportunityAlert,
  sendMiningSummary,
  getTrendDb,
  run,
} from "./miningTelegram.js";

const COMMON_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
};

let lastNotifiedOpportunities = new Map();
let scanInterval = null;

// =========================
//  Scrape HeroMiners
// =========================
export async function scrapeHeroMinersGlobal(force = true) {
  try {
    const res = await fetch("https://herominers.com/sitemap.xml", {
      headers: COMMON_HEADERS, signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Hero sitemap: ${res.status}`);
    const xml = await res.text();
    const poolHosts = [...new Set(
      [...xml.matchAll(/https:\/\/([a-z0-9-]+)\.herominers\.com\//gi)]
        .map((m) => m[1]).filter((h) => h && h !== "www" && h !== "herominers")
    )].sort();
    if (poolHosts.length === 0) throw new Error("No pool hosts found");

    const settled = await Promise.allSettled(
      poolHosts.map(async (host) => { // Corrected from `host` to `host`
        const r = await fetch(`https://${host}.herominers.com/api/stats`, {
          headers: COMMON_HEADERS, signal: AbortSignal.timeout(10000),
        });
        if (!r.ok) throw new Error(`${host} ${r.status}`);
        return { host, data: await r.json() };
      })
    );

    const coinStats = [];
    for (const item of settled) {
      if (item.status !== "fulfilled") {
        console.warn(`[mine:hero] A pool fetch failed: ${item.reason?.message}`);
        continue;
      }
      try {
        const { host, data } = item.value;
        const config = data?.config || {};
        const pool = data?.pool || {};
        const algo = String(config.cnAlgorithm || config.algorithm || host).trim();
        const priceBtc = parseFloat(pool.price?.btc ?? pool.price?.BTC ?? 0);
        const miners = parseInt(pool.miners || 0) + parseInt(pool.soloMiners || 0);
        coinStats.push({
          coin: String(config.symbol || host).toUpperCase(),
          host, algorithm: algo,
          normalizedAlgo: normalizeAlgo(algo),
          miners, btcPerDay: priceBtc,
        });
      } catch (err) {
        console.warn(`[mine:hero] Failed to process pool data for ${item.value?.host}: ${err.message}`);
      }
    }
    return { success: true, coinStats };
  } catch (err) {
    console.error("[mine:hero]", err.message);
    return { success: false, error: err.message, coinStats: [] };
  }
}

// =========================
//  Scrape Mining-Dutch
// =========================
export async function scrapeMiningDutchGlobal(force = false) {
  try {
    const res = await fetch("https://www.mining-dutch.nl/", {
      headers: COMMON_HEADERS, signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Dutch: ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);
    const coinStats = [];
    const nowMiningTable = $('h4:contains("Currently Mining")').next("table");
    nowMiningTable.find("tbody > tr").each((i, el) => { // Corrected from `tbody &gt; tr`
      try {
        const tds = $(el).find("td");
        if (tds.length < 5) return; // Corrected from `&lt;`
        const algo = $(tds[0]).text().trim();
        const miners = parseInt($(tds[1]).text().trim(), 10) || 0;
        const btcPerDay = parseFloat($(tds[2]).text().trim().split(" ")[0]) || 0;
        const existing = coinStats.find((c) => c.algorithm === algo);
        if (existing) { 
          existing.btcPerDay = Math.max(existing.btcPerDay, btcPerDay); 
          existing.miners += miners; 
        } else {
          coinStats.push({ 
            algorithm: algo, 
            normalizedAlgo: normalizeAlgo(algo), 
            miners, 
            btcPerDay 
          });
        }
      } catch(err) {
        console.warn(`[mine:dutch] Failed to process a row: ${err.message}`);
      }
    });
    return { success: true, coinStats };
  } catch (err) {
    console.error("[mine:dutch]", err.message);
    return { success: false, error: err.message, coinStats: [] };
  }
}

// =========================
//  Fetch NH and MRR prices from local API
// =========================
async function fetchPrices(algos, type) {
  if (!Array.isArray(algos) || algos.length === 0) return {};
  const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
  const settled = await Promise.allSettled(
    algos.map(async (algo) => { // Corrected from `algo`
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

// =========================
//  Calculate Profitability
// =========================
function calculateProfitability(poolBtc, nhPrice, coinPrices = null) {
  const result = { 
    spreadPct: null, 
    status: "neutral", 
    recommendation: "", 
    profitBtc: 0, 
    profitUsd: 0 
  };
  if (poolBtc > 0 && nhPrice > 0) { // Corrected from `&gt;`
    const spread = ((poolBtc - nhPrice) / nhPrice) * 100;
    result.spreadPct = spread;
    result.profitBtc = poolBtc - nhPrice;
    if (coinPrices?.usd) result.profitUsd = result.profitBtc * coinPrices.usd;
    if (spread > CONFIG.SPREAD_THRESHOLD_PCT) { // Corrected from `&gt;`
      result.status = "profitable"; 
      result.recommendation = "✅ Mine on pool, sell on NiceHash"; 
    } else if (spread < -CONFIG.SPREAD_THRESHOLD_PCT) { // Corrected from `&lt;`
      result.status = "loss"; 
      result.recommendation = "❌ Buy on NiceHash instead"; 
    } else { 
      result.status = "neutral"; 
      result.recommendation = "➖ Break-even"; 
    }
  }
  return result;
}

// =========================
//  Extract Coin Names
// =========================
function extractCoinNames(heroRows, dutchRows) {
  const coinNames = new Set();
  for (const row of heroRows || []) {
    if (row.coin) coinNames.add(row.coin.toUpperCase());
    if (row.subdomain) coinNames.add(row.subdomain.toUpperCase());
    if (row.algorithm) coinNames.add(row.algorithm.toUpperCase());
  }
  for (const row of dutchRows || []) {
    if (row.coin) coinNames.add(row.coin.toUpperCase());
    if (row.algorithm) coinNames.add(row.algorithm.toUpperCase());
  }
  return Array.from(coinNames);
}

// =========================
//  Main Scan Function
// =========================
export async function scanMiningOpportunities(force = false) {
  console.log(`[mine:scan] Scanning...`);

  try {
    await fetchAndSaveCoinPrices(force);
  } catch (err) {
    console.warn('[mine:scan] CoinGecko fetch failed:', err.message);
  }

  await getBtcPrice(); // warm cache

  const [heroRes, dutchRes] = await Promise.all([
    scrapeHeroMinersGlobal(),
    scrapeMiningDutchGlobal(),
  ]);

  const coinNames = extractCoinNames(heroRes?.coinStats, dutchRes?.coinStats);
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
  for (const row of heroRes?.coinStats || []) {
    if (row.normalizedAlgo && row.normalizedAlgo !== "UNKNOWN") algoSet.add(row.normalizedAlgo);
  }
  for (const row of dutchRes?.coinStats || []) {
    if (row.normalizedAlgo && row.normalizedAlgo !== "UNKNOWN") algoSet.add(row.normalizedAlgo);
  }

  const algos = Array.from(algoSet).filter(Boolean);
  if (algos.length === 0) return { success: false, error: "No algos found" };

  const [nhPrices, mrrPrices] = await Promise.all([
    fetchPrices(algos, "nh"),
    fetchPrices(algos, "mrr"),
  ]);

  const heroByAlgo = new Map();
  for (const row of heroRes?.coinStats || []) {
    const k = row.normalizedAlgo;
    if (!heroByAlgo.has(k)) heroByAlgo.set(k, { btcPerDay: 0, miners: 0 });
    const cur = heroByAlgo.get(k);
    cur.btcPerDay = Math.max(cur.btcPerDay, row.btcPerDay);
    cur.miners += row.miners || 0;
  }

  const dutchByAlgo = new Map();
  for (const row of dutchRes?.coinStats || []) {
    const k = row.normalizedAlgo;
    if (!dutchByAlgo.has(k)) dutchByAlgo.set(k, { btcPerDay: 0, miners: 0 });
    const cur = dutchByAlgo.get(k);
    cur.btcPerDay = Math.max(cur.btcPerDay, row.btcPerDay);
    cur.miners += row.miners || 0;
  }

  const opportunities = [];
  const now = new Date();

  for (const algo of algos) {
    const hero = heroByAlgo.get(algo);
    const dutch = dutchByAlgo.get(algo);
    const poolBtc = Math.max(hero?.btcPerDay || 0, dutch?.btcPerDay || 0);
    const nhPrice = nhPrices[algo] || 0;
    const mrrPrice = mrrPrices[algo] || 0;
    const profit = calculateProfitability(poolBtc, nhPrice, null);
    const spread = profit.spreadPct;

    opportunities.push({
      algo,
      label: getAlgorithmDisplayName(algo),
      poolBtcPerDay: poolBtc,
      nhPriceBtc: nhPrice,
      mrrPriceBtc: mrrPrice,
      spreadPct: spread,
      profitStatus: profit.status,
      recommendation: profit.recommendation,
      poolMiners: Math.max(hero?.miners || 0, dutch?.miners || 0),
      source: poolBtc > 0 ? (dutch?.btcPerDay > hero?.btcPerDay ? "Mining-Dutch" : "HeroMiners") : "N/A", // Corrected from `&gt;`
    });
  }

  opportunities.sort((a, b) => (b.spreadPct ?? -Infinity) - (a.spreadPct ?? -Infinity)); // Corrected from `&gt;`

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

    if (opp.spreadPct !== null && opp.spreadPct >= CONFIG.SPREAD_THRESHOLD_PCT && opp.poolBtcPerDay > 0) { // Corrected from `&gt;`
      const lastNotified = lastNotifiedOpportunities.get(opp.algo) || 0;
      if (Date.now() - lastNotified > CONFIG.MIN_NOTIFY_INTERVAL_MS || force) { // Corrected from `&gt;`
        lastNotifiedOpportunities.set(opp.algo, Date.now());
        notifyMessages.push(opp);
      }
    }
  }

  if (notifyMessages.length > 0) { // Corrected from `&gt;`
    for (const opp of notifyMessages) {
      await sendOpportunityAlert(opp);
    }
  }

  const profitable = opportunities.filter((o) => o.profitStatus === "profitable"); // Corrected from `=&gt;`
  if (profitable.length > 0) { // Corrected from `&gt;`
    await sendMiningSummary(profitable.slice(0, 10));
  }

  const positiveCount = opportunities.filter(o => (o.spreadPct ?? 0) > 0).length; // Corrected from `&gt;`

  return { 
    success: true, 
    scannedAt: capturedAt, 
    totalAlgos: algos.length, 
    opportunities: opportunities.slice(0, 20), 
    notificationsSent: notifyMessages.length, 
    positiveCount 
  };
}

// =========================
//  API Route Handlers
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

// =========================
//  Scanner Control
// =========================
export function startMiningOpportunityScanner() {
  if (scanInterval) {
    console.log("[mine:scan] Scanner already running");
    return;
  }
  console.log("[mine:scan] Starting scanner (every 15 min)");

  // Initial scan
  scanMiningOpportunities(true).catch((err) => { // Corrected from `=&gt;`
    console.error("[mine:scan] Initial scan failed:", err.message);
  });

  scanInterval = setInterval(() => { // Corrected from `=&gt;`
    scanMiningOpportunities(false).catch((err) => {
      console.error("[mine:scan] Scheduled scan failed:", err.message);
    });
  }, 15 * 60 * 1000);
}

export function stopMiningOpportunityScanner() {
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
    console.log("[mine:scan] Scanner stopped");
  }
}
