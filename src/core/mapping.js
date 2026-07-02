// mapping.js - Core algorithm mapping for NiceHash and MRR
// Enhanced for external use across the application

export const ALGO_DISPLAY_NAMES = {
  SHA256: "SHA256",
  SHA256ASICBOOST: "SHA256AB",
  SCRYPT: "Scrypt",
  DAGGERHASHIMOTO: "DaggerHashimoto",
  ETCHASH: "Etchash",
  EQUIHASH: "Equihash",
  ZHASH: "ZHash",
  KAWPOW: "KawPow",
  AUTOLYKOSV2: "Autolykos v2",
  AUTOLYKOS: "Autolykos",
  RANDOMX: "RandomX",
  RANDOMXMONERO: "RandomXMonero",
  OCTOPUS: "Octopus",
  KHEAVYHASH: "KHeavyHash",
  EAGLESONG: "Eaglesong",
  VERUSHASH: "VerusHash",
  NEXAPOW: "NexaPow",
  FISHHASH: "FishHash",
  DYNEXSOLVE: "DynexSolve",
  BEAMHASHIII: "BeamHash III",
  BLAKE3: "Blake3",
  BLAKE3_ALPH: "Blake3 (Alephium)",
  JANUSHASH: "Janushash",
  XELISHASHV3: "XelisHash v3",
  PROGPOWZ: "ProgPow Zano",
  PEARLHASH: "PearlHash",
  X11: "X11",
  LYRA2REV2: "Lyra2REv2",
  LYRA2Z: "Lyra2Z",
  NEOSCRYPT: "NeoScrypt",
  YESPOWER: "Yespower",
  ARGON2: "Argon2",
  CN_R: "CryptoNight R",
  CN_HEAVY: "CryptoNight Heavy",
  IRONFISH: "IronFish",
  ALEPHIUM: "Alephium",
  BEAMV3: "BeamV3",
};

// NiceHash algorithm normalization
export const NICEHASH_ALGO_MAP = {
  // SHA256
  SHA256: "SHA256",
  // SHA256ASICBOOST
  SHA256AB: "SHA256ASICBOOST",
  SHA256ASICBOOST: "SHA256ASICBOOST",
  // SCRYPT
  SCRYPT: "SCRYPT",
  // DAGGERHASHIMOTO
  DAGGERHASHIMOTO: "DAGGERHASHIMOTO",
  HASHIMOTOS: "DAGGERHASHIMOTO",
  HASHIMOTO: "DAGGERHASHIMOTO",
  "DAGGER-HASHIMOTO": "DAGGERHASHIMOTO",
  "DAGGER HASHIMOTO": "DAGGERHASHIMOTO",
  // EQUIHASH & ZHASH
  EQUIHASH: "EQUIHASH",
  ZHASH: "ZHASH",
  // ETCHASH
  ETCHASH: "ETCHASH",
  // KAWPOW
  KAWPOW: "KAWPOW",
  // AUTOLYKOS
  AUTOLYKOSV2: "AUTOLYKOS",
  AUTOLYKOS: "AUTOLYKOS",
  // RANDOMX
  RANDOMX: "RANDOMXMONERO",
  RANDOMXMONERO: "RANDOMXMONERO",
  // OTHER
  OCTOPUS: "OCTOPUS",
  KHEAVYHASH: "KHEAVYHASH",
  EAGLESONG: "EAGLESONG",
  VERUSHASH: "VERUSHASH",
  NEXAPOW: "NEXAPOW",
  FISHHASH: "FISHHASH",
  DYNEXSOLVE: "DYNEXSOLVE",
  // BEAM
  BEAMHASHIII: "BEAMV3",
  BEAMV3: "BEAMV3",
  BEAMHASH: "BEAMV3",
  // BLAKE3 / ALEPHIUM
  BLAKE3_ALPH: "ALEPHIUM",
  BLAKE3: "ALEPHIUM",
  JANUSHASH: "JANUSHASH",
  XELISHASHV3: "XELISHASHV3",
  X11: "X11",
  PROGPOWZ: "PROGPOWZ",
  PEARLHASH: "PEARLHASH",
  IRONFISH: "IRONFISH",
  // ALEPHIUM (duplicate for completeness)
  ALEPHIUM: "ALEPHIUM",
};

