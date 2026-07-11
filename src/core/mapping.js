// mapping.js - COMPLETE CLEAN VERSION

/**
 * Hashrate unit multipliers relative to H/s.
 */
export const HASHRATE_SUFFIXES = {
  H: 1, K: 1e3, M: 1e6, G: 1e9, T: 1e12, P: 1e15, E: 1e18,
  KH: 1e3, MH: 1e6, GH: 1e9, TH: 1e12, PH: 1e15, EH: 1e18,
  Sol: 1, Graph: 1, kH: 1e3, MSol: 1e6, GSol: 1e9,
  KSOL: 1e3, GSOL: 1e9, MSOL: 1e6, SOL: 1,
};

/**
 * Power factor mapping for normalization (EH/s base)
 */
export const UNIT_TO_POWER = {
  EH: 0, PH: -3, TH: -6, GH: -9, MH: -12, KH: -15, H: -18,
  GSOL: -9, MSOL: -12, KSOL: -15, SOL: -18,
  E: 0, P: -3, T: -6, G: -9, M: -12, K: -15,
  EHS: 0, PHS: -3, THS: -6, GHS: -9, MHS: -12, KHS: -15,
};

/**
 * Price unit multipliers for conversion
 */
export const PRICE_UNIT_MULTIPLIER = {
  H: 1, KH: 1e3, MH: 1e6, GH: 1e9, TH: 1e12, PH: 1e15, EH: 1e18,
  SOL: 1, KSOL: 1e3, MSOL: 1e6, GSOL: 1e9,
};

// ============================================
// ALGO MAPPING - 1 LINE PER ALGORITHM
// ============================================

