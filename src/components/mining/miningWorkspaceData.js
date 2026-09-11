// miningWorkspaceData.js - COMPLETE UPGRADED VERSION
// Fully integrates HeroMiners into opportunity calculations

import {
  getAlgoDisplayName,
  getAlgorithmUnit,
  mapNiceHashToMRR,
  normalizeAlgoForNiceHash,
  NICEHASH_ALGO_MAP,  // ✅ Added for fallback
} from "../../core/mapping.js";
import { getBtcPriceData, parsePriceValue } from "../../core/priceUtils.js";
import { convertPriceBetweenUnits } from "../../core/mrrUtils.js";

// ============================================
// UTILITY FUNCTIONS
// ============================================
// Any hashrate arbitrage beyond this multiple of the benchmark is a data
// artifact (unit mismatch or a bad quote), not a real opportunity. A >5x
// markup on a commodity market simply does not exist.
const MAX_SPREAD_PCT = 500;

export const clampSpreadPct = (value) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return value;
  return Math.max(-MAX_SPREAD_PCT, Math.min(MAX_SPREAD_PCT, value));
};

export const numberValue = (value) => {
  if (value === null || value === undefined || value === "") return 0;
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseFloat(
          String(value)
            .replace(/,/g, "")
            .replace(/[^\d.-]/g, ""),
        );
  return Number.isFinite(parsed) ? parsed : 0;
};

export const compactNumber = (value, digits = 2) => {
  const num = numberValue(value);
  if (!num) return "0";
  return num.toLocaleString(undefined, { maximumFractionDigits: digits });
};

export const btcValue = (value) => {
  const num = numberValue(value);
  return num > 0 ? num.toFixed(8) : "0.00000000";
};

export const percentValue = (value) => {
  const num = numberValue(value);
  return `${num >= 0 ? "+" : ""}${num.toFixed(2)}%`;
};

const normalizeKey = (algo) =>
  normalizeAlgoForNiceHash(algo || "").toUpperCase();

// ============================================
// COLLECT COINS FROM ROW
// ============================================
const collectCoinsFromRow = (row) => {
  const coins = new Set();
  
  if (row.coin && row.coin !== "Unknown" && row.coin !== "N/A") {
    coins.add(row.coin);
  }
  
  if (row.raw?.coin) coins.add(row.raw.coin);
  if (row.raw?.symbol) coins.add(row.raw.symbol);
  if (row.raw?.name) coins.add(row.raw.name);
  if (row.raw?.coinName) coins.add(row.raw.coinName);
  
  if (row.symbol) coins.add(row.symbol);
  if (row.coinName) coins.add(row.coinName);
  
  return coins;
};

// ============================================
// NORMALIZE FUNCTIONS
// ============================================
export function normalizeMiningDutchRows(payload) {
  const source = payload?.miningdutch || payload || {};
  const rows = Array.isArray(source?.coinStats) ? source.coinStats : [];

  return rows
    .map((row) => {
      const nicehashAlgo = normalizeKey(row.algorithm || row.algo);
      return {
        provider: "Mining-Dutch",
        coin: row.coin || row.symbol || "Pool",
        algorithm: row.algorithm || row.algo || "N/A",
        nicehashAlgo,
        mrrAlgo: mapNiceHashToMRR(nicehashAlgo) || NICEHASH_ALGO_MAP?.[nicehashAlgo] || nicehashAlgo,
        btcPerDay: numberValue(row.btcPerDay),
        usdPerDay: numberValue(row.usdPerDay),
        miners: numberValue(row.miners),
        hashrate: row.hashrate || "N/A",
        raw: row,
      };
    })
    .filter((row) => row.nicehashAlgo && row.nicehashAlgo !== "UNKNOWN");
}

export function normalizeHeroRows(payload) {
  const source = payload?.herominers || payload || {};
  const rows = Array.isArray(source?.coinStats) ? source.coinStats : [];

  return rows
    .map((row) => {
      const nicehashAlgo = normalizeKey(row.algorithm || row.algo);
      const coinName = row.coin || row.symbol || "Unknown";
      
      return {
        provider: "HeroMiners",
        coin: coinName,
        algorithm: row.algorithm || row.algo || "N/A",
        nicehashAlgo,
        mrrAlgo: mapNiceHashToMRR(nicehashAlgo) || NICEHASH_ALGO_MAP?.[nicehashAlgo] || nicehashAlgo,
        miners: numberValue(row.miners),
        workers: numberValue(row.workers),
        poolHashrate: row.poolHashrate || row.pool_hashrate || "N/A",
        networkHashrate: row.networkHashrate || row.network_hashrate || "N/A",
        usdPerDay: numberValue(row.usdPerDay),
        btcPerDay: numberValue(row.btcPerDay),
        raw: row,
      };
    })
    .filter((row) => row.nicehashAlgo && row.nicehashAlgo !== "UNKNOWN");
}

