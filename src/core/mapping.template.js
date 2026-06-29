// mapping.js - CONSOLIDATED (FIXED)

/**
 * The single source of truth for all algorithm-related data.
 * Each key is a normalized MRR algorithm name.
 * - `displayName`: The user-friendly name.
 * - `niceHash`: The corresponding NiceHash algorithm enum name.
 * - `unit`: The hashrate unit for MRR (e.g., 'GH', 'TH').
 */
export const ALGO_MAPPING = __ALGO_MAPPING_PLACEHOLDER__;

/**
 * Hashrate unit multipliers relative to H/s.
 */
export const HASHRATE_SUFFIXES = {
  H: 1,
  K: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  P: 1e15,
  E: 1e18,
  KH: 1e3,
  MH: 1e6,
  GH: 1e9,
  TH: 1e12,
  PH: 1e15,
  EH: 1e18,
};

/** Power factor mapping for normalization (EH/s base) */
export const UNIT_TO_POWER = {
  EH: 0,
  PH: -3,
  TH: -6,
  GH: -9,
  MH: -12,
  GSOL: -9,
  MSOL: -12,
  E: 0,
  P: -3,
  T: -6,
  G: -9,
  M: -12,
};

/**
 * Multipliers for converting between hashrate price units.
 */
export const PRICE_UNIT_MULTIPLIER = {
  H: 1,
  KH: 1e3,
  MH: 1e6,
  GH: 1e9,
  TH: 1e12,
  PH: 1e15,
  EH: 1e18,
  SOL: 1,
  KSOL: 1e3,
  MSOL: 1e6,
  GSOL: 1e9,
};

export const getPriceUnit = (algo, source) => {
  const mapping = getAlgoMapping(algo);
  return source === 'nh' ? mapping.nhPriceUnit : mapping.mrrUnit;
};

// ============================================
// ✅ CORE FUNCTIONS
// ============================================

/**
 * Normalizes an algorithm name from any source (MRR, NiceHash) to a consistent uppercase key.
 * @param {string} algoName - The raw algorithm name.
 * @returns {string} The normalized algorithm key, or the original name if no match is found.
 */
export function normalizeAlgo(algoName) {
  if (!algoName) return 'UNKNOWN';
  const upper = String(algoName).toUpperCase().replace(/[-_\s]/g, '');

  // Direct match
  if (ALGO_MAPPING[upper]) {
    return upper;
  }

  // Check display names and nicehash names for a reverse match
  for (const key in ALGO_MAPPING) {
    const mapping = ALGO_MAPPING[key];
    if (
      mapping.displayName.toUpperCase().replace(/[-_\s]/g, '') === upper ||
      mapping.niceHash.toUpperCase().replace(/[-_\s]/g, '') === upper
    ) {
      return key;
    }
  }

  return upper || 'UNKNOWN';
}

/**
 * Safely retrieves the mapping object for a given algorithm, normalizing the name first.
 * @param {string} algoName - The raw algorithm name.
 * @returns {{displayName: string, niceHash: string, unit: string, niceHashUnit?: string, mrrUnit?: string}} The mapping object or a default.
 */
export function getAlgoMapping(algoName) {
  const key = normalizeAlgo(algoName);
  return ALGO_MAPPING[key] || { 
    displayName: String(algoName || 'Unknown'), 
    niceHash: 'UNKNOWN', 
    unit: 'H',
    niceHashUnit: 'H',
    mrrUnit: 'H'
  };
}

/**
 * Gets the user-friendly display name for an algorithm.
 * @param {string} algoName - The raw algorithm name.
 * @returns {string} The display name, or the original if not found.
 */
export function getAlgoDisplayName(algoName) {
  const mapping = getAlgoMapping(algoName);
  return mapping.displayName || String(algoName || 'Unknown');
}

/**
 * Gets the default hashrate unit for an algorithm.
 * @param {string} algoName - The raw algorithm name.
 * @returns {string} The unit, or 'H' if not found.
 */
export function getAlgorithmUnit(algoName) {
  const mapping = getAlgoMapping(algoName);
  return mapping.unit || 'H';
}

