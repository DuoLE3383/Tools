// miners/herominers-parser.js

// ==========================

function getCoinDivisibility(coin) {
  const coinUpper = String(coin || '').toUpperCase();
  if (coinUpper === 'QRL' || coinUpper === 'ZEPH') return 1e9; // 9 decimal places
  return 1e8; // Default to 8 decimal places
}

// ==========================
//  LIB: HEROMINERS PARSER
//  Advanced response parsing
// ==========================

import { formatHashRate, formatTimeAgo, formatCurrency, formatUSD } from './hash-format.js';

/**
 * Calculate shares from worker data
 */
function calculateSharesFromWorkers(workers) {
  let pool = { good: 0, stale: 0, invalid: 0 };
  let solo = { good: 0, stale: 0, invalid: 0 };

  if (!workers || !Array.isArray(workers)) {
    return { pool, solo };
  }

  workers.forEach(w => {
    const isSolo = w.solo === 'true' || w.solo === true;
    const good = parseInt(w.shares_good || 0);
    const stale = parseInt(w.shares_stale || 0);
    const invalid = parseInt(w.shares_invalid || 0);

    if (isSolo) {
      solo.good += good;
      solo.stale += stale;
      solo.invalid += invalid;
    } else {
      pool.good += good;
      pool.stale += stale;
      pool.invalid += invalid;
    }
  });

  return { pool, solo };
}

/**
 * Calculate blocks from worker data
 */
function calculateBlocksFromWorkers(workers) {
  let pool = 0, solo = 0;
  
  if (!workers || !Array.isArray(workers)) {
    return { pool, solo };
  }
  
  workers.forEach(w => {
    const blocks = parseInt(w.blocksFound || 0);
    const isSolo = w.solo === 'true' || w.solo === true;
    
    if (isSolo) {
      solo += blocks;
    } else {
      pool += blocks;
    }
  });
  
  return { pool, solo };
}

/**
 * Parse share data from stats object and workers
 */
function parseShares(stats, workers) {
  // Try to get shares from stats first (fallback)
  let shares_good = parseInt(stats.shares_good || 0);
  let shares_stale = parseInt(stats.shares_stale || 0);
  let shares_invalid = parseInt(stats.shares_invalid || 0);
  let solo_shares_good = parseInt(stats.solo_shares_good || 0);
  let solo_shares_stale = parseInt(stats.solo_shares_stale || 0);
  let solo_shares_invalid = parseInt(stats.solo_shares_invalid || 0);

  // If shares are 0 in stats but we have workers, calculate from workers
  if (shares_good === 0 && shares_stale === 0 && shares_invalid === 0 && workers && Array.isArray(workers) && workers.length > 0) {
    const workerShares = calculateSharesFromWorkers(workers);
    shares_good = workerShares.pool.good;
    shares_stale = workerShares.pool.stale;
    shares_invalid = workerShares.pool.invalid;
    solo_shares_good = workerShares.solo.good;
    solo_shares_stale = workerShares.solo.stale;
    solo_shares_invalid = workerShares.solo.invalid;
  }

  const totalGood = shares_good + solo_shares_good;
  const totalStale = shares_stale + solo_shares_stale;
  const totalInvalid = shares_invalid + solo_shares_invalid;
  const totalAll = totalGood + totalStale + totalInvalid;

  return {
    pool: {
      valid: shares_good,
      stale: shares_stale,
      invalid: shares_invalid,
      total: shares_good + shares_stale + shares_invalid
    },
    solo: {
      valid: solo_shares_good,
      stale: solo_shares_stale,
      invalid: solo_shares_invalid,
      total: solo_shares_good + solo_shares_stale + solo_shares_invalid
    },
    total: {
      valid: totalGood,
      stale: totalStale,
      invalid: totalInvalid,
      total: totalAll
    }
  };
}

/**
 * Parse block data from stats object and workers
 */
function parseBlocks(stats, workers) {
  // Try to get blocks from stats first
  let blocksFoundPool = parseInt(stats.blocksFoundPool || 0);
  let blocksFoundSolo = parseInt(stats.blocksFoundSolo || 0);
  
  // If blocks are 0 in stats but we have workers, calculate from workers
  if (blocksFoundPool === 0 && blocksFoundSolo === 0 && workers && Array.isArray(workers) && workers.length > 0) {
    const workerBlocks = calculateBlocksFromWorkers(workers);
    blocksFoundPool = workerBlocks.pool;
    blocksFoundSolo = workerBlocks.solo;
  }
  
  const blocksFound = parseInt(stats.blocksFound || 0) || blocksFoundPool + blocksFoundSolo;
  
  return {
    total: blocksFound,
    pool: blocksFoundPool,
    solo: blocksFoundSolo,
  };
}