export function normalizeMinerstatRows(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.coinStats)
      ? payload.coinStats
      : [];
  return rows.map((row) => ({
    provider: "Minerstat",
    coin: row.coin || row.symbol || row.tag || "Unknown",
    algorithm: row.algorithm || row.algo || row.tag || "N/A",
    nicehashAlgo: normalizeKey(row.algorithm || row.algo || row.tag),
    mrrAlgo: mapNiceHashToMRR(normalizeKey(row.algorithm || row.algo || row.tag)),
    btcPerDay: numberValue(row.btc_revenue || row.btcPerDay || row.revenue || row.profit),
    usdPerDay: numberValue(row.usd_revenue || row.usdPerDay || row.revenue),
    raw: row,
  })).filter((row) => row.nicehashAlgo && row.nicehashAlgo !== "UNKNOWN");
}

export function normalizeWtmRows(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.coinStats)
      ? payload.coinStats
      : [];
  return rows.map((row) => ({
    provider: "WhatToMine",
    coin: row.tag || row.coin || row.symbol || "Unknown",
    algorithm: row.algorithm || row.algo || row.tag || "N/A",
    nicehashAlgo: normalizeKey(row.algorithm || row.algo || row.tag),
    mrrAlgo: mapNiceHashToMRR(normalizeKey(row.algorithm || row.algo || row.tag)),
    btcPerDay: numberValue(row.btc_revenue || row.btcPerDay || row.profit),
    usdPerDay: numberValue(row.revenue || row.usdPerDay || row.usd_revenue),
    raw: row,
  })).filter((row) => row.nicehashAlgo && row.nicehashAlgo !== "UNKNOWN");
}

export function normalizeHashrateNoRows(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.coinStats)
      ? payload.coinStats
      : Array.isArray(payload?.hashrateNo?.coinStats)
        ? payload.hashrateNo.coinStats
        : [];

  return rows
    .map((row) => {
      const nicehashAlgo = normalizeKey(row.algorithm || row.algo || row.name || row.coin || row.symbol);
      return {
        provider: "Hashrate.no",
        coin: row.coin || row.symbol || row.name || "Unknown",
        algorithm: row.algorithm || row.algo || row.name || "N/A",
        nicehashAlgo,
        mrrAlgo: mapNiceHashToMRR(nicehashAlgo) || NICEHASH_ALGO_MAP?.[nicehashAlgo] || nicehashAlgo,
        btcPerDay: numberValue(row.btcPerDay || row.revenue || row.btc_revenue || row.profit || 0),
        usdPerDay: numberValue(row.usdPerDay || row.revenue_usd || row.usd_revenue || 0),
        miners: numberValue(row.miners || row.workers || 0),
        hashrate: row.hashrate || row.poolHashrate || "N/A",
        raw: row,
      };
    })
    .filter((row) => row.nicehashAlgo && row.nicehashAlgo !== "UNKNOWN");
}