// MRR algorithm mapping
export const MRR_ALGO_MAP = {
  SHA256: "sha256",
  SHA256AB: "sha256ab",
  SHA256ASICBOOST: "sha256ab",
  SCRYPT: "scrypt",
  DAGGERHASHIMOTO: "DAGGERHASHIMOTO",
  EQUIHASH: "equihash",
  ZHASH: "zhash",
  ETCHASH: "etchash",
  KAWPOW: "kawpow",
  AUTOLYKOSV2: "autolykos_v2",
  AUTOLYKOS: "autolykos_v2",
  RANDOMX: "randomx",
  RANDOMXMONERO: "randomx",
  OCTOPUS: "octopus",
  KHEAVYHASH: "kheavyhash",
  EAGLESONG: "eaglesong",
  VERUSHASH: "verushash",
  NEXAPOW: "nexapow",
  FISHHASH: "fishhash",
  DYNEXSOLVE: "dynexsolve",
  BEAMHASHIII: "beamhash_iii",
  BLAKE3_ALPH: "blake3_alph",
  BLAKE3: "blake3_alph",
  JANUSHASH: "janushash",
  XELISHASHV3: "xelishash_v3",
  X11: "x11",
  PROGPOWZ: "progpowz",
  PEARLHASH: "pearlhash",
};

// Reverse mappings for lookup
export const NICEHASH_REVERSE_MAP = Object.entries(NICEHASH_ALGO_MAP).reduce((acc, [key, value]) => {
  if (!acc[value]) acc[value] = [];
  acc[value].push(key);
  return acc;
}, {});

export const MRR_REVERSE_MAP = Object.entries(MRR_ALGO_MAP).reduce((acc, [key, value]) => {
  if (!acc[value]) acc[value] = [];
  acc[value].push(key);
  return acc;
}, {});

// Hashrate suffixes for display
export const HASHRATE_SUFFIXES = {
  EH: 1e18,
  PH: 1e15,
  TH: 1e12,
  GH: 1e9,
  MH: 1e6,
  KH: 1e3,
  H: 1,
  GSOL: 1e9,
  MSOL: 1e6,
  KSol: 1e3,
  Sol: 1,
  KSOL: 1e3,
  SOL: 1,
};

// Algorithm market units (NiceHash Market Standards)
export const ALGO_UNITS = {
  SHA256: "EH",
  SHA256AB: "EH",
  SHA256ASICBOOST: "EH",
  SCRYPT: "TH",
  X11: "PH",
  NEOSCRYPT: "TH",
  DAGGERHASHIMOTO: "TH",
  ETCHASH: "TH",
  KAWPOW: "TH",
  EQUIHASH: "GSOL",
  ZHASH: "MSOL",
  AUTOLYKOSV2: "TH",
  AUTOLYKOS: "TH",
  RANDOMX: "GH",
  RANDOMXMONERO: "GH",
  EAGLESONG: "EH",
  OCTOPUS: "TH",
  KHEAVYHASH: "EH",
  FISHHASH: "TH",
  DYNEXSOLVE: "TH",
  BEAMHASHIII: "MSOL",
  BEAMV3: "MSOL",
  VERUSHASH: "TH",
  NEXAPOW: "TH",
  BLAKE3_ALPH: "PH",
  BLAKE3: "PH",
  JANUSHASH: "TH",
  XELISHASHV3: "TH",
  PROGPOWZ: "TH",
  PEARLHASH: "TH",
  IRONFISH: "TH",
  ALEPHIUM: "PH",
};

// MiningRigRentals marketplace price units (shown as Price/<unit>/Day on MRR).
export const MRR_ALGO_UNITS = {
  SHA256: "PH",
  SHA256AB: "PH",
  SHA256ASICBOOST: "PH",
  SCRYPT: "GH",
  X11: "TH",
  DAGGERHASHIMOTO: "GH",
  ETCHASH: "GH",
  KAWPOW: "GH",
  EQUIHASH: "GH",
  ZHASH: "GH",
  RANDOMX: "MH",
  RANDOMXMONERO: "MH",
  OCTOPUS: "GH",
  KHEAVYHASH: "TH",
};

