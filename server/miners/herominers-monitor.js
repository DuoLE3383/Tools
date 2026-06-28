// server/miners/herominers-monitor.js
import { HeroMinersAPI } from './herominers-api.js';
import { parseHeroMinersResponse } from './herominers-parser.js';

const MONITOR_INTERVAL = 5 * 60 * 1000; // 5 minutes
const ADDRESSES = process.env.HEROMINERS_ADDRESSES ? 
  JSON.parse(process.env.HEROMINERS_ADDRESSES) : 
  [];

let isRunning = false;
let monitorInterval = null;

/**
 * Start HeroMiners monitor
 */
export function startHeroMinersMonitor() {
  if (isRunning) {
    console.log('[HeroMiners Monitor] Already running');
    return;
  }

  if (ADDRESSES.length === 0) {
    console.log('[HeroMiners Monitor] No addresses configured, skipping');
    return;
  }

  isRunning = true;
  console.log(`[HeroMiners Monitor] Monitoring ${ADDRESSES.length} addresses`);

  // Run immediately
  checkAllAddresses();

  // Set interval
  monitorInterval = setInterval(checkAllAddresses, MONITOR_INTERVAL);
}

/**
 * Stop HeroMiners monitor
 */
export function stopHeroMinersMonitor() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
  isRunning = false;
  console.log('[HeroMiners Monitor] Stopped');
}

/**
 * Check all configured addresses
 */
async function checkAllAddresses() {
  for (const config of ADDRESSES) {
    try {
      await checkAddress(config);
    } catch (error) {
      console.error(`[HeroMiners Monitor] Error checking ${config.address}:`, error.message);
    }
  }
}

/**
 * Check a single address
 */
async function checkAddress(config) {
  const { address, coin = 'ZEPH', threshold = 0, webhook } = config;

  try {
    const api = new HeroMinersAPI({
      timeout: 15000
    });

    const response = await api.getMinerStats(address, coin);
    const parsed = parseHeroMinersResponse(response, address, coin);

    if (!parsed) {
      console.log(`[HeroMiners Monitor] No data for ${address}`);
      return;
    }

    // Log summary
    console.log(`[HeroMiners Monitor] ${address}: ${parsed.currentHashrateFormatted} | ${parsed.pendingBalance} ${coin} | Blocks: ${parsed.blocksFound}`);

    // Check thresholds
    if (threshold > 0 && parsed.pendingBalance >= threshold) {
      console.log(`[HeroMiners Monitor] ⚠️ ${address} reached threshold: ${parsed.pendingBalance} ${coin}`);
      
      // Send webhook notification if configured
      if (webhook) {
        await sendWebhookNotification(webhook, parsed, config);
      }
    }

    // Save to database or cache
    await saveMinerStats(address, coin, parsed);

  } catch (error) {
    console.error(`[HeroMiners Monitor] Failed for ${address}:`, error.message);
  }
}

/**
 * Send webhook notification
 */
async function sendWebhookNotification(webhook, data, config) {
  try {
    const payload = {
      type: 'herominers_threshold',
      address: config.address,
      coin: config.coin,
      pendingBalance: data.pendingBalance,
      totalPaid: data.totalPaid,
      hashrate: data.currentHashrateFormatted,
      blocksFound: data.blocksFound,
      timestamp: new Date().toISOString()
    };

    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status}`);
    }

    console.log(`[HeroMiners Monitor] Webhook sent for ${config.address}`);
  } catch (error) {
    console.error(`[HeroMiners Monitor] Webhook failed:`, error.message);
  }
}

/**
 * Save miner stats to database
 */
async function saveMinerStats(address, coin, data) {
  // Implement database storage
  // This is a placeholder - implement based on your DB setup
  try {
    // Example: save to file or database
    // const stats = { address, coin, data, timestamp: Date.now() };
    // await db.collection('herominers_stats').updateOne(
    //   { address, coin },
    //   { $set: stats },
    //   { upsert: true }
    // );
  } catch (error) {
    console.error('[HeroMiners Monitor] Failed to save stats:', error.message);
  }
}

// Cleanup on module unload
process.on('exit', () => {
  stopHeroMinersMonitor();
});