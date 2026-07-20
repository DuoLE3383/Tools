// server/miners/qrl-profit-monitor.js
// Monitors QRL HeroMiners estimate mining profits vs NiceHash RANDOMXMONERO order price
// Sends Telegram notification if profit > 6%

import { sendTelegramInternal } from '../monitor.js';

const NH_MARKETS = {
  0: 'EU',
  1: 'USA'
};

const CACHE_TTL = 300_000; // 5 min cache
const cache = new Map();

/**
 * Fetch the highest buy price for an algorithm from NiceHash order book.
 * The buy side shows what buyers are willing to pay (the "order price").
 * Data is nested in stats.BTC.orders (both buy and sell combined).
 * We take orders that are buying (highest prices) as the "sell to" price.
 */
async function getNhOrderPrice(algorithm, marketId = 0) {
  try {
    const res = await fetch(
      `https://api2.nicehash.com/main/api/v2/hashpower/orderBook?algorithm=${algorithm}&market=${marketId}`,
      { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } }
    );
    if (!res.ok) return 0;
    const data = await res.json();
    // Orders are in stats.BTC.orders - these are ALL active orders (both buy & sell)
    const orders = data?.stats?.BTC?.orders || [];
    if (!orders.length) return 0;
    // Take the highest price as the "buy" price (what you can sell to)
    const prices = orders.map(o => parseFloat(o.price)).filter(p => p > 0);
    return prices.length ? Math.max(...prices) : 0;
  } catch {
    return 0;
  }
}

/**
 * Fetch QRL HeroMiners "Estimate Mining Profits" and compare with NiceHash
 * 
 * Returns the same format as the HeroMiners page:
 * - Daily: X QRL, Y USD, Z BTC per GH/s
 * - Profit % vs NiceHash RANDOMXMONERO order price
 */
export async function getQrlProfitEstimate() {
  const cacheKey = 'qrl_profit_estimate';
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data;
  }

  try {
    // 1. Fetch QRL pool stats from HeroMiners API
    const heroRes = await fetch('https://qrl.herominers.com/api/stats', {
      signal: AbortSignal.timeout(10000)
    });
    if (!heroRes.ok) throw new Error(`HeroMiners API returned ${heroRes.status}`);
    const d = await heroRes.json();

    const btcPerQRL = parseFloat(d.pool.price.btc);
    const usdPerQRL = parseFloat(d.pool.price.usd);
    const coinUnits = 1_000_000_000;
    const poolQRLDay = parseInt(d.pool.daily_earnings[0]) / coinUnits;
    const poolHashH = d.pool.hashrate;
    const poolHashGH = poolHashH / 1e9; // convert H/s → GH/s

    if (!poolHashGH || poolHashGH <= 0) throw new Error('Pool hashrate is zero');
    if (!btcPerQRL || btcPerQRL <= 0) throw new Error('QRL price is zero');

    // Estimate per 1 GH/s (standard unit for RandomX on NiceHash)
    const qrlPerGH = poolQRLDay / poolHashGH;
    const usdPerGH = qrlPerGH * usdPerQRL;
    const btcPerGH = qrlPerGH * btcPerQRL;

    // 2. Fetch NH RANDOMXMONERO sell price (try both markets, take lowest)
    let nhBtcPerGH = 0;
    for (const marketId of Object.keys(NH_MARKETS)) {
      const p = await getNhOrderPrice('RANDOMXMONERO', parseInt(marketId));
      if (p > 0) {
        nhBtcPerGH = p;
        break;
      }
    }

    // 3. Compute profit %
    let profitPct = 0;
    if (nhBtcPerGH > 0) {
      profitPct = ((btcPerGH - nhBtcPerGH) / nhBtcPerGH) * 100;
    }

    const nhQRLperGH = nhBtcPerGH > 0 ? nhBtcPerGH / btcPerQRL : 0;
    const nhUsdPerGH = nhQRLperGH * usdPerQRL;

    const result = {
      success: true,
      fetchedAt: new Date().toISOString(),
      estimate: {
        inputUnit: '1 GH/s',
        qrl: qrlPerGH,
        usd: usdPerGH,
        btc: btcPerGH,
      },
      nicehash: {
        nhPrice: nhBtcPerGH,
        nhUnit: 'BTC/GH/day',
        nhQRL: nhQRLperGH,
        nhUsd: nhUsdPerGH,
      },
      profit: {
        pct: profitPct,
        aboveThreshold: profitPct > 6,
        threshold: 6,
      },
      metadata: {
        btcPerQRL,
        usdPerQRL,
        poolQRLDay,
        poolHashGH,
        market: NH_MARKETS,
      }
    };

    cache.set(cacheKey, { data: result, ts: Date.now() });
    return result;

  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Format profit estimate data into a Telegram HTML message
 */
export function formatProfitAlert(data) {
  const e = data.estimate;
  const nh = data.nicehash;
  const p = data.profit;

  const emoji = p.aboveThreshold ? '🔥' : '⚡';
  const status = p.aboveThreshold
    ? `✅ Mining QRL is <b>${p.pct.toFixed(1)}%</b> more profitable than renting RandomX on NiceHash`
    : `Profit is ${p.pct.toFixed(1)}% (below 6% threshold)`;

  return `<b>${emoji} Mining Revenue</b>
━━━━━━━━━━━━━━━━━━━━━━

<b>Estimate Mining Profits</b>
<b>1</b>
<b>Daily</b>\t<b>${e.qrl.toFixed(4)} QRL</b>\t<b>$${e.usd.toFixed(2)}</b>\t<b>${e.btc.toFixed(6)} BTC</b>

━━━━━━━━━━━━━━━━━━━━━━
<b>NiceHash RANDOMXMONERO</b>
Order price: <b>${nh.nhPrice.toFixed(8)} BTC/GH/day</b>
＝ ${nh.nhQRL.toFixed(4)} QRL/GH/day ＝ $${nh.nhUsd.toFixed(2)}/day

━━━━━━━━━━━━━━━━━━━━━━
<b>Profit: ${p.pct.toFixed(2)}%</b> (threshold: ${p.threshold}%)
${status}

⏱ ${new Date().toLocaleString()}`;
}

/**
 * Check QRL profit and send Telegram Mining Revenue report
 * Sends every scan interval regardless of threshold
 */
export async function checkAndNotifyQrlProfit() {
  const data = await getQrlProfitEstimate();
  if (!data.success) {
    console.error(`[QRL Monitor] Failed: ${data.error}`);
    return { notified: false, error: data.error };
  }

  console.log(`[QRL Monitor] Profit: ${data.profit.pct.toFixed(2)}% (threshold: 6%)`);

  try {
    const msg = formatProfitAlert(data);
    await sendTelegramInternal(msg, 'MINE_BOT');
    console.log(`[QRL Monitor] ✅ Mining Revenue sent to Telegram`);
    return { notified: true, profit: data.profit.pct };
  } catch (e) {
    console.error(`[QRL Monitor] Failed to send Telegram: ${e.message}`);
    return { notified: false, error: e.message };
  }
}

/**
 * Start periodic QRL profit monitor
 */
let monitorInterval = null;

export function startQrlProfitMonitor(intervalMs = 10 * 60 * 1000) {
  if (monitorInterval) return;

  console.log(`[QRL Monitor] Starting (interval: ${intervalMs / 1000}s)`);

  // Run immediately on start
  checkAndNotifyQrlProfit();

  // Then run periodically
  monitorInterval = setInterval(() => {
    checkAndNotifyQrlProfit();
  }, intervalMs);
}

export function stopQrlProfitMonitor() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    console.log('[QRL Monitor] Stopped');
  }
}
