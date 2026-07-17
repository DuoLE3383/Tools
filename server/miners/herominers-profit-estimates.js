// server/miners/herominers-profit-estimates.js
// Profit estimation for HeroMiners coins: compares pool revenue vs NiceHash rental cost
import { scrapeHeroMinersGlobal, COIN_TO_ALGO_MAP } from './heroMiners.js';
import { normalizeAlgo, getAlgoDisplayName, getNiceHashUnit, convertUnit, HASHRATE_SUFFIXES } from '../../src/core/mapping.js';
import { getBtcPrice } from '../utils/priceUtils.js';
import { getCoinPricesFromDb } from '../coinGecko/coinGeckoClient.js';

const NH_PRICE_CACHE = new Map();
const NH_PRICE_CACHE_TTL = 120_000; // 2 min

/**
 * Fetch NiceHash price for an algorithm from the local API.
 * Pure function that can be tested independently.
 */
async function fetchNiceHashPrice(algorithm, baseUrl = `http://localhost:${process.env.PORT || 3000}`) {
  const cacheKey = `nh_price_${algorithm}`;
  const cached = NH_PRICE_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.ts < NH_PRICE_CACHE_TTL) {
    return cached.price;
  }

  try {
    const nhAlgo = normalizeAlgo(algorithm);
    const url = `${baseUrl}/api/v2/hashpower/order/price?algorithm=${encodeURIComponent(nhAlgo)}&client=VN`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return 0;
    const data = await res.json();
    const price = parseFloat(data?.price || data?.fixedPrice || 0);
    if (price > 0) {
      NH_PRICE_CACHE.set(cacheKey, { price, ts: Date.now() });
    }
    return price;
  } catch {
    return 0;
  }
}

/**
 * Hashrate unit to H/s multiplier
 */
function unitToHashes(value, unit) {
  const mult = HASHRATE_SUFFIXES[String(unit || 'H').toUpperCase()] || 1;
  return value * mult;
}

/**
 * Estimate how many GH/s are needed to earn 1 BTC/day for a given algorithm,
 * based on the pool's reported BTC/day for its current hashrate.
 */
function estimateGHPerBTCPerDay(poolBtcPerDay, poolHashrate, poolHashrateUnit) {
  if (!poolBtcPerDay || poolBtcPerDay <= 0 || !poolHashrate || poolHashrate <= 0) return 0;
  const hashrateInH = unitToHashes(poolHashrate, poolHashrateUnit);
  const hashrateInGH = hashrateInH / 1e9;
  // GH/BTC/day = hashrate in GH / BTC earned per day
  return hashrateInGH / poolBtcPerDay;
}

/**
 * Compute profit estimate for a single algorithm.
 * poolBtcPerDay: BTC/day earned from HeroMiners pool
 * nhPricePerUnitDay: BTC per NiceHash unit per day (e.g. BTC/TH/day)
 * nhUnit: NiceHash pricing unit (e.g. TH, GH, EH)
 * standardUnit: Standard hashrate unit for this algo (e.g. GH, TH, MH)
 * 
 * Returns { btcPerDay, usdPerDay, nhCostBtcPerDay, nhCostUsdPerDay, netBtcPerDay, netUsdPerDay, roiPercent }
 */