// ============================================
// MERGE MINING ROUTES
// ============================================
export function mergeMiningRoutes(
  miningDutchRows,
  heroRows,
  minerstatRows,
  wtmRows,
  hashrateNoRows,
  niceHashPrices = {},
) {
  // Build hero by algorithm with proper coin collection
  const heroByAlgo = new Map();
  for (const row of heroRows) {
    const current = heroByAlgo.get(row.nicehashAlgo) || {
      coins: [],
      allCoinsSet: new Set(),
      miners: 0,
      workers: 0,
      poolHashrates: [],
      btcPerDay: 0,
      usdPerDay: 0,
    };

    collectCoinsFromRow(row).forEach((coin) => {
      if (coin && coin !== "Unknown" && coin !== "N/A") {
        current.allCoinsSet.add(coin);
      }
    });
    current.coins = Array.from(current.allCoinsSet).filter(Boolean).sort();
    
    current.miners += row.miners || 0;
    current.workers += row.workers || 0;
    current.btcPerDay += row.btcPerDay || 0;
    current.usdPerDay += row.usdPerDay || 0;
    
    if (row.poolHashrate && row.poolHashrate !== "N/A") {
      current.poolHashrates.push(row.poolHashrate);
    }
    heroByAlgo.set(row.nicehashAlgo, current);
  }

  // Also group by raw algorithm name for better matching
  const heroByRawAlgo = new Map();
  for (const row of heroRows) {
    if (row.algorithm) {
      const rawAlgo = String(row.algorithm).toLowerCase();
      const current = heroByRawAlgo.get(rawAlgo) || {
        coins: [],
        allCoinsSet: new Set(),
        nicehashAlgo: row.nicehashAlgo,
        btcPerDay: 0,
        usdPerDay: 0,
        miners: 0,
        workers: 0,
      };
      collectCoinsFromRow(row).forEach((coin) => {
        if (coin && coin !== "Unknown" && coin !== "N/A") {
          current.allCoinsSet.add(coin);
        }
      });
      current.coins = Array.from(current.allCoinsSet).filter(Boolean).sort();
      current.btcPerDay += row.btcPerDay || 0;
      current.usdPerDay += row.usdPerDay || 0;
      current.miners += row.miners || 0;
      current.workers += row.workers || 0;
      heroByRawAlgo.set(rawAlgo, current);
    }
  }

  const dutchByAlgo = new Map();
  for (const row of miningDutchRows) {
    const current = dutchByAlgo.get(row.nicehashAlgo) || {
      rows: [],
      btcPerDay: 0,
      usdPerDay: 0,
      miners: 0,
      hashrate: row.hashrate,
    };

    current.rows.push(row);
    current.btcPerDay += row.btcPerDay;
    current.usdPerDay += row.usdPerDay;
    current.miners += row.miners;
    current.hashrate = current.hashrate || row.hashrate;
    dutchByAlgo.set(row.nicehashAlgo, current);
  }

  // ✅ FIX: Combine algorithms from all sources to ensure none are missed.
  const algos = new Set([
    ...heroByAlgo.keys(), 
    ...dutchByAlgo.keys(),
    ...minerstatRows.map(r => r.nicehashAlgo),
    ...wtmRows.map(r => r.nicehashAlgo),
    ...hashrateNoRows.map(r => r.nicehashAlgo),
  ]);

  return Array.from(algos)
    .map((nicehashAlgo) => {
      const dutch = dutchByAlgo.get(nicehashAlgo);
      const hero = heroByAlgo.get(nicehashAlgo);
      const nhPrice = numberValue(niceHashPrices[nicehashAlgo] || 0);
      const poolBtc = dutch?.btcPerDay || 0;
      const msBtc = minerstatRows.find(r => r.nicehashAlgo === nicehashAlgo)?.btcPerDay || 0;
      const wtmBtc = wtmRows.find(r => r.nicehashAlgo === nicehashAlgo)?.btcPerDay || 0;
      const hnBtc = hashrateNoRows.find(r => r.nicehashAlgo === nicehashAlgo)?.btcPerDay || 0;
      const heroBtc = hero?.btcPerDay || 0;
      
      const spread = clampSpreadPct(
        poolBtc > 0 && nhPrice > 0 && nhPrice < poolBtc * 1000
          ? ((poolBtc - nhPrice) / nhPrice) * 100
          : null,
      );

      const activityScore = (hero?.miners || 0) + (hero?.workers || 0) * 0.25 + (dutch?.miners || 0);
      // HeroMiners' btcPerDay is a coin BTC price, not per-hashrate revenue —
      // never fold it into the score alongside Mining-Dutch pool revenue.
      const profitScore = poolBtc * 100000000;

      // Get all coins from hero data
      let heroCoins = hero?.coins || [];
      
      // If no coins found via nicehashAlgo, try raw algo matching
      if (heroCoins.length === 0) {
        for (const [rawAlgo, data] of heroByRawAlgo) {
          if (nicehashAlgo.toLowerCase().includes(rawAlgo) || 
              rawAlgo.includes(nicehashAlgo.toLowerCase())) {
            heroCoins = [...heroCoins, ...data.coins];
          }
        }
        heroCoins = [...new Set(heroCoins)].filter(Boolean).sort();
      }

      const displayName = getAlgoDisplayName(nicehashAlgo);
      const unit = getAlgorithmUnit(nicehashAlgo);

      // Determine best pool revenue source. HeroMiners is intentionally
      // excluded: its btcPerDay is a coin BTC price, not per-hashrate revenue,
      // so comparing it to Mining-Dutch/Minerstat/WTM/HN would mix units.
      const sources = [
        { key: "Mining-Dutch", value: poolBtc },
        { key: "Minerstat", value: msBtc },
        { key: "WhatToMine", value: wtmBtc },
        { key: "Hashrate.no", value: hnBtc },
      ];

      const bestSource = sources.sort((a, b) => b.value - a.value)[0];

      return {
        nicehashAlgo,
        mrrAlgo: mapNiceHashToMRR(nicehashAlgo) || NICEHASH_ALGO_MAP?.[nicehashAlgo] || nicehashAlgo,
        label: displayName,
        unit: unit,
        miningDutchBtcPerDay: poolBtc,
        miningDutchUsdPerDay: dutch?.usdPerDay || 0,
        miningDutchMiners: dutch?.miners || 0,
        miningDutchHashrate: dutch?.hashrate || "N/A",
        minerstatBtcPerDay: msBtc,
        wtmBtcPerDay: wtmBtc,
        hashrateNoBtcPerDay: hnBtc,
        heroBtcPerDay: heroBtc,
        heroUsdPerDay: hero?.usdPerDay || 0,
        heroCoins: heroCoins,
        heroMiners: hero?.miners || 0,
        heroWorkers: hero?.workers || 0,
        heroPoolHashrates: hero?.poolHashrates || [],
        niceHashPrice: nhPrice,
        spread,
        rankScore: profitScore + activityScore,
        bestSource: bestSource?.key || "N/A",
        dutchRows: dutch?.rows || [],
        heroRows: hero?.rows || [],
      };
    })
    .sort((a, b) => {
      const spreadA = a.spread ?? -Infinity;
      const spreadB = b.spread ?? -Infinity;
      if (spreadB !== spreadA) return spreadB - spreadA;
      return b.rankScore - a.rankScore;
    });
}