/**
 * Parse worker data
 */
function parseWorkers(workers, coin) {
  if (!workers || !Array.isArray(workers)) return [];

  return workers.map(w => {
    const hashrate = parseFloat(w.hashrate || 0);
    const lastShare = w.lastShare ? parseInt(w.lastShare) * 1000 : null;
    const shares_good = parseInt(w.shares_good || 0);
    const shares_stale = parseInt(w.shares_stale || 0);
    const shares_invalid = parseInt(w.shares_invalid || 0);
    const solo_shares_good = parseInt(w.solo_shares_good || 0);
    const solo_shares_stale = parseInt(w.solo_shares_stale || 0);
    const solo_shares_invalid = parseInt(w.solo_shares_invalid || 0);

    // Parse solo hashes - handle both string and number
    const soloHashes = w.solo_hashes ? parseInt(w.solo_hashes) : 0;
    const hashes = w.hashes ? parseInt(w.hashes) : 0;
    const hashesSinceBlock = w.hashesSinceBlock ? parseInt(w.hashesSinceBlock) : 0;

    return {
      name: w.name || 'Unknown',
      hashrate: hashrate,
      hashrateFormatted: formatHashRate(hashrate),
      region: w.region || 'N/A',
      port: w.port || 'N/A',
      agent: w.agent || 'N/A',
      stratum: w.stratum || 'N/A',
      solo: w.solo === 'true' || w.solo === true,
      lastShare: lastShare,
      lastShareFormatted: lastShare ? formatTimeAgo(lastShare) : 'N/A',
      // Pool shares
      sharesGood: shares_good,
      sharesInvalid: shares_invalid,
      sharesStale: shares_stale,
      // Solo shares
      soloSharesGood: solo_shares_good,
      soloSharesInvalid: solo_shares_invalid,
      soloSharesStale: solo_shares_stale,
      // Total shares (pool + solo)
      totalSharesGood: shares_good + solo_shares_good,
      totalSharesInvalid: shares_invalid + solo_shares_invalid,
      totalSharesStale: shares_stale + solo_shares_stale,
      sharesTotal: shares_good + solo_shares_good + shares_invalid + solo_shares_invalid + shares_stale + solo_shares_stale,
      lastJobDifficulty: parseInt(w.lastJobDifficulty || 0),
      blocksFound: parseInt(w.blocksFound || 0),
      hashes: hashes,
      soloHashes: soloHashes,
      totalHashes: hashes + soloHashes,
      hashesSinceBlock: hashesSinceBlock,
      hashrate1h: parseFloat(w.hashrate_1h || 0),
      hashrate1hFormatted: formatHashRate(parseFloat(w.hashrate_1h || 0)),
      hashrate6h: parseFloat(w.hashrate_6h || 0),
      hashrate6hFormatted: formatHashRate(parseFloat(w.hashrate_6h || 0)),
      hashrate24h: parseFloat(w.hashrate_24h || 0),
      hashrate24hFormatted: formatHashRate(parseFloat(w.hashrate_24h || 0)),
      // Efficiency based on total valid shares
      efficiency: (shares_good + solo_shares_good + shares_invalid + solo_shares_invalid) > 0
        ? (((shares_good + solo_shares_good) / (shares_good + solo_shares_good + shares_invalid + solo_shares_invalid)) * 100).toFixed(2)
        : '100.00'
    };
  });
}

/**
 * Parse hashrate data from stats object
 */
function parseHashrates(stats) {
  const currentHashrate = parseFloat(stats.hashrate || 0);
  const avg1h = parseFloat(stats.hashrate_1h || 0);
  const avg6h = parseFloat(stats.hashrate_6h || 0);
  const avg24h = parseFloat(stats.hashrate_24h || 0);
  const effectiveHashrate = currentHashrate > 0 ? currentHashrate : (avg24h > 0 ? avg24h : avg6h);

  return {
    current: currentHashrate,
    avg1h,
    avg6h,
    avg24h,
    effective: effectiveHashrate,
    formatted: {
      current: formatHashRate(currentHashrate),
      avg1h: formatHashRate(avg1h),
      avg6h: formatHashRate(avg6h),
      avg24h: formatHashRate(avg24h),
      effective: formatHashRate(effectiveHashrate),
    }
  };
}

