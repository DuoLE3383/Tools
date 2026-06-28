// ==========================
//  ACCOUNT PROCESSOR MODULE
//  Handles processing individual MRR accounts
// ==========================

import { mrrApiCall } from './mrr.js';
import { extractRentalInfo } from './utils.js';
import { TELEGRAM_CONFIG, TelegramTemplates } from '../src/core/telegram.js';
import { normalizeAlgoForNiceHash, getMrrAlgorithmUnit, calculatePriceComparison } from '../src/core/mapping.js';
import { getBtcPriceData } from '../src/core/priceUtils.js';
import { isRealRental, validateRentals } from './rental-validator.js';
import { saveRental, getRental, markRentalNotified } from './rental-tracker.js';
import { resolveRentalAlgo, getRentalIdFromRig, getRigLookupKeys, isLiveRigCurrentlyRented } from './monitor-utils.js';

const { ALERT_COOLDOWN_MS, WARNING_RIG_THRESHOLD } = TELEGRAM_CONFIG;

export async function processAccount(
  acct, now, forceNotify,
  currentActiveRentalIds,
  currentActiveRealRentalIds,
  globalRentalsMap,
  globalOnlineAlgos,
  queuedTelegramMessages,
  notifiedRentalIdsThisRun,
  notifications
) {
  const harvestedRentalIds = new Set();
  const rigLookupByRentalId = new Map();
  
  const metric = {
    name: acct,
    total: 0,
    online: 0,
    rented: 0,
    ghost: 0,
    offline: 0,
    disabled: 0,
    warning: 0,
    error: false
  };

  const result = {
    metric,
    totals: { total: 0, available: 0, offline: 0, disabled: 0, warning: 0, online: 0 },
    rentedRigs: [],
    rentalLines: []
  };

  try {
    const [rigsRes, boughtRes, soldRes] = await Promise.all([
      mrrApiCall({ endpoint: '/rig/mine', clientNameRaw: acct }),
      mrrApiCall({ endpoint: '/rental', query: { type: 'bought' }, clientNameRaw: acct }),
      mrrApiCall({ endpoint: '/rental', query: { type: 'sold' }, clientNameRaw: acct })
    ]);

    // Process rigs
    const rigResult = await processRigs(
      rigsRes, acct, now,
      harvestedRentalIds,
      rigLookupByRentalId,
      globalOnlineAlgos,
      queuedTelegramMessages
    );
    
    result.totals = rigResult.totals;
    result.rentedRigs = rigResult.rentedRigs;
    metric.total = rigResult.totals.total;
    metric.online = rigResult.totals.online;
    metric.offline = rigResult.totals.offline;
    metric.disabled = rigResult.totals.disabled;
    metric.warning = rigResult.totals.warning;

    // Process rentals
    const allRentalsRaw = [
      ...extractArray(soldRes.data || {}).map(r => ({ ...r, __rentalSide: 'sold' })),
      ...extractArray(boughtRes.data || {}).map(r => ({ ...r, __rentalSide: 'bought' }))
    ];

    const rentalsMap = await buildRentalsMap(
      allRentalsRaw, acct, harvestedRentalIds, 
      rigLookupByRentalId, globalRentalsMap
    );

    const rentals = Array.from(new Map(
      Array.from(rentalsMap.values()).map(r => [String(r?.id || r?.rentalid || r?.rental_id || ''), r])
    ).values()).filter(r => r && (r.id || r.rentalid || r.rental_id));

    // Validate and split rentals
    const validation = validateRentals(rentals, now);
    
    // Process real rentals
    for (const rental of validation.real) {
      await processRental(
        rental, acct, now, forceNotify,
        currentActiveRentalIds,
        currentActiveRealRentalIds,
        rigLookupByRentalId,
        queuedTelegramMessages,
        notifiedRentalIdsThisRun,
        notifications,
        result.rentalLines
      );
    }

    // Log ghost rentals
    if (validation.ghost.length > 0) {
      console.log(`[monitor:${acct}] 🚫 Ghost rentals: ${validation.ghost.length} (${validation.ghostIds.join(', ')})`);
    }

    metric.rented = validation.realCount;
    metric.ghost = validation.ghostCount;

    // Clean up ghost rentals
    await cleanupGhostRentals(acct);

  } catch (err) {
    console.error(`[${new Date().toLocaleTimeString()}] [monitor:error] Client ${acct}: ${err.message}`);
    metric.error = true;
  }

  return result;
}