export const ALGO_MAPPING = {
  // SHA256 family
  SHA256: { displayName: 'SHA256', niceHash: 'SHA256', unit: 'PH', niceHashUnit: 'EH', mrrUnit: 'PH' },
  SHA256ASICBOOST: { displayName: 'SHA256AsicBoost', niceHash: 'SHA256ASICBOOST', unit: 'PH', niceHashUnit: 'EH', mrrUnit: 'PH' },
  'SHA256AB': { displayName: 'SHA256AsicBoost', niceHash: 'SHA256ASICBOOST', unit: 'PH', niceHashUnit: 'EH', mrrUnit: 'PH' },

  // Scrypt family
  SCRYPT: { displayName: 'Scrypt', niceHash: 'SCRYPT', unit: 'GH', niceHashUnit: 'TH', mrrUnit: 'GH' },
  SCRYPTN: { displayName: 'Scrypt-N', niceHash: 'SCRYPTN', unit: 'MH', niceHashUnit: 'TH', mrrUnit: 'MH' },
  NEOSCRYPT: { displayName: 'NeoScrypt', niceHash: 'NEOSCRYPT', unit: 'MH', niceHashUnit: 'TH', mrrUnit: 'MH' },

  // RandomX
  RANDOMXMONERO: { displayName: 'RandomX', niceHash: 'RANDOMXMONERO', unit: 'MH', niceHashUnit: 'GH', mrrUnit: 'MH' },
  'RANDOMX': { displayName: 'RandomX', niceHash: 'RANDOMXMONERO', unit: 'MH', niceHashUnit: 'GH', mrrUnit: 'MH' },

  // KawPow
  KAWPOW: { displayName: 'KawPow', niceHash: 'KAWPOW', unit: 'GH', niceHashUnit: 'TH', mrrUnit: 'GH' },

  // DaggerHashimoto / Ethash
  DAGGERHASHIMOTO: { displayName: 'DaggerHashimoto', niceHash: 'DAGGERHASHIMOTO', unit: 'MH', niceHashUnit: 'TH', mrrUnit: 'MH' },
  'ETHASH': { displayName: 'DaggerHashimoto', niceHash: 'DAGGERHASHIMOTO', unit: 'MH', niceHashUnit: 'TH', mrrUnit: 'MH' },
  'HASHIMOTOS': { displayName: 'DaggerHashimoto', niceHash: 'DAGGERHASHIMOTO', unit: 'MH', niceHashUnit: 'TH', mrrUnit: 'MH' },

  // Etchash
  ETCHASH: { displayName: 'ETCHash', niceHash: 'ETCHASH', unit: 'MH', niceHashUnit: 'TH', mrrUnit: 'MH' },

  // Equihash
  EQUIHASH: { displayName: 'Equihash', niceHash: 'EQUIHASH', unit: 'Gsol', niceHashUnit: 'GSol', mrrUnit: 'GSol' },

  // CryptoNight family
  CRYPTONIGHT: { displayName: 'CryptoNight', niceHash: 'CRYPTONIGHT', unit: 'MH', niceHashUnit: 'TH', mrrUnit: 'MH' },
  CRYPTONIGHTV7: { displayName: 'CryptoNightV7', niceHash: 'CRYPTONIGHTV7', unit: 'MH', niceHashUnit: 'TH', mrrUnit: 'MH' },
  CRYPTONIGHTV8: { displayName: 'CryptoNightV8', niceHash: 'CRYPTONIGHTV8', unit: 'MH', niceHashUnit: 'TH', mrrUnit: 'MH' },
  CRYPTONIGHTR: { displayName: 'CryptoNightR', niceHash: 'CRYPTONIGHTR', unit: 'MH', niceHashUnit: 'TH', mrrUnit: 'MH' },
  CRYPTONIGHTHEAVY: { displayName: 'CryptoNightHeavy', niceHash: 'CRYPTONIGHTHEAVY', unit: 'MH', niceHashUnit: 'TH', mrrUnit: 'MH' },

  // X11 family
  X11: { displayName: 'X11', niceHash: 'X11', unit: 'GH', niceHashUnit: 'PH', mrrUnit: 'GH' },
  X13: { displayName: 'X13', niceHash: 'X13', unit: 'GH', niceHashUnit: 'PH', mrrUnit: 'GH' },
  X15: { displayName: 'X15', niceHash: 'X15', unit: 'GH', niceHashUnit: 'PH', mrrUnit: 'GH' },
  X16R: { displayName: 'X16R', niceHash: 'X16R', unit: 'GH', niceHashUnit: 'PH', mrrUnit: 'GH' },
  X16RV2: { displayName: 'X16Rv2', niceHash: 'X16RV2', unit: 'GH', niceHashUnit: 'PH', mrrUnit: 'GH' },
  X11GOST: { displayName: 'X11Gost', niceHash: 'X11GOST', unit: 'GH', niceHashUnit: 'PH', mrrUnit: 'GH' },

  // Lyra2 family
  LYRA2RE: { displayName: 'Lyra2RE', niceHash: 'LYRA2RE', unit: 'MH', niceHashUnit: 'TH', mrrUnit: 'MH' },
  LYRA2REV2: { displayName: 'Lyra2REv2', niceHash: 'LYRA2REV2', unit: 'MH', niceHashUnit: 'TH', mrrUnit: 'MH' },
  LYRA2REV3: { displayName: 'Lyra2REv3', niceHash: 'LYRA2REV3', unit: 'MH', niceHashUnit: 'TH', mrrUnit: 'MH' },
  LYRA2Z: { displayName: 'Lyra2Z', niceHash: 'LYRA2Z', unit: 'MH', niceHashUnit: 'TH', mrrUnit: 'MH' },

  // Blake family
  BLAKE256R8: { displayName: 'Blake (256r8)', niceHash: 'BLAKE256R8', unit: 'MH', niceHashUnit: 'TH', mrrUnit: 'MH' },
  BLAKE256R14: { displayName: 'Blake (256r14)', niceHash: 'BLAKE256R14', unit: 'MH', niceHashUnit: 'TH', mrrUnit: 'MH' },
  BLAKE2S: { displayName: 'Blake (2s)', niceHash: 'BLAKE2S', unit: 'TH', niceHashUnit: 'TH', mrrUnit: 'TH' },

  // Other algorithms
  KECCAK: { displayName: 'Keccak', niceHash: 'KECCAK', unit: 'GH', niceHashUnit: 'TH', mrrUnit: 'GH' },
  NIST5: { displayName: 'Nist5', niceHash: 'NIST5', unit: 'GH', niceHashUnit: 'TH', mrrUnit: 'GH' },
  QUBIT: { displayName: 'Qubit', niceHash: 'QUBIT', unit: 'GH', niceHashUnit: 'TH', mrrUnit: 'GH' },
  QUARK: { displayName: 'Quark', niceHash: 'QUARK', unit: 'GH', niceHashUnit: 'TH', mrrUnit: 'GH' },
  WHIRLPOOLX: { displayName: 'WhirlpoolX', niceHash: 'WHIRLPOOLX', unit: 'GH', niceHashUnit: 'TH', mrrUnit: 'GH' },
  DECRED: { displayName: 'Decred', niceHash: 'DECRED', unit: 'GH', niceHashUnit: 'TH', mrrUnit: 'GH' },
  SIA: { displayName: 'Sia', niceHash: 'SIA', unit: 'GH', niceHashUnit: 'TH', mrrUnit: 'GH' },
  LBRY: { displayName: 'LBRY', niceHash: 'LBRY', unit: 'GH', niceHashUnit: 'TH', mrrUnit: 'GH' },
  PASCAL: { displayName: 'Pascal', niceHash: 'PASCAL', unit: 'GH', niceHashUnit: 'TH', mrrUnit: 'GH' },

  // ZHash / Beam family
  ZHASH: { displayName: 'ZHash', niceHash: 'ZHASH', unit: 'KH', niceHashUnit: 'MSol', mrrUnit: 'KH' },
  BEAM: { displayName: 'Beam', niceHash: 'BEAM', unit: 'KH', niceHashUnit: 'MSol', mrrUnit: 'KH' },
  BEAMV2: { displayName: 'BeamV2', niceHash: 'BEAMV2', unit: 'KH', niceHashUnit: 'MSol', mrrUnit: 'KH' },
  BEAMV3: { displayName: 'BeamV3', niceHash: 'BEAMV3', unit: 'KH', niceHashUnit: 'MSol', mrrUnit: 'KH' },

  // Grin / Cuckoo family
  GRINCUCKAROO29: { displayName: 'GrinCuckaroo29', niceHash: 'GRINCUCKAROO29', unit: 'Graph', niceHashUnit: 'Graph', mrrUnit: 'Graph' },
  GRINCUCKATOO31: { displayName: 'GrinCuckatoo31', niceHash: 'GRINCUCKATOO31', unit: 'Graph', niceHashUnit: 'Graph', mrrUnit: 'Graph' },
  GRINCUCKATOO32: { displayName: 'GrinCuckatoo32', niceHash: 'GRINCUCKATOO32', unit: 'Graph', niceHashUnit: 'Graph', mrrUnit: 'Graph' },
  CUCKOOCYCLE: { displayName: 'CuckooCycle', niceHash: 'CUCKOOCYCLE', unit: 'Graph', niceHashUnit: 'Graph', mrrUnit: 'Graph' },

  // Modern algorithms
  HANDSHAKE: { displayName: 'Handshake', niceHash: 'HANDSHAKE', unit: 'TH', niceHashUnit: 'TH', mrrUnit: 'TH' },
  AUTOLYKOS: { displayName: 'Autolykos', niceHash: 'AUTOLYKOS', unit: 'GH', niceHashUnit: 'TH', mrrUnit: 'GH' },
  OCTOPUS: { displayName: 'Octopus', niceHash: 'OCTOPUS', unit: 'GH', niceHashUnit: 'TH', mrrUnit: 'GH' },
  VERUSHASH: { displayName: 'VerusHash', niceHash: 'VERUSHASH', unit: 'GH', niceHashUnit: 'TH', mrrUnit: 'GH' },
  KHEAVYHASH: { displayName: 'kHeavyHash', niceHash: 'KHEAVYHASH', unit: 'TH', niceHashUnit: 'EH', mrrUnit: 'TH' },
  'KASPA': { displayName: 'kHeavyHash', niceHash: 'KHEAVYHASH', unit: 'TH', niceHashUnit: 'EH', mrrUnit: 'TH' },
  NEXAPOW: { displayName: 'NexaPow', niceHash: 'NEXAPOW', unit: 'GH', niceHashUnit: 'TH', mrrUnit: 'GH' },
  ALEPHIUM: { displayName: 'Alephium', niceHash: 'ALEPHIUM', unit: 'GH', niceHashUnit: 'PH', mrrUnit: 'GH' },
  FISHHASH: { displayName: 'FishHash', niceHash: 'FISHHASH', unit: 'GH', niceHashUnit: 'TH', mrrUnit: 'GH' },
  IRONFISH: { displayName: 'IronFish', niceHash: 'IRONFISH', unit: 'GH', niceHashUnit: 'TH', mrrUnit: 'GH' },
  KARLSENHASH: { displayName: 'KarlsenHash', niceHash: 'KARLSENHASH', unit: 'GH', niceHashUnit: 'TH', mrrUnit: 'GH' },
  PYRINHASH: { displayName: 'PyrinHash', niceHash: 'PYRINHASH', unit: 'GH', niceHashUnit: 'TH', mrrUnit: 'GH' },
  EAGLESONG: { displayName: 'Eaglesong', niceHash: 'EAGLESONG', unit: 'TH', niceHashUnit: 'EH', mrrUnit: 'TH' },

  // Other
  HODL: { displayName: 'HODL', niceHash: 'HODL', unit: 'Sol', niceHashUnit: 'Sol', mrrUnit: 'Sol' },
  MTP: { displayName: 'MTP', niceHash: 'MTP', unit: 'MH', niceHashUnit: 'TH', mrrUnit: 'MH' },
  SKUNK: { displayName: 'Skunk', niceHash: 'SKUNK', unit: 'MH', niceHashUnit: 'TH', mrrUnit: 'MH' },
  AXIOM: { displayName: 'Axiom', niceHash: 'AXIOM', unit: 'MH', niceHashUnit: 'TH', mrrUnit: 'MH' },
  SCRYPTJANENX16: { displayName: 'ScryptJaneN16', niceHash: 'SCRYPTJANENX16', unit: 'kH', niceHashUnit: 'TH', mrrUnit: 'kH' },
  BLAKE256R8VNL: { displayName: 'Blake (256r8vnl)', niceHash: 'BLAKE256R8VNL', unit: 'MH', niceHashUnit: 'TH', mrrUnit: 'MH' },
};

