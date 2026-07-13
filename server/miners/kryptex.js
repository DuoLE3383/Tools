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
    
    // Modern websites often embed data in a script tag. This is more reliable than scraping.
    const nextDataScript = html.substring(html.indexOf('<script id="__NEXT_DATA__" type="application/json">') + 58);
    const nextDataJson = nextDataScript.substring(0, nextDataScript.indexOf('</script>'));

    if (!nextDataJson) {
      throw new Error('Could not find __NEXT_DATA__ script tag. Kryptex page structure may have changed.');
    }

    const pageData = JSON.parse(nextDataJson);
    const minerData = pageData?.props?.pageProps?.minerData;

    if (!minerData) {
      // This can happen if the address is invalid, Kryptex returns a page without minerData.
      if (pageData?.props?.pageProps?.error) {
        throw new Error(`Kryptex error: ${pageData.props.pageProps.error.message}`);
      }
      throw new Error('Could not find minerData in page data. The address might be invalid.');
    }

    const result = {
      success: true,
      coin: coin.toUpperCase(),
      address,
      stats: {
        workers: {
          online: minerData.workersOnline || 0,
          offline: minerData.workersOffline || 0,
          total: minerData.workersTotal || 0,
        },
        hashrate: {
          current: minerData.hashrate || '0 H/s',
          '30min': minerData.hashrate30m || '0 H/s',
          '3h': minerData.hashrate3h || '0 H/s',
          '24h': minerData.hashrate24h || '0 H/s',
        },
        balance: {
          unpaid: minerData.balance || 0,
          immature: minerData.immature || 0,
          totalPaid: minerData.paid || 0,
          reward7d: minerData.reward7d || 0,
          reward30d: minerData.reward30d || 0,
        },
        workerTable: (minerData.workers || []).map(w => ({
          name: w.name,
          mode: 'N/A', // Not available in new structure
          hashrate30m: w.hashrate30m || '0 H/s',
          hashrate24h: w.hashrate24h || '0 H/s',
          valid: String(w.shares24h || '0'), // shares24h is the closest to "valid shares"
          stale: '0', // Not available
          invalid: '0', // Not available
        })),
      },
      raw: minerData,
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
