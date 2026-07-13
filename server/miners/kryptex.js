// server/miners/kryptex.js - Kryptex pool proxy (API → HTML scrape → INITIAL_STATE fallback)
import { COMMON_HEADERS, CONFIG } from "../config.js";

const CACHE = new Map();
const CACHE_TTL = 30000;

const VALID_COINS = ['etc', 'xmr', 'cfx', 'ergo', 'rvn', 'beam', 'flux', 'alephium'];

/**
 * Fetch miner stats from Kryptex pool
 * Tries: API endpoint → __NEXT_DATA__ scrape → __INITIAL_STATE__ → HTML scrape
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

  const coinLower = coin.toLowerCase();
  if (!VALID_COINS.includes(coinLower)) {
    throw new Error(`Unsupported coin '${coin}'. Supported: ${VALID_COINS.join(', ')}`);
  }

  try {
    // ── Attempt 1: Scrape the HTML page (Nuxt 3 SSR or Next.js) ──
    const url = `https://pool.kryptex.com/${coinLower}/miner/stats/${encodeURIComponent(address)}`;
    const response = await fetch(url, {
      headers: { ...COMMON_HEADERS, Accept: "text/html" },
      signal: AbortSignal.timeout(15000),
    });

    if (response.redirected) {
      throw new Error(`Coin '${coin}' or address not found on Kryptex. The pool may have delisted this coin.`);
    }

    if (response.status === 404) {
      throw new Error(`Address not found on Kryptex ${coin.toUpperCase()} pool`);
    }

    if (!response.ok) {
      throw new Error(`Kryptex returned HTTP ${response.status}`);
    }

    const html = await response.text();

    // ── Attempt 2a: __NEXT_DATA__ (Next.js SSR) ──
    let minerData = null;
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (nextDataMatch && nextDataMatch[1]) {
      try {
        const pageData = JSON.parse(nextDataMatch[1]);
        minerData = pageData?.props?.pageProps?.minerData;
        if (minerData) {
          const result = formatKryptexResponse(minerData, coinLower, address);
          CACHE.set(cacheKey, { data: result, timestamp: Date.now() });
          return result;
        }
        if (pageData?.props?.pageProps?.error) {
          throw new Error(`Kryptex error: ${pageData.props.pageProps.error.message || 'Unknown error'}`);
        }
      } catch (e) {
        if (e.message.startsWith('Kryptex error:')) throw e;
        console.warn(`[Kryptex] Failed to parse __NEXT_DATA__ for ${coinLower}/${address}:`, e.message);
      }
    }

    // ── Attempt 2b: __NUXT_DATA__ (Nuxt 3 SSR — no type attr, uses data-nuxt-data) ──
    if (!minerData) {
      const nuxtMatch = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (nuxtMatch && nuxtMatch[1]) {
        try {
          minerData = parseNuxtPayload(nuxtMatch[1], coinLower, address);
          if (minerData) {
            const result = formatKryptexResponse(minerData, coinLower, address);
            CACHE.set(cacheKey, { data: result, timestamp: Date.now() });
            return result;
          }
        } catch (e) {
          console.warn(`[Kryptex] Failed to parse __NUXT_DATA__ for ${coinLower}/${address}:`, e.message);
        }
      }
    }

    // ── Attempt 2b: window.__INITIAL_STATE__ ──
    const initStateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/);
    if (initStateMatch && initStateMatch[1]) {
      try {
        const initData = JSON.parse(initStateMatch[1]);
        minerData = initData?.minerData;
        if (minerData) {
          const result = formatKryptexResponse(minerData, coinLower, address);
          CACHE.set(cacheKey, { data: result, timestamp: Date.now() });
          return result;
        }
      } catch (e) {
        console.warn(`[Kryptex] Failed to parse __INITIAL_STATE__ for ${coinLower}/${address}:`, e.message);
      }
    }

    // ── Attempt 2c: Traditional HTML scrape (last resort) ──
    console.warn(`[Kryptex] All structured data methods failed for ${coinLower}/${address}. Falling back to HTML scraping.`);
    const { load } = await import("cheerio");
    const $ = load(html);

    const getStat = (label) => $(`.miner-stats__item:contains("${label}") .miner-stats__value`).first().text().trim() || null;

    const workersText = getStat('Workers online');
    const workersOnline = workersText ? parseInt(workersText.split('/')[0] || '0', 10) : 0;
    const workersTotal = workersText ? parseInt(workersText.split('/')[1] || '0', 10) : workersOnline;

    const scrapedData = {
      workersOnline,
      workersOffline: workersTotal - workersOnline,
      workersTotal,
      hashrate: getStat('Current hashrate') || '0 H/s',
      hashrate30m: getStat('30m average') || '0 H/s',
      hashrate3h: getStat('3h average') || '0 H/s',
      hashrate24h: getStat('24h average') || '0 H/s',
      balance: parseFloat(getStat('Unpaid balance')) || 0,
      immature: parseFloat(getStat('Immature')) || 0,
      paid: parseFloat(getStat('Total paid')) || 0,
      reward7d: parseFloat(getStat('7d reward')) || 0,
      reward30d: parseFloat(getStat('30d reward')) || 0,
      workers: [],
    };

    $('div[class^="worker-table_row"]').each((i, el) => {
      scrapedData.workers.push({
        name: $(el).find('div[class*="worker-table_name"]').text().trim(),
        mode: 'N/A',
        hashrate30m: $(el).find('div[class*="worker-table_hashrate"]').eq(0).text().trim() || '0 H/s',
        hashrate24h: $(el).find('div[class*="worker-table_hashrate"]').eq(1).text().trim() || '0 H/s',
        shares24h: parseInt($(el).find('div[class*="worker-table_shares"]').text().trim().replace(/,/g, ''), 10) || 0,
        staleShares: 0,
        invalidShares: 0,
      });
    });

    // Only use scraped data if it looks valid
    if (scrapedData.hashrate !== '0 H/s' || scrapedData.balance > 0 || scrapedData.workers.length > 0 || scrapedData.workersTotal > 0) {
      const result = formatKryptexResponse(scrapedData, coinLower, address);
      CACHE.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    }

    throw new Error('Could not find miner data on page. The address may be invalid or the coin has been delisted.');
  } catch (err) {
    console.error(`[Kryptex] Fetch failed for ${coin}/${address}:`, err.message);
    throw err;
  }
}

/**
 * Format Kryptex response into unified structure
 */