// ============================================
// CORE FUNCTIONS
// ============================================

export function normalizeAlgo(algoName) {
  if (!algoName) return 'UNKNOWN';
  const upper = String(algoName).toUpperCase().replace(/[-_\s]/g, '');
  if (ALGO_MAPPING[upper]) return upper;
  for (const key in ALGO_MAPPING) {
    const mapping = ALGO_MAPPING[key];
    if (mapping.displayName.toUpperCase().replace(/[-_\s]/g, '') === upper ||
        mapping.niceHash.toUpperCase().replace(/[-_\s]/g, '') === upper) {
      return key;
    }
  }
  return upper || 'UNKNOWN';
}

export function getAlgoMapping(algoName) {
  const key = normalizeAlgo(algoName);
  return ALGO_MAPPING[key] || { displayName: String(algoName || 'Unknown'), niceHash: 'UNKNOWN', unit: 'H', niceHashUnit: 'H', mrrUnit: 'H' };
}

export function getAlgoDisplayName(algoName) {
  const mapping = getAlgoMapping(algoName);
  return mapping.displayName || String(algoName || 'Unknown');
}

export function getAlgorithmUnit(algoName) {
  const mapping = getAlgoMapping(algoName);
  return mapping.unit || 'H';
}

export function getNiceHashUnit(algoName) {
  const mapping = getAlgoMapping(algoName);
  return mapping.niceHashUnit || mapping.unit || 'H';
}