// ============================================
// MRR MARKET ROWS
// ============================================
export function normalizeMrrMarketRows(payload) {
  // Accept several shapes:
  //  - raw array of rentals
  //  - FULL /api/v2/mrr/rentals response: { data: { data: { rentals: [...] } } }
  //  - /info/algos object where keys are algo names
  const unwrap = (node) => {
    if (Array.isArray(node)) return node;
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node.rentals)) return node.rentals;
    if (Array.isArray(node.data)) return node.data;
    if (node.data && typeof node.data === 'object') return unwrap(node.data);
    return Object.values(node);
  };
  const algos = unwrap(payload);

  return algos
    .map((rental) => {
      const rawPrice = rental?.price || rental?.rig?.price || {};
      const paidValue =
        getBtcPriceData(rawPrice).value ||
        parsePriceValue(
          rawPrice?.paid ?? rawPrice?.price ?? rawPrice?.amount ?? rawPrice,
        );
      const durationHours = numberValue(
        rental?.hours ||
          rental?.length ||
          rental?.duration ||
          rental?.rig?.hours,
      );
      const algo = String(
        rental?.algo ||
          rental?.algorithm ||
          rental?.rig?.algo ||
          rental?.rig?.algorithm ||
          rental?.rig?.type ||
          "N/A",
      );
      const nicehashAlgo = normalizeAlgoForNiceHash(algo);
      const advertised = numberValue(
        rental?.hashrate?.advertised?.hash ??
          rental?.hashrate?.advertised ??
          rental?.rig?.hashrate?.advertised?.hash ??
          rental?.rig?.hashrate?.advertised ??
          rental?.rig?.hashrate?.hash ??
          rental?.rig?.hashrate,
      );
      const unit = String(
        rental?.hashrate?.advertised?.type ||
          rental?.hashrate?.suffix ||
          rental?.rig?.hashrate?.advertised?.type ||
          rental?.rig?.hashrate?.suffix ||
          rental?.price_unit ||
          rental?.currency ||
          getAlgorithmUnit(nicehashAlgo),
      ).toUpperCase();
      // Rental rate in the rental's own unit (e.g. BTC/GH/day), then converted
      // onto the SAME per-algo-natural-unit baseline used by the Mining-Dutch
      // pool revenue and the NiceHash prices in this table (e.g. per GH for
      // KAWPOW, per EH for SHA256). Mixing unit spaces is what previously
      // turned real values into "spreads" of +40 billion %.
      const perUnitPerDay =
        paidValue > 0 && durationHours > 0 && advertised > 0
          ? paidValue / (durationHours / 24) / advertised
          : 0;
      const naturalUnit = getAlgorithmUnit(nicehashAlgo);
      const pricePerNaturalUnitDayBtc = convertPriceBetweenUnits(
        perUnitPerDay,
        unit,
        naturalUnit,
      );

      return {
        id: String(rental?.id || rental?.rentalid || rental?.rental_id || ""),
        algo,
        nicehashAlgo,
        mrrAlgo: mapNiceHashToMRR(nicehashAlgo) || NICEHASH_ALGO_MAP?.[nicehashAlgo] || nicehashAlgo,
        unit,
        priceBtc: paidValue,
        // Per-day unit price rebased onto the algo's natural unit (e.g.
        // BTC/GH/day for KAWPOW) — same baseline as pool revenue + NH prices.
        pricePerUnitDayBtc: pricePerNaturalUnitDayBtc,
        rawPerUnitDayBtc: perUnitPerDay,
        durationHours,
        advertised,
        currency: String(
          rawPrice?.currency ||
            rawPrice?.price_unit ||
            rental?.currency ||
            "BTC",
        ).toUpperCase(),
        mrrClient: rental?.mrrClient || rental?.client || "",
      };
    })
    .filter(
      (row) =>
        row.nicehashAlgo &&
        row.nicehashAlgo !== "UNKNOWN" &&
        row.pricePerUnitDayBtc > 0,
    );
}