// Factors relative to TH/s (Used for pricing math in MrrRigCard)
export const UNIT_FACTORS = {
  EH: 1e6,
  PH: 1e3,
  TH: 1,
  GH: 1e-3,
  MH: 1e-6,
  KH: 1e-9,
  H: 1e-12,
  GSol: 1e-3,
  MSol: 1e-6,
  KSOL: 1e-9,
  SOL: 1e-12,
};

// Algorithm categories for filtering
export const ALGO_CATEGORIES = {
  ASIC: ["SHA256", "SHA256ASICBOOST", "SCRYPT", "X11", "EAGLESONG", "KHEAVYHASH", "BLAKE3", "BLAKE3_ALPH"],
  GPU: ["DAGGERHASHIMOTO", "ETCHASH", "KAWPOW", "AUTOLYKOS", "OCTOPUS", "FISHHASH", "DYNEXSOLVE", "NEXAPOW", "PROGPOWZ", "PEARLHASH", "IRONFISH", "ALEPHIUM"],
  CPU: ["RANDOMXMONERO", "VERUSHASH"],
  HYBRID: ["EQUIHASH", "ZHASH", "BEAMV3", "JANUSHASH", "XELISHASHV3"]
};

// Profitability tiers for quick reference
export const PROFITABILITY_TIERS = {
  EXTREME: { min: 50, emoji: "🚀", color: "#ff0000" },
  HIGH: { min: 25, emoji: "🔥", color: "#ff6600" },
  GOOD: { min: 10, emoji: "💰", color: "#ffcc00" },
  MODERATE: { min: 5, emoji: "✅", color: "#00cc00" },
  LOW: { min: 0, emoji: "📊", color: "#0099ff" }
};

function extractAlgoText(algo) {
  if (!algo) return "";
  if (typeof algo === "string" || typeof algo === "number") return String(algo);
  if (typeof algo !== "object") return String(algo);

  const candidates = [
    algo.algo,
    algo.algorithm,
    algo.name,
    algo.type,
    algo.displayName,
    algo.enumName,
    algo.value,
    algo.id,
    algo.raw,
  ];

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    if (typeof candidate === "object") {
      const nested = extractAlgoText(candidate);
      if (nested) return nested;
      continue;
    }
    const text = String(candidate).trim();
    if (text) return text;
  }

  return String(algo).trim();
}

/**
 * Normalize algorithm name for NiceHash API
 * @param {string} algo - Raw algorithm name
 * @returns {string} Normalized algorithm name or "UNKNOWN"
 */
export function normalizeAlgoForNiceHash(algo) {
  const extracted = extractAlgoText(algo);
  if (!extracted) return "UNKNOWN";
  const normalized = extracted.toUpperCase().trim();
  const cleanAlgo = normalized.replace(/[^A-Z0-9]/g, '');

  // Direct mapping
  if (NICEHASH_ALGO_MAP[cleanAlgo]) {
    return NICEHASH_ALGO_MAP[cleanAlgo];
  }

  return "UNKNOWN";
}

/**
 * Map NiceHash algorithm to MRR format
 * @param {string} nicehashAlgo - NiceHash algorithm name
 * @returns {string} MRR algorithm name
 */
export function mapNiceHashToMRR(nicehashAlgo) {
  if (!nicehashAlgo) return "unknown";
  const normalized = extractAlgoText(nicehashAlgo).toUpperCase().trim();
  return MRR_ALGO_MAP[normalized] || normalized.toLowerCase();
}

/**
 * Map MRR algorithm back to NiceHash format
 * @param {string} mrrAlgo - MRR algorithm name
 * @returns {string} NiceHash algorithm name or original if not found
 */