/**
 * Parse payment and balance data from stats object
 */
function parsePaymentsAndBalance(stats, divisibility) {
  return {
    pending: parseFloat(stats.balance || 0) / divisibility,
    totalPaid: parseFloat(stats.paid || 0) / divisibility,
    paid24h: parseFloat(stats.payments_24h || 0) / divisibility,
    paidWeek: parseFloat(stats.payments_7d || 0) / divisibility,
  };
}

/**
 * Parse round data from stats object
 */
function parseRound(stats, pendingBalance) {
  const roundHashes = parseFloat(stats.roundHashes || 0);
  const poolRoundHashes = parseFloat(stats.poolRoundHashes || 0);
  const contribution = poolRoundHashes > 0 ? (roundHashes / poolRoundHashes) * 100 : 0;

  return {
    score: parseFloat(stats.roundScore || 0),
    hashes: roundHashes,
    poolScore: parseFloat(stats.poolRoundScore || 0),
    poolHashes: poolRoundHashes,
    soloHashes: parseFloat(stats.soloRoundHashes || 0),
    contribution,
    payoutEstimate: contribution > 0 ? (pendingBalance * (contribution / 100)) : 0,
  };
}

/**
 * Parse chart data from the response
 */
function parseCharts(charts, divisibility) {
  const hashrateChart = (charts.hashrate || []).map(point => ({
    time: (point[0] || 0) * 1000,
    hashrate: parseFloat(point[1] || 0),
    workers: point[2] || 0
  }));

  const paymentChart = (charts.payments || []).map(point => ({
    time: (point[0] || 0) * 1000,
    amount: parseFloat(point[1] || 0) / divisibility
  }));

  return { hashrate: hashrateChart, payments: paymentChart };
}

/**
 * Parse worker summary from a list of parsed workers
 */
function summarizeWorkers(parsedWorkers) {
  return {
    total: parsedWorkers.length,
    solo: parsedWorkers.filter(w => w.solo).length,
    pool: parsedWorkers.filter(w => !w.solo).length,
    totalHashrate: parsedWorkers.reduce((sum, w) => sum + w.hashrate, 0),
    totalHashrateFormatted: formatHashRate(parsedWorkers.reduce((sum, w) => sum + w.hashrate, 0)),
    totalShares: parsedWorkers.reduce((sum, w) => sum + w.sharesTotal, 0),
    totalBlocksFound: parsedWorkers.reduce((sum, w) => sum + w.blocksFound, 0),
    regions: [...new Set(parsedWorkers.map(w => w.region))],
    stratumTypes: [...new Set(parsedWorkers.map(w => w.stratum))]
  };
}

/**
 * Enhanced HeroMiners response parser
 * Matches the exact API response structure
 */
