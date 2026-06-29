// mapping.js - CONSOLIDATED (FIXED)

/**
 * The single source of truth for all algorithm-related data.
 * Each key is a normalized MRR algorithm name.
 * - `displayName`: The user-friendly name.
 * - `niceHash`: The corresponding NiceHash algorithm enum name.
 * - `unit`: The hashrate unit for MRR (e.g., 'GH', 'TH').
 */
export const ALGO_MAPPING = {
  "SHA256": {
    "displayName": "SHA256",
    "niceHash": "SHA256",
    "unit": "PH",
    "niceHashUnit": "EH",
    "mrrUnit": "PH"
  },
  "SHA256ASICBOOST": {
    "displayName": "SHA256AsicBoost",
    "niceHash": "SHA256ASICBOOST",
    "unit": "PH",
    "niceHashUnit": "EH",
    "mrrUnit": "PH"
  },
  "SCRYPT": {
    "displayName": "Scrypt",
    "niceHash": "SCRYPT",
    "unit": "GH",
    "niceHashUnit": "TH",
    "mrrUnit": "GH"
  },
  "SCRYPTN": {
    "displayName": "Scrypt-N",
    "niceHash": "SCRYPTN",
    "unit": "MH",
    "niceHashUnit": "TH",
    "mrrUnit": "MH"
  },
  "NEOSCRYPT": {
    "displayName": "NeoScrypt",
    "niceHash": "NEOSCRYPT",
    "unit": "MH",
    "niceHashUnit": "TH",
    "mrrUnit": "MH"
  },
  "RANDOMXMONERO": {
    "displayName": "RandomX",
    "niceHash": "RANDOMXMONERO",
    "unit": "MH",
    "niceHashUnit": "GH",
    "mrrUnit": "MH"
  },
  "KAWPOW": {
    "displayName": "KawPow",
    "niceHash": "KAWPOW",
    "unit": "GH",
    "niceHashUnit": "TH",
    "mrrUnit": "GH"
  },
  "DAGGERHASHIMOTO": {
    "displayName": "DaggerHashimoto",
    "niceHash": "DAGGERHASHIMOTO",
    "unit": "MH",
    "niceHashUnit": "TH",
    "mrrUnit": "MH"
  },
  "ETCHASH": {
    "displayName": "ETCHash",
    "niceHash": "ETCHASH",
    "unit": "MH",
    "niceHashUnit": "TH",
    "mrrUnit": "MH"
  },
  "EQUIHASH": {
    "displayName": "Equihash",
    "niceHash": "EQUIHASH",
    "unit": "KH",
    "niceHashUnit": "GSol",
    "mrrUnit": "KH"
  },
  "CRYPTONIGHT": {
    "displayName": "CryptoNight",
    "niceHash": "CRYPTONIGHT",
    "unit": "MH",
    "niceHashUnit": "TH",
    "mrrUnit": "MH"
  },
  "CRYPTONIGHTV7": {
    "displayName": "CryptoNightV7",
    "niceHash": "CRYPTONIGHTV7",
    "unit": "MH",
    "niceHashUnit": "TH",
    "mrrUnit": "MH"
  },
  "CRYPTONIGHTV8": {
    "displayName": "CryptoNightV8",
    "niceHash": "CRYPTONIGHTV8",
    "unit": "MH",
    "niceHashUnit": "TH",
    "mrrUnit": "MH"
  },
  "CRYPTONIGHTR": {
    "displayName": "CryptoNightR",
    "niceHash": "CRYPTONIGHTR",
    "unit": "MH",
    "niceHashUnit": "TH",
    "mrrUnit": "MH"
  },
  "CRYPTONIGHTHEAVY": {
    "displayName": "CryptoNightHeavy",
    "niceHash": "CRYPTONIGHTHEAVY",
    "unit": "MH",
    "niceHashUnit": "TH",
    "mrrUnit": "MH"
  },
  "X11": {
    "displayName": "X11",
    "niceHash": "X11",
    "unit": "GH",
    "niceHashUnit": "PH",
    "mrrUnit": "GH"
  },
  "X13": {
    "displayName": "X13",
    "niceHash": "X13",
    "unit": "GH",
    "niceHashUnit": "PH",
    "mrrUnit": "GH"
  },
  "X15": {
    "displayName": "X15",
    "niceHash": "X15",
    "unit": "GH",
    "niceHashUnit": "PH",
    "mrrUnit": "GH"
  },
  "X16R": {
    "displayName": "X16R",
    "niceHash": "X16R",
    "unit": "GH",
    "niceHashUnit": "PH",
    "mrrUnit": "GH"
  },
  "X16RV2": {
    "displayName": "X16Rv2",
    "niceHash": "X16RV2",
    "unit": "GH",
    "niceHashUnit": "PH",
    "mrrUnit": "GH"
  },
  "X11GOST": {
    "displayName": "X11Gost",
    "niceHash": "X11GOST",
    "unit": "GH",
    "niceHashUnit": "PH",
    "mrrUnit": "GH"
  },
  "LYRA2RE": {
    "displayName": "Lyra2RE",
    "niceHash": "LYRA2RE",
    "unit": "MH",
    "niceHashUnit": "TH",
    "mrrUnit": "MH"
  },
  "LYRA2REV2": {
    "displayName": "Lyra2REv2",
    "niceHash": "LYRA2REV2",
    "unit": "MH",
    "niceHashUnit": "TH",
    "mrrUnit": "MH"
  },
  "LYRA2REV3": {
    "displayName": "Lyra2REv3",
    "niceHash": "LYRA2REV3",
    "unit": "MH",
    "niceHashUnit": "TH",
    "mrrUnit": "MH"
  },
  "LYRA2Z": {
    "displayName": "Lyra2Z",
    "niceHash": "LYRA2Z",
    "unit": "MH",
    "niceHashUnit": "TH",
    "mrrUnit": "MH"
  },
  "BLAKE256R8": {
    "displayName": "Blake (256r8)",
    "niceHash": "BLAKE256R8",
    "unit": "MH",
    "niceHashUnit": "TH",
    "mrrUnit": "MH"
  },
  "BLAKE256R14": {
    "displayName": "Blake (256r14)",
    "niceHash": "BLAKE256R14",
    "unit": "MH",
    "niceHashUnit": "TH",
    "mrrUnit": "MH"
  },
  "BLAKE2S": {
    "displayName": "Blake (2s)",
    "niceHash": "BLAKE2S",
    "unit": "TH",
    "niceHashUnit": "TH",
    "mrrUnit": "TH"
  },
  "KECCAK": {
    "displayName": "Keccak",
    "niceHash": "KECCAK",
    "unit": "GH",
    "niceHashUnit": "TH",
    "mrrUnit": "GH"
  },
  "NIST5": {
    "displayName": "Nist5",
    "niceHash": "NIST5",
    "unit": "GH",
    "niceHashUnit": "TH",
    "mrrUnit": "GH"
  },
  "QUBIT": {
    "displayName": "Qubit",
    "niceHash": "QUBIT",
    "unit": "GH",
    "niceHashUnit": "TH",
    "mrrUnit": "GH"
  },
  "QUARK": {
    "displayName": "Quark",
    "niceHash": "QUARK",
    "unit": "GH",
    "niceHashUnit": "TH",
    "mrrUnit": "GH"
  },
  "WHIRLPOOLX": {
    "displayName": "WhirlpoolX",
    "niceHash": "WHIRLPOOLX",
    "unit": "GH",
    "niceHashUnit": "TH",
    "mrrUnit": "GH"
  },
  "DECRED": {
    "displayName": "Decred",
    "niceHash": "DECRED",
    "unit": "GH",
    "niceHashUnit": "TH",
    "mrrUnit": "GH"
  },
  "SIA": {
    "displayName": "Sia",
    "niceHash": "SIA",
    "unit": "GH",
    "niceHashUnit": "TH",
    "mrrUnit": "GH"
  },
  "LBRY": {
    "displayName": "LBRY",
    "niceHash": "LBRY",
    "unit": "GH",
    "niceHashUnit": "TH",
    "mrrUnit": "GH"
  },
  "PASCAL": {
    "displayName": "Pascal",
    "niceHash": "PASCAL",
    "unit": "GH",
    "niceHashUnit": "TH",
    "mrrUnit": "GH"
  },
  "ZHASH": {
    "displayName": "ZHash",
    "niceHash": "ZHASH",
    "unit": "KH",
    "niceHashUnit": "MSol",
    "mrrUnit": "KH"
  },
  "BEAM": {
    "displayName": "Beam",
    "niceHash": "BEAM",
    "unit": "KH",
    "niceHashUnit": "MSol",
    "mrrUnit": "KH"
  },
  "BEAMV2": {
    "displayName": "BeamV2",
    "niceHash": "BEAMV2",
    "unit": "KH",
    "niceHashUnit": "MSol",
    "mrrUnit": "KH"
  },
  "BEAMV3": {
    "displayName": "BeamV3",
    "niceHash": "BEAMV3",
    "unit": "KH",
    "niceHashUnit": "MSol",
    "mrrUnit": "KH"
  },
  "GRINCUCKAROO29": {
    "displayName": "GrinCuckaroo29",
    "niceHash": "GRINCUCKAROO29",
    "unit": "Graph",
    "niceHashUnit": "Graph",
    "mrrUnit": "Graph"
  },
  "GRINCUCKATOO31": {
    "displayName": "GrinCuckatoo31",
    "niceHash": "GRINCUCKATOO31",
    "unit": "Graph",
    "niceHashUnit": "Graph",
    "mrrUnit": "Graph"
  },
  "GRINCUCKATOO32": {
    "displayName": "GrinCuckatoo32",
    "niceHash": "GRINCUCKATOO32",
    "unit": "Graph",
    "niceHashUnit": "Graph",
    "mrrUnit": "Graph"
  },
  "CUCKOOCYCLE": {
    "displayName": "CuckooCycle",
    "niceHash": "CUCKOOCYCLE",
    "unit": "Graph",
    "niceHashUnit": "Graph",
    "mrrUnit": "Graph"
  },
  "HANDSHAKE": {
    "displayName": "Handshake",
    "niceHash": "HANDSHAKE",
    "unit": "TH",
    "niceHashUnit": "TH",
    "mrrUnit": "TH"
  },
  "AUTOLYKOS": {
    "displayName": "Autolykos",
    "niceHash": "AUTOLYKOS",
    "unit": "GH",
    "niceHashUnit": "TH",
    "mrrUnit": "GH"
  },
  "OCTOPUS": {
    "displayName": "Octopus",
    "niceHash": "OCTOPUS",
    "unit": "GH",
    "niceHashUnit": "TH",
    "mrrUnit": "GH"
  },
  "VERUSHASH": {
    "displayName": "VerusHash",
    "niceHash": "VERUSHASH",
    "unit": "GH",
    "niceHashUnit": "TH",
    "mrrUnit": "GH"
  },
  "KHEAVYHASH": {
    "displayName": "kHeavyHash",
    "niceHash": "KHEAVYHASH",
    "unit": "TH",
    "niceHashUnit": "EH",
    "mrrUnit": "TH"
  },
  "NEXAPOW": {
    "displayName": "NexaPow",
    "niceHash": "NEXAPOW",
    "unit": "GH",
    "niceHashUnit": "TH",
    "mrrUnit": "GH"
  },
  "ALEPHIUM": {
    "displayName": "Alephium",
    "niceHash": "ALEPHIUM",
    "unit": "GH",
    "niceHashUnit": "PH",
    "mrrUnit": "GH"
  },
  "FISHHASH": {
    "displayName": "FishHash",
    "niceHash": "FISHHASH",
    "unit": "GH",
    "niceHashUnit": "TH",
    "mrrUnit": "GH"
  },
  "IRONFISH": {
    "displayName": "IronFish",
    "niceHash": "IRONFISH",
    "unit": "GH",
    "niceHashUnit": "TH",
    "mrrUnit": "GH"
  },
  "KARLSENHASH": {
    "displayName": "KarlsenHash",
    "niceHash": "KARLSENHASH",
    "unit": "GH",
    "niceHashUnit": "TH",
    "mrrUnit": "GH"
  },
  "PYRINHASH": {
    "displayName": "PyrinHash",
    "niceHash": "PYRINHASH",
    "unit": "GH",
    "niceHashUnit": "TH",
    "mrrUnit": "GH"
  },
  "EAGLESONG": {
    "displayName": "Eaglesong",
    "niceHash": "EAGLESONG",
    "unit": "TH",
    "niceHashUnit": "EH",
    "mrrUnit": "TH"
  },
  "HODL": {
    "displayName": "HODL",
    "niceHash": "HODL",
    "unit": "Sol",
    "niceHashUnit": "Sol",
    "mrrUnit": "Sol"
  },
  "MTP": {
    "displayName": "MTP",
    "niceHash": "MTP",
    "unit": "MH",
    "niceHashUnit": "TH",
    "mrrUnit": "MH"
  },
  "SKUNK": {
    "displayName": "Skunk",
    "niceHash": "SKUNK",
    "unit": "MH",
    "niceHashUnit": "TH",
    "mrrUnit": "MH"
  },
  "AXIOM": {
    "displayName": "Axiom",
    "niceHash": "AXIOM",
    "unit": "MH",
    "niceHashUnit": "TH",
    "mrrUnit": "MH"
  },
  "SCRYPTJANENX16": {
    "displayName": "ScryptJaneN16",
    "niceHash": "SCRYPTJANENX16",
    "unit": "kH",
    "niceHashUnit": "TH",
    "mrrUnit": "kH"
  },
  "BLAKE256R8VNL": {
    "displayName": "Blake (256r8vnl)",
    "niceHash": "BLAKE256R8VNL",
    "unit": "MH",
    "niceHashUnit": "TH",
    "mrrUnit": "MH"
  },
  "SHA256AB": {
    "displayName": "SHA256AsicBoost",
    "niceHash": "SHA256ASICBOOST",
    "unit": "TH"
  },
  "HASHIMOTOS": {
    "displayName": "DaggerHashimoto",
    "niceHash": "DAGGERHASHIMOTO",
    "unit": "MH"
  },
  "ETHASH": {
    "displayName": "DaggerHashimoto",
    "niceHash": "DAGGERHASHIMOTO",
    "unit": "MH"
  },
  "RANDOMX": {
    "displayName": "RandomX",
    "niceHash": "RANDOMXMONERO",
    "unit": "kH"
  },
  "KASPA": {
    "displayName": "kHeavyHash",
    "niceHash": "KHEAVYHASH",
    "unit": "TH"
  }
};

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