/**
 * Gets the NiceHash-specific unit for an algorithm.
 * @param {string} algoName - The raw algorithm name.
 * @returns {string} The NiceHash unit, or the default unit if not specified.
 */
export function getNiceHashUnit(algoName) {
  const mapping = getAlgoMapping(algoName);
  return mapping.niceHashUnit || mapping.unit || 'H';
}

/**
 * Gets the MRR-specific unit for an algorithm.
 * @param {string} algoName - The raw algorithm name.
 * @returns {string} The MRR unit, or the default unit if not specified.
 */
export function getMrrUnit(algoName) {
  const mapping = getAlgoMapping(algoName);
  return mapping.mrrUnit || mapping.unit || 'H';
}

/**
 * Gets the corresponding NiceHash algorithm name for a given algorithm.
 * @param {string} algoName - The raw algorithm name.
 * @returns {string} The NiceHash algorithm name, or 'UNKNOWN'.
 */
export function normalizeAlgoForNiceHash(algoName) {
  const mapping = getAlgoMapping(algoName);
  return mapping.niceHash || 'UNKNOWN';
}

/**
 * Gets the hashrate unit for a given MRR algorithm (alias for getMrrUnit).
 * @param {string} algoName - The raw algorithm name.
 * @returns {string} The hashrate unit (e.g., 'GH', 'TH'), or an empty string.
 */
export function getMrrAlgorithmUnit(algoName) {
  return getMrrUnit(algoName);
}

/**
 * Maps a NiceHash algorithm name to an MRR algorithm key.
 * @param {string} niceHashAlgo - The NiceHash algorithm name.
 * @returns {string} The MRR algorithm key, or 'UNKNOWN'.
 */
export function mapNiceHashToMRR(niceHashAlgo) {
  if (!niceHashAlgo) return 'UNKNOWN';
  
  const normalized = String(niceHashAlgo).toUpperCase().replace(/[-_\s]/g, '');
  
  // Find the MRR key by matching the niceHash field
  for (const [key, mapping] of Object.entries(ALGO_MAPPING)) {
    if (mapping.niceHash.toUpperCase().replace(/[-_\s]/g, '') === normalized) {
      return key;
    }
  }
  
  // If not found by niceHash, try direct key match
  if (ALGO_MAPPING[normalized]) {
    return normalized;
  }
  
  return 'UNKNOWN';
}

/**
 * Checks if an algorithm supports ASIC Boost.
 * @param {string} algoName - The raw algorithm name.
 * @returns {boolean} True if the algorithm supports ASIC Boost.
 */
export function isAsicBoost(algoName) {
  if (!algoName) return false;
  const normalized = normalizeAlgo(algoName);
  return normalized === 'SHA256ASICBOOST' || 
         normalized === 'SHA256AB' ||
         normalized === 'SHA256';
}

// ============================================
// ✅ UNIT CONVERSION HELPERS
// ============================================

/**
 * Converts a price from one unit to another.
 * @param {number} price - The price to convert.
 * @param {string} from - The source unit (e.g., 'MH').
 * @param {string} to - The target unit (e.g., 'TH').
 * @returns {number} The converted price.
 */
export function convertPrice(price, from, to) {
  const a = PRICE_UNIT_MULTIPLIER[String(from || 'H').toUpperCase()];
  const b = PRICE_UNIT_MULTIPLIER[String(to || 'H').toUpperCase()];

  if (!a || !b || a === b) return price;
  // Correct logic: To convert from a smaller unit (MH) to a larger one (TH),
  // the price must decrease. e.g., 10 BTC/MH -> 10 * (1e6 / 1e12) = 0.00001 BTC/TH
  return price * (a / b);
}

/**
 * Converts a value from NiceHash unit to MRR unit for a given algorithm.
 * @param {number} value - The value to convert.
 * @param {string} algoName - The algorithm name.
 * @returns {number} The converted value in MRR units.
 */