export function mapMRRToNiceHash(mrrAlgo) {
  if (!mrrAlgo) return "unknown";
  const normalized = extractAlgoText(mrrAlgo).toLowerCase().trim();
  for (const [niceHash, mrr] of Object.entries(MRR_ALGO_MAP)) {
    if (mrr === normalized) return niceHash;
  }
  return mrrAlgo;
}

/**
 * Get the standard unit for an algorithm
 * @param {string} algo - Algorithm name
 * @returns {string} Unit string (e.g., "TH", "MH", "SOL")
 */
export function getAlgorithmUnit(algo) {
  if (!algo) return "H/s";
  const normalized = extractAlgoText(algo).toUpperCase().trim();
  return ALGO_UNITS[normalized] || "H/s";
}

/**
 * Get MRR-specific unit for an algorithm
 * @param {string} algo - Algorithm name
 * @returns {string} MRR unit string
 */
export function getMrrAlgorithmUnit(algo) {
  if (!algo) return "TH";
  const normalized = extractAlgoText(algo).toUpperCase().trim();
  const niceHashAlgo = normalizeAlgoForNiceHash(normalized);
  return MRR_ALGO_UNITS[normalized] || MRR_ALGO_UNITS[niceHashAlgo] || "TH";
  
}

/**
 * Get display name for algorithm
 * @param {string} algo - Algorithm name
 * @returns {string} Human-readable algorithm name
 */
export const getAlgoDisplayName = (algo) => getAlgorithmDisplayName(algo);

export function getAlgorithmDisplayName(algo) {
  if (!algo) return "Unknown";
  const source = extractAlgoText(algo);
  const normalized = source.toUpperCase().trim();
  return ALGO_DISPLAY_NAMES[normalized] || source || "Unknown";
}

/**
 * Get algorithm category
 * @param {string} algo - Algorithm name
 * @returns {string} Category (ASIC, GPU, CPU, HYBRID, UNKNOWN)
 */
export function getAlgorithmCategory(algo) {
  if (!algo) return "UNKNOWN";
  const normalized = normalizeAlgoForNiceHash(algo);
  for (const [category, algos] of Object.entries(ALGO_CATEGORIES)) {
    if (algos.includes(normalized)) return category;
  }
  return "UNKNOWN";
}

/**
 * Get all algorithms in a specific category
 * @param {string} category - Category name
 * @returns {string[]} Array of algorithm names
 */
export function getAlgorithmsByCategory(category) {
  return ALGO_CATEGORIES[category] || [];
}

/**
 * Get profitability tier for a spread percentage
 * @param {number} spreadPct - Spread percentage
 * @returns {Object} Tier information
 */
export function getProfitabilityTier(spreadPct) {
  if (spreadPct === null || spreadPct === undefined) return null;
  const tiers = Object.entries(PROFITABILITY_TIERS).sort((a, b) => b[1].min - a[1].min);
  for (const [name, tier] of tiers) {
    if (spreadPct >= tier.min) return { name, ...tier };
  }
  return null;
}

/**
 * Calculate price comparison between two marketplaces
 * @param {number} yourPrice - Your price
 * @param {string} yourUnit - Your price unit
 * @param {number} marketPrice - Market price
 * @param {string} marketUnit - Market price unit
 * @param {boolean} isMrrVsNh - Whether comparing MRR vs NiceHash
 * @returns {number|null} Percentage difference
 */
export function calculatePriceComparison(
  yourPrice,
  yourUnit,
  marketPrice,
  marketUnit,
  isMrrVsNh = false,
) {
  if (!yourPrice || !marketPrice || yourPrice <= 0 || marketPrice <= 0)
    return null;

  const yourMultiplier = getUnitMultiplier(yourUnit);
  const marketMultiplier = getUnitMultiplier(marketUnit);
  if (yourMultiplier <= 0 || marketMultiplier <= 0) return null;

  // Prices are quoted per unit per day. Normalize both to price per H/s/day.
  const yourPerHash = parseFloat(yourPrice) / yourMultiplier;
  const marketPerHash = parseFloat(marketPrice) / marketMultiplier;

  if (yourPerHash <= 0 || marketPerHash <= 0) return null;

  if (isMrrVsNh) {
    return ((marketPerHash - yourPerHash) / yourPerHash) * 100;
  }

  return ((yourPerHash - marketPerHash) / marketPerHash) * 100;
}