export function parseHeroMinersResponse(data, address, coin) {
  if (!data) return null;
  
  const stats = data.stats || {};
  const payments = data.payments || [];
  const unlocked = data.unlocked || [];
  const workers = data.workers || [];

  const divisibility = getCoinDivisibility(coin);

  // --- Modular Parsing ---
  const hashrates = parseHashrates(stats);
  const balances = parsePaymentsAndBalance(stats, divisibility);
  const shares = parseShares(stats, workers);  // Pass workers
  const blocks = parseBlocks(stats, workers);  // Pass workers
  const round = parseRound(stats, balances.pending);
  const parsedWorkers = parseWorkers(workers, coin);
  const workerSummary = summarizeWorkers(parsedWorkers);
  const charts = parseCharts(data.charts || {}, divisibility);

  // --- Last Share ---
  const lastShareRaw = stats.lastShare || null;
  const lastShare = lastShareRaw ? (String(lastShareRaw).length === 10 ? parseInt(lastShareRaw) * 1000 : lastShareRaw) : null;
  const lastShareFormatted = lastShare ? formatTimeAgo(lastShare) : 'N/A';

  // --- Payments List ---
  const parsedPayments = [];
  for (let i = 0; i < payments.length; i += 2) {
    if (i + 1 < payments.length) {
      const txData = payments[i];
      const timestamp = payments[i + 1];
      const parts = txData.split(':');
      if (parts.length === 3) {
        parsedPayments.push({
          txid: parts[0],
          amount: parseFloat(parts[1]) / divisibility,
          block: parseInt(parts[2]),
          timestamp: parseInt(timestamp) * 1000
        });
      }
    }
  }

  // --- Unlocked Blocks ---
  const parsedUnlocked = [];
  for (let i = 0; i < unlocked.length; i += 2) {
    if (i + 1 < unlocked.length) {
      const blockData = unlocked[i];
      const timestamp = unlocked[i + 1];
      const parts = blockData.split(':');
      if (parts.length >= 4) {
        parsedUnlocked.push({
          height: parseInt(parts[0]),
          txid: parts[1],
          amount: parseFloat(parts[2]) / divisibility,
          status: parts[parts.length - 1] || 'unknown',
          timestamp: parseInt(timestamp) * 1000
        });
      }
    }
  }

  // --- Created At ---
  const createdAt = data.createdAt || Date.now() / 1000;
  const createdAtDate = new Date(createdAt * 1000);

  // Calculate total hashes from workers if not in stats
  let totalHashes = parseFloat(stats.solo_hashes || 0);
  if (totalHashes === 0 && workers.length > 0) {
    totalHashes = workers.reduce((sum, w) => sum + (parseInt(w.solo_hashes || 0) + parseInt(w.hashes || 0)), 0);
  }

  return {
    address,
    coin,
    divisibility,
    
    // Hashrates (from module)
    currentHashrate: hashrates.current,
    avg1h: hashrates.avg1h,
    avg6h: hashrates.avg6h,
    avg24h: hashrates.avg24h,
    effectiveHashrate: hashrates.effective,
    
    // Formatted hashrates (from module)
    currentHashrateFormatted: hashrates.formatted.current,
    avg1hFormatted: hashrates.formatted.avg1h,
    avg6hFormatted: hashrates.formatted.avg6h,
    avg24hFormatted: hashrates.formatted.avg24h,
    effectiveHashrateFormatted: hashrates.formatted.effective,
    
    // Time
    lastShare,
    lastShareFormatted,
    createdAt: createdAtDate,
    
    // Work (from modules)
    totalHashes: totalHashes,
    shares,
    
    // Payments (from module)
    pendingBalance: balances.pending,
    totalPaid: balances.totalPaid,
    paid24h: balances.paid24h,
    paidWeek: balances.paidWeek,
    
    // Blocks
    blocksFound: blocks.total,
    blocksFoundPool: blocks.pool,
    blocksFoundSolo: blocks.solo,
    
    // Round
    roundScore: round.score,
    roundHashes: round.hashes,
    poolRoundScore: round.poolScore,
    poolRoundHashes: round.poolHashes,
    soloRoundHashes: round.soloHashes,
    roundContribution: round.contribution,
    payoutEstimate: round.payoutEstimate,
    
    // Network
    networkHeight: parseInt(stats.networkHeight || 0),
    donationLevel: stats.donation_level || '0',
    
    // Workers
    workers: parsedWorkers,
    workersOnline: workerSummary.total,
    workersTotal: workerSummary.total,
    workerSummary,
    
    // Charts
    hashrateChart: charts.hashrate,
    paymentChart: charts.payments,
    
    // Payments list
    payments: parsedPayments,
    
    // Unlocked blocks
    unlocked: parsedUnlocked,
    
    // Raw data
    raw: data
  };
}

/**
 * Build dashboard data from parsed response
 */