export function getMrrUnit(algoName) {
  const mapping = getAlgoMapping(algoName);
  return mapping.mrrUnit || mapping.unit || 'H';
}

export function getMrrAlgorithmUnit(algoName) {
  return getMrrUnit(algoName);
}

export function normalizeAlgoForNiceHash(algoName) {
  const mapping = getAlgoMapping(algoName);
  return mapping.niceHash || 'UNKNOWN';
}

export function mapNiceHashToMRR(niceHashAlgo) {
  if (!niceHashAlgo) return 'UNKNOWN';
  const normalized = String(niceHashAlgo).toUpperCase().replace(/[-_\s]/g, '');
  for (const [key, mapping] of Object.entries(ALGO_MAPPING)) {
    if (mapping.niceHash.toUpperCase().replace(/[-_\s]/g, '') === normalized) return key;
  }
  if (ALGO_MAPPING[normalized]) return normalized;
  return 'UNKNOWN';
}

export function isAsicBoost(algoName) {
  if (!algoName) return false;
  const normalized = normalizeAlgo(algoName);
  return normalized === 'SHA256ASICBOOST' || normalized === 'SHA256AB' || normalized === 'SHA256';
}

// ============================================
// UNIT CONVERSION HELPERS
// ============================================

export function cleanUnit(unit) {
  if (!unit) return 'H';
  const str = String(unit).toUpperCase().trim();
  const unitMap = {
    'EH': 'EH', 'PH': 'PH', 'TH': 'TH', 'GH': 'GH', 'MH': 'MH', 'KH': 'KH', 'H': 'H',
    'EHS': 'EH', 'PHS': 'PH', 'THS': 'TH', 'GHS': 'GH', 'MHS': 'MH', 'KHS': 'KH',
    'EH/S': 'EH', 'PH/S': 'PH', 'TH/S': 'TH', 'GH/S': 'GH', 'MH/S': 'MH', 'KH/S': 'KH', 'H/S': 'H',
    'EH/DAY': 'EH', 'PH/DAY': 'PH', 'TH/DAY': 'TH', 'GH/DAY': 'GH', 'MH/DAY': 'MH', 'KH/DAY': 'KH',
  };
  if (unitMap[str]) return unitMap[str];
  const match = str.match(/\b(EH|PH|TH|GH|MH|KH|H)\b/);
  return match ? match[1] : 'H';
}