function formatKryptexResponse(data, coin, address) {
  // If it's already in our format, return as-is
  if (data.success && data.stats) {
    return data;
  }

  // Handle API response shape: { data: { miner: { ... } } }
  if (data.data?.miner) {
    const miner = data.data.miner;
    return {
      success: true,
      coin: coin.toUpperCase(),
      address,
      stats: {
        workers: {
          online: miner.workersOnline || 0,
          offline: miner.workersOffline || 0,
          total: miner.workersTotal || 0,
        },
        hashrate: {
          current: miner.hashrate || '0 H/s',
          '30min': miner.hashrate30m || '0 H/s',
          '3h': miner.hashrate3h || '0 H/s',
          '24h': miner.hashrate24h || '0 H/s',
        },
        balance: {
          unpaid: miner.balance || 0,
          immature: miner.immature || 0,
          totalPaid: miner.paid || 0,
          reward7d: miner.reward7d || 0,
          reward30d: miner.reward30d || 0,
        },
        workerTable: (miner.workers || []).map(w => ({
          name: w.name,
          mode: w.mode || 'N/A',
          hashrate30m: w.hashrate30m || '0 H/s',
          hashrate24h: w.hashrate24h || '0 H/s',
          valid: String(w.shares24h || '0'),
          stale: String(w.staleShares || '0'),
          invalid: String(w.invalidShares || '0'),
        })),
      },
      raw: miner,
      fetchedAt: new Date().toISOString(),
    };
  }

  // Handle direct miner data object (HTML scrape / INITIAL_STATE)
  return {
    success: true,
    coin: coin.toUpperCase(),
    address,
    stats: {
      workers: {
        online: data.workersOnline || 0,
        offline: data.workersOffline || 0,
        total: data.workersTotal || 0,
      },
      hashrate: {
        current: data.hashrate || '0 H/s',
        '30min': data.hashrate30m || '0 H/s',
        '3h': data.hashrate3h || '0 H/s',
        '24h': data.hashrate24h || '0 H/s',
      },
      balance: {
        unpaid: data.balance || 0,
        immature: data.immature || 0,
        totalPaid: data.paid || 0,
        reward7d: data.reward7d || 0,
        reward30d: data.reward30d || 0,
      },
      workerTable: (data.workers || []).map(w => ({
        name: w.name,
        mode: w.mode || 'N/A',
        hashrate30m: w.hashrate30m || '0 H/s',
        hashrate24h: w.hashrate24h || '0 H/s',
        valid: String(w.shares24h || '0'),
        stale: String(w.staleShares || '0'),
        invalid: String(w.invalidShares || '0'),
      })),
    },
    raw: data,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Parse Nuxt 3 __NUXT_DATA__ payload into miner data object.
 * Nuxt 3 serializes SSR data as a compact array with numeric references.
 * Integer values < array length are reference indices to other array entries.
 */
function parseNuxtPayload(rawJson, coin, address) {
  const data = JSON.parse(rawJson);
  if (!Array.isArray(data)) return null;

  const len = data.length;

  /**
   * Resolve a Nuxt reference: if val is an integer < len, follow it
   */
  function resolve(val) {
    if (typeof val === 'number' && Number.isInteger(val) && val >= 0 && val < len) {
      const target = data[val];
      if (Array.isArray(target) && target.length === 2 && typeof target[0] === 'string' && target[0].endsWith('eactive')) {
        return resolve(target[1]);
      }
      if (target !== undefined && target !== null) return target;
    }
    return val;
  }

  // Search for the miner results object
  for (let i = 0; i < len; i++) {
    const item = data[i];
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const resolved = {};
      for (const [k, v] of Object.entries(item)) {
        resolved[k] = resolve(v);
      }
      // Check if this looks like a miner result with hashrate data
      if (resolved.avg_hashrate_24h !== undefined && resolved.avg_hashrate_30m !== undefined) {
        // Found it — extract what we need
        const minerResult = resolved;
        
        // Resolve worker/miner references
        let workerName = 'worker';
        let minerAddress = address;
        
        if (typeof minerResult.miner === 'string') {
          minerAddress = minerResult.miner;
        }
        if (typeof minerResult.worker === 'string') {
          workerName = minerResult.worker;
        }
        
        const validShares = parseInt(resolve(minerResult.valid)) || 0;
        const staleShares = parseInt(resolve(minerResult.stale)) || 0;
        const invalidShares = parseInt(resolve(minerResult.invalid)) || 0;
        
        const avg24h = parseFloat(resolve(minerResult.avg_hashrate_24h)) || 0;
        const avg3h = parseFloat(resolve(minerResult.avg_hashrate_3h)) || 0;
        const avg30m = parseFloat(resolve(minerResult.avg_hashrate_30m)) || 0;
        
        // Build formatted hashrates
        const fmt = (h) => {
          if (h >= 1e12) return (h / 1e12).toFixed(2) + ' TH/s';
          if (h >= 1e9) return (h / 1e9).toFixed(2) + ' GH/s';
          if (h >= 1e6) return (h / 1e6).toFixed(2) + ' MH/s';
          if (h >= 1e3) return (h / 1e3).toFixed(2) + ' KH/s';
          return h.toFixed(2) + ' H/s';
        };

        return {
          workersOnline: 1,
          workersOffline: 0,
          workersTotal: 1,
          hashrate: fmt(avg24h),
          hashrate30m: fmt(avg30m),
          hashrate3h: fmt(avg3h),
          hashrate24h: fmt(avg24h),
          balance: 0, // Will be populated below from the rewards
          immature: 0,
          paid: 0,
          reward7d: 0,
          reward30d: 0,
          workers: [{
            name: workerName,
            mode: resolve(minerResult.scheme) || 'pps',
            hashrate30m: fmt(avg30m),
            hashrate24h: fmt(avg24h),
            shares24h: validShares,
            staleShares: staleShares,
            invalidShares: invalidShares,
          }],
        };
      }
    }
  }

  // Fallback: search entire array for balance/reward data
  let unpaidBalance = 0;
  let rewardWeek = 0;
  let rewardMonth = 0;

  for (let i = 0; i < len; i++) {
    const item = data[i];
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const resolved = {};
      for (const [k, v] of Object.entries(item)) {
        resolved[k] = resolve(v);
      }
      if (resolved.reward !== undefined && typeof resolved.reward === 'object') {
        rewardWeek = parseFloat(resolve(resolved.reward.week)) || 0;
        rewardMonth = parseFloat(resolve(resolved.reward.month)) || 0;
      }
      if (resolved.unpaid !== undefined) {
        unpaidBalance = parseFloat(resolve(resolved.unpaid)) || 0;
      }
      if (resolved.confirmed !== undefined && resolved.unpaid !== undefined) {
        unpaidBalance = parseFloat(resolve(resolved.unpaid)) || 0;
      }
    }
  }

  if (unpaidBalance > 0 || rewardWeek > 0) {
    return {
      workersOnline: 0,
      workersOffline: 0,
      workersTotal: 0,
      hashrate: '0 H/s',
      hashrate30m: '0 H/s',
      hashrate3h: '0 H/s',
      hashrate24h: '0 H/s',
      balance: unpaidBalance,
      immature: 0,
      paid: 0,
      reward7d: rewardWeek,
      reward30d: rewardMonth || rewardWeek,
      workers: [],
    };
  }

  return null;
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

  const coinLower = coin.toLowerCase();
  if (!VALID_COINS.includes(coinLower)) {
    throw new Error(`Unsupported coin '${coin}'`);
  }

  try {
    const url = `https://pool.kryptex.com/${coinLower}`;
    const response = await fetch(url, {
      headers: { ...COMMON_HEADERS, Accept: "text/html" },
      signal: AbortSignal.timeout(15000),
    });

    if (response.redirected) {
      throw new Error(`Coin '${coin}' not found on Kryptex.`);
    }

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();
    const { load } = await import("cheerio");
    const $ = load(html);

    const hashrate = $('.stat-item:contains("Hashrate") .stat-value').first().text().trim() || "0";
    const minersText = $('.stat-item:contains("Miners") .stat-value').first().text().trim() || "0";
    const workersText = $('.stat-item:contains("Workers") .stat-value').first().text().trim() || "0";

    const result = {
      success: true,
      coin: coin.toUpperCase(),
      stats: { hashrate, miners: parseInt(minersText) || 0, workers: parseInt(workersText) || 0 },
      fetchedAt: new Date().toISOString(),
    };
    CACHE.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  } catch (err) {
    console.error(`[Kryptex] Global fetch failed for ${coin}:`, err.message);
    throw err;
  }
}