// ============================================
// BUILD OPPORTUNITY ROWS - UPGRADED WITH HEROMINERS
// ============================================
export function buildOpportunityRows(
  routeRows,
  niceHashPrices = {},
  mrrMarketRows = [], // This is now an array of algo market data
  heroRows = [], // ✅ Added heroRows parameter
) {
  const mrrByAlgo = new Map();
  for (const row of mrrMarketRows) {
    const current = mrrByAlgo.get(row.nicehashAlgo) || { rows: [], price: 0 };
    current.rows.push(row);
    current.price =
      current.price > 0
        ? Math.min(current.price, row.pricePerUnitDayBtc)
        : row.pricePerUnitDayBtc;
    mrrByAlgo.set(row.nicehashAlgo, current);
  }

  // ✅ Build HeroMiners data by algorithm
  const heroByAlgo = new Map();
  for (const row of heroRows) {
    const current = heroByAlgo.get(row.nicehashAlgo) || {
      rows: [],
      btcPerDay: 0,
      usdPerDay: 0,
      miners: 0,
      workers: 0,
      coins: new Set(),
    };
    current.rows.push(row);
    current.btcPerDay += row.btcPerDay || 0;
    current.usdPerDay += row.usdPerDay || 0;
    current.miners += row.miners || 0;
    current.workers += row.workers || 0;
    if (row.coin && row.coin !== "Unknown") current.coins.add(row.coin);
    if (row.raw?.coin) current.coins.add(row.raw.coin);
    if (row.raw?.symbol) current.coins.add(row.raw.symbol);
    heroByAlgo.set(row.nicehashAlgo, current);
  }

  return routeRows
    .map((route) => {
      const nhPrice = numberValue(niceHashPrices[route.nicehashAlgo] || 0);
      const mrrMarket = mrrByAlgo.get(route.nicehashAlgo)?.price || 0;
      const pool = numberValue(route.miningDutchBtcPerDay || 0);
      
      // ✅ Get HeroMiners data for this algorithm
      const heroData = heroByAlgo.get(route.nicehashAlgo);
      const heroValue = heroData?.btcPerDay || 0;
      const heroCoins = heroData?.coins ? Array.from(heroData.coins) : [];
      
      // Benchmark candidates = actual hashrate MARKET costs only (NiceHash +
      // MRR). Mining-Dutch pool revenue is the "producer" side we compare
      // against — including it here made the spread self-referential: whenever
      // the pool revenue was the cheapest "candidate", the spread clamped to 0
      // and hid real negative spreads (when pool revenue sits BELOW market
      // cost) as well as real arbitrage gaps.
      const candidates = [
        { key: "NiceHash", value: nhPrice },
        { key: "MRR", value: mrrMarket },
      ];

      const positiveCandidates = candidates.filter((c) => c.value > 0);
      const benchmark = positiveCandidates
        .slice()
        .sort((a, b) => a.value - b.value)[0] || null;
      const bestCost = benchmark?.value ?? Number.POSITIVE_INFINITY;
      const benchmarkSource = benchmark?.key || "N/A";
      const benchmarkValue = benchmark?.value || 0;
      const profitBtc = pool > 0 && bestCost !== Number.POSITIVE_INFINITY ? pool - bestCost : 0;
      const bestSpreadPercent = clampSpreadPct(
        pool > 0 && benchmarkValue > 0 ? ((pool - benchmarkValue) / benchmarkValue) * 100 : null,
      );
      const dataCoverage = positiveCandidates.length;
      // Confidence is now bounded by the 2 real market benchmark sources (NH, MRR).
      const confidenceScore = Math.min(1, dataCoverage / 2) + (bestSpreadPercent && bestSpreadPercent > 0 ? 0.25 : 0);

      const spreadVsNh = clampSpreadPct(
        nhPrice > 0 ? ((pool - nhPrice) / nhPrice) * 100 : null,
      );
      const spreadVsMrr = clampSpreadPct(
        mrrMarket > 0 ? ((pool - mrrMarket) / mrrMarket) * 100 : null,
      );
      const spreadVsHero = clampSpreadPct(
        heroValue > 0 ? ((pool - heroValue) / heroValue) * 100 : null,
      );
      
      // ✅ Determine the benchmark source that is most economically relevant
      const winner = benchmarkSource;

      // ✅ Merge coins from route and hero data
      const allCoins = new Set([
        ...(route.heroCoins || []),
        ...heroCoins,
      ]);

      return {
        ...route,
        niceHashPrice: nhPrice,
        mrrMarketPrice: mrrMarket,
        heroMinersPrice: heroValue,
        heroMinersCount: heroData?.miners || 0,
        heroWorkersCount: heroData?.workers || 0,
        heroCoins: Array.from(allCoins).filter(Boolean).sort(),
        poolRevenue: pool,
        spreadVsNh,
        spreadVsMrr,
        spreadVsHero,
        benchmarkValue,
        bestCost,
        benchmarkSource,
        profitBtc,
        bestSpreadPercent,
        confidenceScore,
        winner,
        opportunityScore: profitBtc,
        mrrMarketRows: mrrByAlgo.get(route.nicehashAlgo)?.rows || [],
        heroRows: heroData?.rows || [],
        allSources: positiveCandidates.map(c => c.key),
      };
    })
    .sort((a, b) => {
      const spreadA = a.bestSpreadPercent ?? -Infinity;
      const spreadB = b.bestSpreadPercent ?? -Infinity;
      if (spreadB !== spreadA) return spreadB - spreadA;

      const profitA = a.profitBtc || 0;
      const profitB = b.profitBtc || 0;
      if (profitB !== profitA) return profitB - profitA;

      const confidenceA = a.confidenceScore || 0;
      const confidenceB = b.confidenceScore || 0;
      if (confidenceB !== confidenceA) return confidenceB - confidenceA;

      return (b.poolRevenue || 0) - (a.poolRevenue || 0);
    });
}

// ============================================
// HELPER: Get best source for an algorithm
// ============================================
export function getBestSource(route, includeHero = false) {
  // HeroMiners' btcPerDay is a coin BTC price, not a hashrate cost — never
  // use it as a "cost" in spread calculations. Default includeHero=false.
  const sources = [
    { key: "Mining-Dutch", value: route.miningDutchBtcPerDay || 0 },
    { key: "NiceHash", value: route.niceHashPrice || 0 },
    { key: "MRR", value: route.mrrMarketPrice || 0 },
  ];

  if (includeHero) {
    sources.push({ key: "HeroMiners", value: route.heroMinersPrice || 0 });
  }

  return sources
    .filter(s => s.value > 0)
    .sort((a, b) => b.value - a.value)[0] || null;
}

// ============================================
// HELPER: Get spread between pool and best source
// ============================================
export function getBestSpread(route, includeHero = false) {
  const best = getBestSource(route, includeHero);
  if (!best) return null;
  const pool = route.miningDutchBtcPerDay || 0;
  if (pool <= 0 || best.value <= 0) return null;
  return clampSpreadPct(((pool - best.value) / best.value) * 100);
}
