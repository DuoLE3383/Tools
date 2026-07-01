// miningWorkspaceData.js - COMPLETE UPGRADED VERSION
// Fully integrates HeroMiners into opportunity calculations

import {
  getAlgoDisplayName,
  getAlgorithmUnit,
  mapNiceHashToMRR,
  normalizeAlgoForNiceHash,
  normalizeAlgo,
  NICEHASH_ALGO_MAP,  // ✅ Added for fallback
} from "../../core/mapping";
import { getBtcPriceData, parsePriceValue } from "../../core/priceUtils";

// ============================================
// UTILITY FUNCTIONS
// ============================================
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

const isCoinLikeLabel = (value) => {
  const text = String(value || "").trim();
  if (!text) return false;
  const normalized = normalizeAlgoForNiceHash(text);
  if (normalized && normalized !== "UNKNOWN") return false;
  const compact = text.replace(/[^a-z0-9]/gi, "");
  return compact.length > 1;
};

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
      
      const spread =
        poolBtc > 0 && nhPrice > 0
          ? ((poolBtc - nhPrice) / nhPrice) * 100
          : null;
      
      const heroSpread =
        heroBtc > 0 && nhPrice > 0
          ? ((heroBtc - nhPrice) / nhPrice) * 100
          : null;
      
      const activityScore = (hero?.miners || 0) + (hero?.workers || 0) * 0.25 + (dutch?.miners || 0);
      const profitScore = Math.max(poolBtc, heroBtc) * 100000000;

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

      // Determine best source
      const sources = [ // Now includes all providers
        { key: "Mining-Dutch", value: poolBtc },
        { key: "HeroMiners", value: heroBtc },
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
        heroSpread,
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
  // The payload is now from /info/algos, which is an object where keys are algo names.
  const algos = typeof payload === 'object' && payload !== null && !Array.isArray(payload) 
    ? Object.values(payload) 
    : Array.isArray(payload) 
      ? payload 
      : [];

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
      const perUnitPerDay =
        paidValue > 0 && durationHours > 0 && advertised > 0
          ? paidValue / (durationHours / 24) / advertised
          : 0;

      return {
        id: String(rental?.id || rental?.rentalid || rental?.rental_id || ""),
        algo,
        nicehashAlgo,
        mrrAlgo: mapNiceHashToMRR(nicehashAlgo) || NICEHASH_ALGO_MAP?.[nicehashAlgo] || nicehashAlgo,
        unit,
        priceBtc: paidValue,
        pricePerUnitDayBtc: perUnitPerDay,
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
      
      // ✅ Include all sources in best cost calculation
      const candidates = [
        { key: "Mining-Dutch", value: pool },
        { key: "NiceHash", value: nhPrice },
        { key: "MRR", value: mrrMarket },
        { key: "HeroMiners", value: heroValue },
      ];
      
      const bestCost = Math.min(
        ...candidates.map(c => c.value > 0 ? c.value : Number.POSITIVE_INFINITY)
      );
      
      const spreadVsNh =
        nhPrice > 0 ? ((pool - nhPrice) / nhPrice) * 100 : null;
      const spreadVsMrr =
        mrrMarket > 0 ? ((pool - mrrMarket) / mrrMarket) * 100 : null;
      const spreadVsHero =
        heroValue > 0 ? ((pool - heroValue) / heroValue) * 100 : null;
      
      // ✅ Determine winner including HeroMiners
      const winner = candidates.sort((a, b) => b.value - a.value)[0];

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
        bestCost,
        winner: winner?.key || "N/A",
        opportunityScore:
          pool - (bestCost === Number.POSITIVE_INFINITY ? 0 : bestCost),
        mrrMarketRows: mrrByAlgo.get(route.nicehashAlgo)?.rows || [],
        heroRows: heroData?.rows || [],
        allSources: candidates.filter(c => c.value > 0).map(c => c.key),
      };
    })
    .sort(
      (a, b) =>
        b.opportunityScore - a.opportunityScore ||
        b.poolRevenue - a.poolRevenue ||
        (b.heroMinersPrice || 0) - (a.heroMinersPrice || 0),
    );
}

// ============================================
// HELPER: Get best source for an algorithm
// ============================================
export function getBestSource(route, includeHero = true) {
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
export function getBestSpread(route, includeHero = true) {
  const best = getBestSource(route, includeHero);
  if (!best) return null;
  const pool = route.miningDutchBtcPerDay || 0;
  if (pool <= 0 || best.value <= 0) return null;
  return ((pool - best.value) / best.value) * 100;
}