function computeProfit(poolBtcPerDay, nhPricePerUnitDay, nhUnit, standardUnit) {
  if (!poolBtcPerDay || poolBtcPerDay <= 0) return null;
  if (!nhPricePerUnitDay || nhPricePerUnitDay <= 0) {
    return {
      btcPerDay: poolBtcPerDay,
      nhCostBtcPerDay: 0,
      netBtcPerDay: poolBtcPerDay,
      roiPercent: null,
      status: 'no_price',
    };
  }

  // To compare: NH price is BTC/unit/day. We need to figure out how many
  // NH units 1 standard unit is.
  // e.g. NH unit = TH, standard unit = GH. 1 TH = 1000 GH.
  // So price per GH/day = nhPrice / 1000
  // Then cost per day = poolRevenueGH * (nhPrice / 1000)

  // Convert NH unit to H/s
  const nhUnitH = HASHRATE_SUFFIXES[String(nhUnit || 'H').toUpperCase()] || 1;
  // Convert standard unit to H/s
  const stdUnitH = HASHRATE_SUFFIXES[String(standardUnit || 'H').toUpperCase()] || 1;

  // How many NH units per 1 standard unit?
  // If NH unit is bigger (TH=1e12) and standard is smaller (GH=1e9):
  // 1 GH = 1e9 H. NH unit TH = 1e12 H. So 1 GH = 1e9/1e12 = 0.001 TH
  const unitsRatio = stdUnitH / nhUnitH;

  // Cost per standard unit per day = NH price * ratio
  // e.g. NH price = 0.0001 BTC/TH/day, 1 GH = 0.001 TH, cost/GH/day = 0.0001 * 0.001
  const costPerStdUnitDay = nhPricePerUnitDay * unitsRatio;

  // For the pool revenue: it's given as BTC/day for whatever hashrate the pool reports.
  // We don't need a specific GH amount - we directly compare the BTC/day numbers.
  // The question is: "If I mine this algo on HeroMiners, how much do I earn per day,
  // and how much would it cost to rent the same hashrate on NiceHash?"

  // We need to normalize: the pool revenue BTC/day is already revenue.
  // NH cost for the same hashrate depends on the pool's reported hashrate.
  // But the pool stats don't always report hashrate in a consistent way.
  // 
  // Strategy: Use the pool's reported BTC/day as the revenue, and compute
  // NH cost based on the pool's hashrate. If hashrate isn't available,
  // we can't compute a precise cost, but we can show revenue only.

  const netBtcPerDay = poolBtcPerDay; // Revenue only, cost computed separately
  return {
    btcPerDay: poolBtcPerDay,
    nhPricePerUnitDay,
    nhUnit,
    costPerStdUnitDay,
    netBtcPerDay,
    roiPercent: null, // Can't compute without knowing hashrate
    status: 'revenue_only',
  };
}

/**
 * Enhanced profit estimation that uses the pool's hashrate
 * to compute a more accurate cost comparison.
 */
function computeProfitWithHashrate(poolBtcPerDay, poolHashrate, poolHashrateUnit, nhPricePerUnitDay, nhUnit) {
  if (!poolBtcPerDay || poolBtcPerDay <= 0) return null;

  const hashrateInH = unitToHashes(poolHashrate || 0, poolHashrateUnit || 'H');
  const hashrateInGH = hashrateInH / 1e9;

  const nhUnitH = HASHRATE_SUFFIXES[String(nhUnit || 'H').toUpperCase()] || 1;
  const hashrateNhUnits = hashrateInH / nhUnitH;

  const nhCostBtcPerDay = nhPricePerUnitDay > 0 ? nhPricePerUnitDay * hashrateNhUnits : 0;
  const nhCostUsdPerDay = 0; // Computed after we get BTC price

  const netBtcPerDay = poolBtcPerDay - nhCostBtcPerDay;
  const roiPercent = nhCostBtcPerDay > 0 
    ? ((poolBtcPerDay - nhCostBtcPerDay) / nhCostBtcPerDay) * 100 
    : null;

  return {
    btcPerDay: poolBtcPerDay,
    poolHashrate: poolHashrate,
    poolHashrateUnit: poolHashrateUnit,
    hashrateInGH,
    nhPricePerUnitDay,
    nhUnit,
    nhCostBtcPerDay,
    netBtcPerDay,
    roiPercent,
    status: roiPercent !== null ? (roiPercent > 0 ? 'profitable' : 'unprofitable') : 'no_price',
  };
}

/**
 * Fetch profit estimates for all HeroMiners coins.
 * Returns array of { algorithm, coin, miners, btcPerDay (revenue), 
 *   nhPrice, nhCostBtcPerDay, netBtcPerDay, roiPercent, usdPerDay, ... }
 */