/**
 * Format hashrate with appropriate unit
 * @param {number} hashrate - Hashrate in H/s
 * @param {string} algo - Algorithm name
 * @returns {string} Formatted hashrate (e.g., "1.5 TH/s")
 */
export function formatHashrate(hashrate, algo) {
  if (!hashrate || hashrate <= 0) return "0 H/s";
  
  const unit = getAlgorithmUnit(algo);
  const factor = UNIT_FACTORS[unit] || 1;
  const value = hashrate / factor;
  
  return `${value.toFixed(2)} ${unit}/s`;
}

/**
 * Get all supported algorithms
 * @returns {string[]} Array of supported algorithm names
 */
export function getAllSupportedAlgorithms() {
  return [...new Set([
    ...Object.keys(NICEHASH_ALGO_MAP),
    ...Object.values(NICEHASH_ALGO_MAP)
  ])].filter(algo => algo !== "UNKNOWN").sort();
}

/**
 * Check if algorithm is supported
 * @param {string} algo - Algorithm name
 * @returns {boolean} Whether the algorithm is supported
 */
export function isSupportedAlgorithm(algo) {
  return normalizeAlgoForNiceHash(algo) !== "UNKNOWN";
}

/**
 * Get unit multiplier
 * @param {string} unit - Unit string
 * @returns {number} Multiplier value
 */
function getUnitMultiplier(unit) {
  const normalized = String(unit || "")
    .toUpperCase()
    .replace(/\/S$/i, "")
    .trim();
  return HASHRATE_SUFFIXES[normalized] || 1;
}

/**
 * Check if algorithm is SHA256 AsicBoost
 * @param {string} algo - Algorithm name
 * @returns {boolean} True if algorithm is SHA256 AsicBoost
 */
export function isAsicBoost(algo) {
    if (!algo) return false;
    const normalized = String(algo).toUpperCase().trim();
    return normalized.includes('SHA256AB') ||
           normalized.includes('ASICBOOST') ||
           normalized === 'SHA256ASICBOOST';
}

/**
 * Get MRR algorithm key (handles special cases like SHA256AB)
 * @param {string} algo - Algorithm name
 * @returns {string} MRR algorithm key
 */
export function getMrrAlgoKey(algo) {
    if (!algo) return 'unknown';
    
    const normalized = String(algo).toUpperCase().trim();
    
    // Direct mapping from MRR_ALGO_MAP
    if (MRR_ALGO_MAP[normalized]) {
      return MRR_ALGO_MAP[normalized];
    }
    
    // Handle special cases
    if (normalized.includes('SHA256AB') || normalized.includes('ASICBOOST')) {
      return 'sha256ab';
    }
    
    if (normalized.includes('SHA256')) {
      return 'sha256';
    }
    
    // Try to find by matching the normalized name to MRR keys
    for (const [key, mrrKey] of Object.entries(MRR_ALGO_MAP)) {
      if (normalized.includes(key) || key.includes(normalized)) {
        return mrrKey;
      }
    }
    
    // Fallback: just lowercase the input
    return String(algo).toLowerCase().trim();
}

/**
 * Build MRR API URL for algorithm rate
 * @param {string} algo - Algorithm name
 * @returns {string} Full MRR API URL
 */
export function buildMrrApiUrl(algo) {
  const mrrAlgo = getMrrAlgoKey(algo);
  return `https://www.miningrigrentals.com/api/v2/info/algos/${mrrAlgo}`;
}

/**
 * Fetch MRR market rate for a specific algorithm
 * @param {string} algo - Algorithm name
 * @param {string} currency - Currency to fetch (default: "BTC")
 * @returns {Promise<number>} Market rate or 0 if failed
 */