export function convertPrice(price, from, to) {
  const a = PRICE_UNIT_MULTIPLIER[String(from || 'H').toUpperCase()];
  const b = PRICE_UNIT_MULTIPLIER[String(to || 'H').toUpperCase()];
  if (!a || !b || a === b) return price;
  return price * (a / b);
}

export function convertUnit(value, fromUnit, toUnit) {
  if (!value || value <= 0) return 0;
  if (fromUnit === toUnit) return value;
  const fromMultiplier = HASHRATE_SUFFIXES[cleanUnit(fromUnit)] || 1;
  const toMultiplier = HASHRATE_SUFFIXES[cleanUnit(toUnit)] || 1;
  return (value * fromMultiplier) / toMultiplier;
}

export function normalizeValue(value, unit, targetUnit = 'H') {
  if (!value || value <= 0) return 0;
  const fromMultiplier = HASHRATE_SUFFIXES[cleanUnit(unit)] || 1;
  const toMultiplier = HASHRATE_SUFFIXES[cleanUnit(targetUnit)] || 1;
  return (value * fromMultiplier) / toMultiplier;
}

export function convertNiceHashToMrr(value, algoName) {
  if (!value || value <= 0) return 0;
  return convertUnit(value, getNiceHashUnit(algoName), getMrrUnit(algoName));
}

export function convertMrrToNiceHash(value, algoName) {
  if (!value || value <= 0) return 0;
  return convertUnit(value, getMrrUnit(algoName), getNiceHashUnit(algoName));
}

export function calculatePriceComparison(mrrPrice, mrrAlgoOrUnit, nhPrice, nhAlgoOrUnit) {
  const nhPriceNum = Number.parseFloat(nhPrice || 0);
  const mrrPriceNum = Number.parseFloat(mrrPrice || 0);
  if (nhPriceNum <= 0 || mrrPriceNum <= 0) return null;
  const mrrUnit = getMrrUnit(mrrAlgoOrUnit);
  const nhUnit = getNiceHashUnit(nhAlgoOrUnit);
  const mrrPriceNorm = normalizeValue(mrrPriceNum, mrrUnit, 'TH');
  const nhPriceNorm = normalizeValue(nhPriceNum, nhUnit, 'TH') / 1000;
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