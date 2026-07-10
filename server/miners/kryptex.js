// server/miners/kryptex.js - Kryptex pool proxy (HTML scrape + fallback)
import { COMMON_HEADERS, CONFIG } from "../config.js";

const CACHE = new Map();
const CACHE_TTL = 30000;

/**
 * Fetch miner stats from Kryptex pool by scraping the HTML page
 */
export async function getKryptexMinerStats(coin, address) {
  const cacheKey = `kryptex:${coin}:${address}`;
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  if (!coin || !address) {
    throw new Error("coin and address are required");
  }

  try {
    const url = `https://pool.kryptex.com/${coin}/miner/stats/${encodeURIComponent(address)}`;
    const response = await fetch(url, {
      headers: { ...COMMON_HEADERS, Accept: "text/html" },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`Kryptex returned HTTP ${response.status}`);
    }

    const html = await response.text();
    const { load } = await import("cheerio");
    const $ = load(html);

    // Parse miner stats from HTML
    const workersTotal = parseInt($('.stat-value:contains("Workers")').parent().find('.stat-value').text().trim()) || 0;
    
    // Extract hashrate values
    const hashrates = {};
    $('.stat-item').each((i, el) => {
      const label = $(el).find('.stat-label').text().trim().toLowerCase();
      const value = $(el).find('.stat-value').text().trim();
      if (label.includes('hashrate')) {
        if (label.includes('30min') || label.includes('30 min')) hashrates['30min'] = value;
        else if (label.includes('3h') || label.includes('3 hour')) hashrates['3h'] = value;
        else if (label.includes('24h') || label.includes('24 hour')) hashrates['24h'] = value;
      }
    });

    // Extract balance
    const unpaidMatch = html.match(/Unpaid\s*([\d.]+)\s*(\w+)/i);
    const totalPaidMatch = html.match(/Total\s*Paid\s*([\d.]+)\s*(\w+)/i);
    const reward7dMatch = html.match(/Reward\s*\(7 days?\)\s*([\d.]+)\s*(\w+)/i);

    // Extract worker table data
    const workerRows = [];
    $('table.workers tbody tr, table tbody tr').each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 4) {
        workerRows.push({
          name: $(cells[0]).text().trim(),
          mode: $(cells[1]).text().trim(),
          hashrate30m: $(cells[2]).text().trim(),
          hashrate24h: $(cells[3]).text().trim(),
          valid: $(cells[4]).text().trim() || "0",
          stale: $(cells[5]).text().trim() || "0",
          invalid: $(cells[6]).text().trim() || "0",
        });
      }
    });

    const workerStats = {
      online: $('.stat-value:contains("Online")').text().trim(),
      offline: $('.stat-value:contains("Offline")').text().trim(),
      total: workersTotal,
    };

    const result = {
      success: true,
      coin: coin.toUpperCase(),
      address,
      stats: {
        workers: workerStats,
        hashrate: hashrates,
        balance: {
          unpaid: unpaidMatch ? parseFloat(unpaidMatch[1]) : 0,
          totalPaid: totalPaidMatch ? parseFloat(totalPaidMatch[1]) : 0,
          reward7d: reward7dMatch ? parseFloat(reward7dMatch[1]) : 0,
        },
        workerTable: workerRows,
      },
      raw: { workersTotal, hashrates },
      fetchedAt: new Date().toISOString(),
    };

    CACHE.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  } catch (err) {
    console.error(`[Kryptex] Fetch failed for ${coin}/${address}:`, err.message);
    throw err;
  }
}

/**
 * Fetch global pool stats from Kryptex
 */
export async function getKryptexGlobalStats(coin) {
  const cacheKey = `kryptex_global_${coin}`;
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL * 2) {
    return cached.data;
  }

  try {
    const url = `https://pool.kryptex.com/${coin}`;
    const response = await fetch(url, {
      headers: { ...COMMON_HEADERS, Accept: "text/html" },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();
    const { load } = await import("cheerio");
    const $ = load(html);

    const hashrate = $('.stat-item:contains("Hashrate") .stat-value').first().text().trim() || "0";
    const minersText = $('.stat-item:contains("Miners") .stat-value').first().text().trim() || "0";
    const workersText = $('.stat-item:contains("Workers") .stat-value').first().text().trim() || "0";

    return {
      success: true,
      coin: coin.toUpperCase(),
      stats: { hashrate, miners: parseInt(minersText) || 0, workers: parseInt(workersText) || 0 },
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error(`[Kryptex] Global fetch failed for ${coin}:`, err.message);
    throw err;
  }
}