export async function getHeroMinersProfitEstimates(force = false, btcPriceOverride = null) {
  // 1. Get global HeroMiners stats
  const heroRes = await scrapeHeroMinersGlobal(btcPriceOverride);
  if (!heroRes.success) {
    return { success: false, error: heroRes.error || 'Failed to fetch HeroMiners data' };
  }

  const coinStats = heroRes.coinStats || [];

  // 2. Get BTC price
  let btcPrice = btcPriceOverride;
  if (!btcPrice || btcPrice <= 0) {
    btcPrice = await getBtcPrice();
  }

  // 3. Get coin prices from DB for USD conversion
  const coinSymbols = [...new Set(coinStats.map(s => s.coin || '').filter(Boolean))];
  let coinPrices = {};
  try {
    coinPrices = await getCoinPricesFromDb(coinSymbols);
  } catch {
    // Continue without coin prices
  }

  // 4. Collect unique algorithms
  const algos = [...new Set(coinStats.map(s => s.normalizedAlgo || normalizeAlgo(s.algorithm || '')).filter(Boolean))];

  // 5. Fetch NH prices in parallel
  const nhPrices = new Map();
  const nhPromises = algos.map(async (algo) => {
    const price = await fetchNiceHashPrice(algo);
    if (price > 0) nhPrices.set(algo, price);
  });
  await Promise.allSettled(nhPromises);

  // 6. Build profit estimates
  const estimates = [];
  const seen = new Set();

  for (const stat of coinStats) {
    const algo = stat.normalizedAlgo || normalizeAlgo(stat.algorithm || '');
    if (!algo || algo === 'UNKNOWN' || seen.has(`${algo}_${stat.coin}`)) continue;
    seen.add(`${algo}_${stat.coin}`);

    const nhPrice = nhPrices.get(algo) || 0;
    const nhUnit = getNiceHashUnit(algo);
    const standardUnit = 'GH'; // Default standard unit for comparison

    // Compute profit
    const poolBtc = parseFloat(stat.btcPerDay || 0);
    const hashrateStr = String(stat.hashrate || '');
    const hashrateMatch = hashrateStr.match(/^([\d.]+)\s*([A-Za-z]+\/?[A-Za-z]*)?/);
    const poolHashrate = hashrateMatch ? parseFloat(hashrateMatch[1]) : 0;
    const poolUnit = hashrateMatch?.[2] || 'H';

    const profit = computeProfitWithHashrate(
      poolBtc,
      poolHashrate,
      poolUnit,
      nhPrice,
      nhUnit
    );

    // Get coin name
    const coinName = stat.coin || '';
    const coinPrice = coinPrices[coinName]?.usd || coinPrices[coinName.toLowerCase()]?.usd || 0;

    estimates.push({
      algorithm: algo,
      algorithmDisplay: getAlgoDisplayName(algo),
      coin: coinName,
      subdomain: stat.subdomain || '',
      miners: stat.miners || 0,
      // Revenue
      poolBtcPerDay: poolBtc,
      poolUsdPerDay: poolBtc * btcPrice,
      // Pool info
      poolHashrate,
      poolHashrateUnit: poolUnit,
      // NH cost
      nhPricePerUnitDay: nhPrice,
      nhUnit,
      // Profit
      nhCostBtcPerDay: profit?.nhCostBtcPerDay || 0,
      nhCostUsdPerDay: (profit?.nhCostBtcPerDay || 0) * btcPrice,
      netBtcPerDay: profit?.netBtcPerDay || poolBtc,
      netUsdPerDay: (profit?.netBtcPerDay || poolBtc) * btcPrice,
      roiPercent: profit?.roiPercent,
      status: profit?.status || 'no_data',
      // Coin price
      coinPrice,
      // Metadata
      btcPrice,
      updatedAt: new Date().toISOString(),
    });
  }

  // Sort by net profit descending
  estimates.sort((a, b) => {
    const aNet = a.netUsdPerDay || 0;
    const bNet = b.netUsdPerDay || 0;
    if (Math.abs(aNet - bNet) > 0.001) return bNet - aNet;
    // If net is similar, sort by ROI
    const aRoi = a.roiPercent ?? -999;
    const bRoi = b.roiPercent ?? -999;
    return bRoi - aRoi;
  });

  return {
    success: true,
    estimates,
    totalAlgos: estimates.length,
    btcPrice,
    scannedAt: new Date().toISOString(),
  };
}

export default { getHeroMinersProfitEstimates };