export function convertNiceHashToMrr(value, algoName) {
  if (!value || value <= 0) return 0;
  const fromUnit = getNiceHashUnit(algoName);
  const toUnit = getMrrUnit(algoName);
  
  if (fromUnit === toUnit) return value;
  
  const fromMultiplier = HASHRATE_SUFFIXES[fromUnit] || 1;
  const toMultiplier = HASHRATE_SUFFIXES[toUnit] || 1;
  
  return (value * fromMultiplier) / toMultiplier;
}

/**
 * Converts a value from MRR unit to NiceHash unit for a given algorithm.
 * @param {number} value - The value to convert.
 * @param {string} algoName - The algorithm name.
 * @returns {number} The converted value in NiceHash units.
 */
export function convertMrrToNiceHash(value, algoName) {
  if (!value || value <= 0) return 0;
  const fromUnit = getMrrUnit(algoName);
  const toUnit = getNiceHashUnit(algoName);
  
  if (fromUnit === toUnit) return value;
  
  const fromMultiplier = HASHRATE_SUFFIXES[fromUnit] || 1;
  const toMultiplier = HASHRATE_SUFFIXES[toUnit] || 1;
  
  return (value * fromMultiplier) / toMultiplier;
}

/**
 * Converts a value between any two units.
 * @param {number} value - The value to convert.
 * @param {string} fromUnit - The source unit.
 * @param {string} toUnit - The target unit.
 * @returns {number} The converted value.
 */
export function convertUnit(value, fromUnit, toUnit) {
  if (!value || value <= 0) return 0;
  if (fromUnit === toUnit) return value;
  
  const fromMultiplier = HASHRATE_SUFFIXES[fromUnit] || 1;
  const toMultiplier = HASHRATE_SUFFIXES[toUnit] || 1;
  
  return (value * fromMultiplier) / toMultiplier;
}

/**
 * Normalizes a value to a standard unit for comparison.
 * @param {number} value - The value to normalize.
 * @param {string} unit - The unit of the value.
 * @param {string} targetUnit - The target unit for normalization.
 * @returns {number} The normalized value.
 */
export function normalizeValue(value, unit, targetUnit = 'H') {
  if (!value || value <= 0) return 0;
  const fromMultiplier = HASHRATE_SUFFIXES[unit] || 1;
  const toMultiplier = HASHRATE_SUFFIXES[targetUnit] || 1;
  return (value * fromMultiplier) / toMultiplier;
}

/**
 * Calculates the price difference between an MRR rental and a NiceHash order,
 * automatically handling unit conversion.
 * @param {number} mrrPrice - MRR price.
 * @param {string} mrrAlgo - MRR algorithm name.
 * @param {number} nhPrice - NiceHash price.
 * @param {string} nhAlgo - NiceHash algorithm name.
 * @returns {number|null} The percentage difference, or null if inputs are invalid.
 */
export function calculatePriceComparison(mrrPrice, mrrAlgo, nhPrice, nhAlgo) {
  const nhPriceNum = Number.parseFloat(nhPrice || 0);
  const mrrPriceNum = Number.parseFloat(mrrPrice || 0);

  if (nhPriceNum <= 0 || mrrPriceNum <= 0) return null;

  // Get units for each
  const mrrUnit = getMrrUnit(mrrAlgo);
  const nhUnit = getNiceHashUnit(nhAlgo);
  
  // Normalize both to H/s for comparison
  const mrrPriceNorm = normalizeValue(mrrPriceNum, mrrUnit, 'H');
  const nhPriceNorm = normalizeValue(nhPriceNum, nhUnit, 'H');

  if (nhPriceNorm > 0) {
    return ((mrrPriceNorm - nhPriceNorm) / nhPriceNorm) * 100;
  }
  return null;
}

// ============================================
// DEPRECATED: Backward compatibility
// ============================================
export const ALGO_DISPLAY_NAMES = Object.fromEntries(
  Object.values(ALGO_MAPPING).map(v => [v.niceHash, v.displayName])
);

export const MRR_ALGO_MAP = Object.fromEntries(
  Object.entries(ALGO_MAPPING).map(([key, value]) => [key, value.niceHash])
);

export const NICEHASH_ALGO_MAP = Object.fromEntries(
  Object.values(ALGO_MAPPING).map(v => [v.niceHash, v.niceHash])
);