export async function fetchMrrMarketRate(algo, currency = "BTC") {
  try {
    const mrrAlgo = getMrrAlgoKey(algo);
    // Use the correct MRR API endpoint
    const url = `https://www.miningrigrentals.com/api/v2/info/algos/${mrrAlgo}`;
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    
    const data = await response.json();
    
    // Parse the response according to MRR API structure
    let price = 0;
    if (data.success && data.data) {
      // The MRR API returns price in data.suggested_price.amount
      if (data.data.suggested_price?.amount) {
        price = parseFloat(data.data.suggested_price.amount);
      } else if (data.data.price) {
        price = parseFloat(data.data.price);
      } else if (data.data[currency]) {
        price = parseFloat(data.data[currency]);
      }
      
      // If we have stats.prices, use those as fallback
      if (!price && data.data.stats?.prices) {
        const stats = data.data.stats.prices;
        price = parseFloat(stats.last?.price || stats.average?.price || stats.lowest?.price || 0);
      }
    } else if (data.price) {
      price = parseFloat(data.price);
    } else if (data[currency]) {
      price = parseFloat(data[currency]);
    }
    
    return price;
  } catch (error) {
    console.error(`Failed to fetch MRR rate for ${algo}:`, error);
    return 0;
  }
}

/**
 * Fetch all MRR market rates with caching
 * @param {string} currency - Currency to fetch rates in (default: "BTC")
 * @param {boolean} forceRefresh - Force refresh the cache
 * @returns {Promise<Object|null>} All market rates or null if failed
 */
const mrrRatesCache = new Map();
const MRR_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function fetchAllMrrRates(currency = "BTC", forceRefresh = false) {
  const cacheKey = `all_rates_${currency}`;
  const cached = mrrRatesCache.get(cacheKey);
  const now = Date.now();
  
  if (!forceRefresh && cached && (now - cached.timestamp) < MRR_CACHE_TTL) {
    return cached.data;
  }
  
  try {
    // Use the correct MRR API endpoint for all algos
    const url = `https://www.miningrigrentals.com/api/v2/info/algos?currency=${currency}`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success && data.data) {
      // Parse all algos data
      const algos = Array.isArray(data.data) ? data.data : [data.data];
      const result = {};
      
      for (const algo of algos) {
        const algoName = algo.name || algo.algo || '';
        if (!algoName) continue;
        
        let price = 0;
        if (algo.suggested_price?.amount) {
          price = parseFloat(algo.suggested_price.amount);
        } else if (algo.price) {
          price = parseFloat(algo.price);
        } else if (algo[currency]) {
          price = parseFloat(algo[currency]);
        }
        
        if (price > 0) {
          result[algoName] = {
            price,
            unit: algo.suggested_price?.unit || algo.unit || 'TH',
            currency: currency,
            display: algo.display || algoName,
            stats: algo.stats
          };
        }
      }
      
      // Cache the result
      mrrRatesCache.set(cacheKey, {
        data: result,
        timestamp: now
      });
      
      return result;
    }
    
    return null;
  } catch (error) {
    console.error("Failed to fetch MRR rates:", error);
    return null;
  }
}
export const normalizeAlgo = normalizeAlgoForNiceHash;

/**
 * Get MRR rate for a specific algorithm with fallback
 * @param {string} algo - Algorithm name
 * @param {string} currency - Currency (default: "BTC")
 * @returns {Promise<number>} Market rate
 */
export async function getMrrRate(algo, currency = "BTC") {
  try {
    const rate = await fetchMrrMarketRate(algo, currency);
    if (rate > 0) return rate;
    
    // Try all rates cache
    const allRates = await fetchAllMrrRates(currency);
    if (allRates) {
      const mrrAlgo = getMrrAlgoKey(algo);
      const found = allRates[mrrAlgo] || allRates[algo];
      if (found && found.price > 0) return found.price;
    }
    
    // Try with different algorithm variations
    const variations = [
      algo,
      algo.toUpperCase(),
      algo.toLowerCase(),
      normalizeAlgoForNiceHash(algo)
    ];
    
    for (const variant of variations) {
      const rate = await fetchMrrMarketRate(variant, currency);
      if (rate > 0) return rate;
    }
    
    return 0;
  } catch (error) {
    console.error(`Failed to get MRR rate for ${algo}:`, error);
    return 0;
  }
}