export function buildDashboardData(parsed, priceData = {}) {
  if (!parsed) return null;
  
  // Calculate efficiency from shares
  const totalShares = parsed.shares?.total?.total || 0;
  const validShares = parsed.shares?.total?.valid || 0;
  const efficiency = totalShares > 0 ? ((validShares / totalShares) * 100) : 0;

  return {
    address: parsed.address,
    coin: parsed.coin,
    
    // Live stats
    liveStats: {
      currentHashrate: parsed.currentHashrateFormatted,
      avg1h: parsed.avg1hFormatted,
      avg6h: parsed.avg6hFormatted,
      avg24h: parsed.avg24hFormatted,
      lastShare: parsed.lastShareFormatted,
      totalHashes: (parsed.totalHashes || 0).toLocaleString(),
      workersOnline: parsed.workersOnline,
      workersTotal: parsed.workersTotal,
      createdAt: parsed.createdAt
    },
    
    // Payment stats
    paymentStats: {
      pendingBalance: formatCurrency(parsed.pendingBalance, parsed.coin),
      totalPaid: formatCurrency(parsed.totalPaid, parsed.coin),
      paid24h: formatCurrency(parsed.paid24h, parsed.coin),
      paidWeek: formatCurrency(parsed.paidWeek, parsed.coin),
      pendingUSD: formatUSD((parsed.pendingBalance || 0) * (priceData?.usd || 0)),
      totalPaidUSD: formatUSD((parsed.totalPaid || 0) * (priceData?.usd || 0))
    },
    
    // Share stats
    shareStats: {
      pool: {
        valid: parsed.shares.pool.valid,
        stale: parsed.shares.pool.stale,
        invalid: parsed.shares.pool.invalid,
        total: parsed.shares.pool.total
      },
      solo: {
        valid: parsed.shares.solo.valid,
        stale: parsed.shares.solo.stale,
        invalid: parsed.shares.solo.invalid,
        total: parsed.shares.solo.total
      },
      total: {
        valid: parsed.shares.total.valid,
        stale: parsed.shares.total.stale,
        invalid: parsed.shares.total.invalid,
        total: parsed.shares.total.total,
        efficiency: efficiency.toFixed(2)
      }
    },
    
    // Block stats
    blockStats: {
      totalBlocks: parsed.blocksFound,
      blocksFoundPool: parsed.blocksFoundPool,
      blocksFoundSolo: parsed.blocksFoundSolo,
      roundContribution: parsed.roundContribution.toFixed(2) + '%',
      payoutEstimate: formatCurrency(parsed.payoutEstimate || 0, parsed.coin),
      networkHeight: parsed.networkHeight.toLocaleString()
    },
    
    // Worker stats
    workerStats: {
      total: parsed.workerSummary.total,
      solo: parsed.workerSummary.solo,
      pool: parsed.workerSummary.pool,
      totalHashrate: parsed.workerSummary.totalHashrateFormatted,
      totalShares: parsed.workerSummary.totalShares.toLocaleString(),
      totalBlocksFound: parsed.workerSummary.totalBlocksFound,
      regions: parsed.workerSummary.regions,
      stratumTypes: parsed.workerSummary.stratumTypes,
      workers: parsed.workers.map(w => ({
        name: w.name,
        hashrate: w.hashrateFormatted,
        region: w.region,
        solo: w.solo,
        lastShare: w.lastShareFormatted,
        sharesGood: w.sharesGood,
        sharesInvalid: w.sharesInvalid,
        sharesStale: w.sharesStale,
        soloSharesGood: w.soloSharesGood,
        soloSharesInvalid: w.soloSharesInvalid,
        soloSharesStale: w.soloSharesStale,
        totalSharesGood: w.totalSharesGood,
        totalSharesInvalid: w.totalSharesInvalid,
        totalSharesStale: w.totalSharesStale,
        efficiency: w.efficiency + '%',
        blocksFound: w.blocksFound,
        hashrate1h: w.hashrate1hFormatted,
        hashrate6h: w.hashrate6hFormatted,
        hashrate24h: w.hashrate24hFormatted,
        lastJobDifficulty: w.lastJobDifficulty.toLocaleString(),
        totalHashes: w.totalHashes,
        hashesSinceBlock: w.hashesSinceBlock
      }))
    },
    
    // Charts
    charts: {
      hashrate: parsed.hashrateChart,
      payments: parsed.paymentChart,
      shareStats: parsed.shares,
      blockStats: parsed.blockStats
    },
    
    // Recent data
    recent: {
      payments: parsed.payments.slice(0, 5),
      unlocked: parsed.unlocked.slice(0, 5)
    }
  };
}

/**
 * Get summary stats for dashboard card
 */
export function getSummaryStats(parsed) {
  if (!parsed) return null;

  const totalShares = parsed.shares?.total?.total || 0;
  const validShares = parsed.shares?.total?.valid || 0;
  const efficiency = totalShares > 0 ? ((validShares / totalShares) * 100) : 100;

  return {
    hashrate: parsed.currentHashrateFormatted,
    pendingBalance: formatCurrency(parsed.pendingBalance || 0, parsed.coin),
    totalPaid: formatCurrency(parsed.totalPaid || 0, parsed.coin),
    blocksFound: parsed.blocksFound || 0,
    workers: parsed.workersOnline,
    shares: (parsed.shares?.total?.valid || 0).toLocaleString(),
    efficiency: efficiency.toFixed(1)
  };
}

// Export all functions
export default {
  parseHeroMinersResponse,
  buildDashboardData,
  getSummaryStats
};