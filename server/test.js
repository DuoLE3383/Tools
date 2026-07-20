import { db } from './db.js';
import { mrrApiCall, mrrConfigs } from './mrr.js';
import { resolveNhClient, getNiceHashApp, isAggregate, nhConfigs } from './nh.js';
import { extractRigInfo } from './utils.js';
import { TELEGRAM_CONFIG, TelegramTemplates } from '../src/core/telegram.js';
import { 
  ALGO_DISPLAY_NAMES, 
  HASHRATE_SUFFIXES, 
  normalizeAlgoForNiceHash, 
  getMrrAlgorithmUnit, 
  calculatePriceComparison 
} from '../src/core/mapping.js';
import { getBtcPriceData } from '../src/core/priceUtils.js';
import { processRental, isRealRental } from './rentalProcessor.js';  // ✅ import from rentalProcessor
import { sendTelegramInternal } from './helpers.js';

// ... (other helpers can stay if still needed for summary, etc.)

export async function runRentalMonitor(forceNotify = false, clientScope = 'ALL') {
  if (isMonitorRunning) {
    console.log(`[Monitor] Already running, skipping...`);
    return { notifications: [], summary: { error: 'Monitor already running' } };
  }
  isMonitorRunning = true;

  try {
    const requestedScope = String(clientScope || 'ALL').trim().toUpperCase();
    const allConfiguredAccts = Object.keys(mrrConfigs).filter(
      k => mrrConfigs[k].apiKey && mrrConfigs[k].apiSecret
    );

    const mrrAccts = (requestedScope === 'ALL' || requestedScope === 'VN' || isAggregate(requestedScope))
      ? allConfiguredAccts
      : allConfiguredAccts.filter(acct => requestedScope.split(',').map(s => s.trim()).includes(acct));

    const now = Date.now();
    const notifications = [];
    const activeRentalLines = [];
    const accountMetrics = [];
    const successfulAccts = [];

    // Database init (keep as is)
    await db.runAsync(`CREATE TABLE IF NOT EXISTS rentals (...)`, ...);

    console.log(`[${new Date().toLocaleTimeString()}] Starting check for ${mrrAccts.length} accounts...`);

    for (const acct of mrrAccts) {
      const metric = { name: acct, total: 0, online: 0, rented: 0, offline: 0, disabled: 0, warning: 0, error: false };

      try {
        // 1. Fetch only active rentals (if API supports) – falls back to normal if not
        const rentalRes = await mrrApiCall({
          endpoint: '/rental',
          query: { type: 'bought', active: 1 },  // ✅ try adding active param
          clientNameRaw: acct
        });

        // If the API doesn't support active filtering, fall back to fetching all and filter manually
        let rentalsToProcess = [];
        if (rentalRes.statusCode === 200 && rentalRes.data?.success) {
          rentalsToProcess = extractArray(rentalRes.data);
          // Optional: double‑check with isRealRental to catch any non‑active that still came through
          rentalsToProcess = rentalsToProcess.filter(r => isRealRental(r, extractRentalInfo(r), now));
        }

        // Also fetch rigs to supplement rental data (name, live hashrate)
        const rigsRes = await mrrApiCall({ endpoint: '/rig/mine', clientNameRaw: acct });
        const rigMap = new Map();
        if (rigsRes.statusCode === 200 && rigsRes.data?.success) {
          const rigs = extractArray(rigsRes.data);
          rigs.forEach(r => rigMap.set(String(r.id), r));
        }

        // Process each active rental
        for (const rental of rentalsToProcess) {
          const liveRig = rigMap.get(String(rental.rig?.id || rental.rigid));
          const result = await processRental(rental, acct, now, forceNotify, notifiedRentalIdsThisRun, notifications, liveRig);

          if (result.isValid) {
            metric.rented++;
            activeRentalLines.push(result.activeRentalLine);
          }
        }

        // Update rig metrics (online/offline/disabled) – keep your existing logic
        // ...

        accountMetrics.push(metric);
        if (!metric.error) successfulAccts.push(acct);

      } catch (err) {
        console.error(`[${new Date().toLocaleTimeString()}] Error in ${acct}: ${err.message}`);
        metric.error = true;
        accountMetrics.push(metric);
      }
    }

    // Send heartbeat summary (unchanged)
    // ...
    
  } finally {
    isMonitorRunning = false;
  }
}