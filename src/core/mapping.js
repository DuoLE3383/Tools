// mapping.js - CONSOLIDATED

/**
 * The single source of truth for all algorithm-related data.
 * Each key is a normalized MRR algorithm name.
 * - `displayName`: The user-friendly name.
 * - `niceHash`: The corresponding NiceHash algorithm enum name.
 * - `unit`: The hashrate unit for MRR (e.g., 'GH', 'TH').
 */
export const ALGO_MAPPING = {
  SCRYPT: { displayName: 'Scrypt', niceHash: 'SCRYPT', unit: 'GH' },
  SHA256: { displayName: 'SHA256', niceHash: 'SHA256', unit: 'TH' },
  SCRYPTN: { displayName: 'Scrypt-N', niceHash: 'SCRYPTN', unit: 'MH' },
  X11: { displayName: 'X11', niceHash: 'X11', unit: 'MH' },
  X13: { displayName: 'X13', niceHash: 'X13', unit: 'MH' },
  KECCAK: { displayName: 'Keccak', niceHash: 'KECCAK', unit: 'MH' },
  X15: { displayName: 'X15', niceHash: 'X15', unit: 'MH' },
  NIST5: { displayName: 'Nist5', niceHash: 'NIST5', unit: 'MH' },
  NEOSCRYPT: { displayName: 'NeoScrypt', niceHash: 'NEOSCRYPT', unit: 'MH' },
  LYRA2RE: { displayName: 'Lyra2RE', niceHash: 'LYRA2RE', unit: 'MH' },
  WHIRLPOOLX: { displayName: 'WhirlpoolX', niceHash: 'WHIRLPOOLX', unit: 'MH' },
  QUBIT: { displayName: 'Qubit', niceHash: 'QUBIT', unit: 'MH' },
  QUARK: { displayName: 'Quark', niceHash: 'QUARK', unit: 'MH' },
  AXIOM: { displayName: 'Axiom', niceHash: 'AXIOM', unit: 'MH' },
  LYRA2REV2: { displayName: 'Lyra2REv2', niceHash: 'LYRA2REV2', unit: 'MH' },
  SCRYPTJANENX16: { displayName: 'ScryptJaneN16', niceHash: 'SCRYPTJANENX16', unit: 'kH' },
  BLAKE256R8: { displayName: 'Blake (256r8)', niceHash: 'BLAKE256R8', unit: 'MH' },
  BLAKE256R14: { displayName: 'Blake (256r14)', niceHash: 'BLAKE256R14', unit: 'MH' },
  BLAKE256R8VNL: { displayName: 'Blake (256r8vnl)', niceHash: 'BLAKE256R8VNL', unit: 'MH' },
  HODL: { displayName: 'HODL', niceHash: 'HODL', unit: 'Sol' },
  DAGGERHASHIMOTO: { displayName: 'DaggerHashimoto', niceHash: 'DAGGERHASHIMOTO', unit: 'MH' },
  DECRED: { displayName: 'Decred', niceHash: 'DECRED', unit: 'GH' },
  CRYPTONIGHT: { displayName: 'CryptoNight', niceHash: 'CRYPTONIGHT', unit: 'H' },
  LBRY: { displayName: 'LBRY', niceHash: 'LBRY', unit: 'GH' },
  EQUIHASH: { displayName: 'Equihash', niceHash: 'EQUIHASH', unit: 'Sol' },
  PASCAL: { displayName: 'Pascal', niceHash: 'PASCAL', unit: 'MH' },
  X11GOST: { displayName: 'X11Gost', niceHash: 'X11GOST', unit: 'MH' },
  SIA: { displayName: 'Sia', niceHash: 'SIA', unit: 'GH' },
  BLAKE2S: { displayName: 'Blake (2s)', niceHash: 'BLAKE2S', unit: 'GH' },
  SKUNK: { displayName: 'Skunk', niceHash: 'SKUNK', unit: 'MH' },
  CRYPTONIGHTV7: { displayName: 'CryptoNightV7', niceHash: 'CRYPTONIGHTV7', unit: 'H' },
  CRYPTONIGHTHEAVY: { displayName: 'CryptoNightHeavy', niceHash: 'CRYPTONIGHTHEAVY', unit: 'H' },
  LYRA2Z: { displayName: 'Lyra2Z', niceHash: 'LYRA2Z', unit: 'MH' },
  X16R: { displayName: 'X16R', niceHash: 'X16R', unit: 'MH' },
  CRYPTONIGHTV8: { displayName: 'CryptoNightV8', niceHash: 'CRYPTONIGHTV8', unit: 'H' },
  SHA256ASICBOOST: { displayName: 'SHA256AsicBoost', niceHash: 'SHA256ASICBOOST', unit: 'TH' },
  ZHASH: { displayName: 'ZHash', niceHash: 'ZHASH', unit: 'Sol' },
  BEAM: { displayName: 'Beam', niceHash: 'BEAM', unit: 'Sol' },
  GRINCUCKAROO29: { displayName: 'GrinCuckaroo29', niceHash: 'GRINCUCKAROO29', unit: 'Graph' },
  GRINCUCKATOO31: { displayName: 'GrinCuckatoo31', niceHash: 'GRINCUCKATOO31', unit: 'Graph' },
  LYRA2REV3: { displayName: 'Lyra2REv3', niceHash: 'LYRA2REV3', unit: 'MH' },
  MTP: { displayName: 'MTP', niceHash: 'MTP', unit: 'MH' },
  CRYPTONIGHTR: { displayName: 'CryptoNightR', niceHash: 'CRYPTONIGHTR', unit: 'H' },
  CUCKOOCYCLE: { displayName: 'CuckooCycle', niceHash: 'CUCKOOCYCLE', unit: 'Graph' },
  GRINCUCKATOO32: { displayName: 'GrinCuckatoo32', niceHash: 'GRINCUCKATOO32', unit: 'Graph' },
  BEAMV2: { displayName: 'BeamV2', niceHash: 'BEAMV2', unit: 'Sol' },
  X16RV2: { displayName: 'X16Rv2', niceHash: 'X16RV2', unit: 'MH' },
  RANDOMXMONERO: { displayName: 'RandomX', niceHash: 'RANDOMXMONERO', unit: 'kH' },
  EAGLESONG: { displayName: 'Eaglesong', niceHash: 'EAGLESONG', unit: 'GH' },
  CUCKATOO31: { displayName: 'Cuckatoo31', niceHash: 'GRINCUCKATOO31', unit: 'Graph' },
  HANDSHAKE: { displayName: 'Handshake', niceHash: 'HANDSHAKE', unit: 'TH' },
  KAWPOW: { displayName: 'KAWPOW', niceHash: 'KAWPOW', unit: 'MH' },
  BEAMV3: { displayName: 'BeamV3', niceHash: 'BEAMV3', unit: 'Sol' },
  OCTOPUS: { displayName: 'Octopus', niceHash: 'OCTOPUS', unit: 'MH' },
  AUTOLYKOS: { displayName: 'Autolykos', niceHash: 'AUTOLYKOS', unit: 'MH' },
  ETCHASH: { displayName: 'ETCHash', niceHash: 'ETCHASH', unit: 'MH' },
  VERUSHASH: { displayName: 'VerusHash', niceHash: 'VERUSHASH', unit: 'MH' },
  KHEAVYHASH: { displayName: 'kHeavyHash', niceHash: 'KHEAVYHASH', unit: 'TH' },
  NEXAPOW: { displayName: 'NexaPow', niceHash: 'NEXAPOW', unit: 'MH' },
  ALEPHIUM: { displayName: 'Alephium', niceHash: 'ALEPHIUM', unit: 'GH' },
  FISHHASH: { displayName: 'FishHash', niceHash: 'FISHHASH', unit: 'MH' },
  IRONFISH: { displayName: 'IronFish', niceHash: 'IRONFISH', unit: 'GH' },
  KARLSENHASH: { displayName: 'KarlsenHash', niceHash: 'KARLSENHASH', unit: 'GH' },
  PYRINHASH: { displayName: 'PyrinHash', niceHash: 'PYRINHASH', unit: 'GH' },

  // --- Aliases and common variations ---
  'SHA256AB': { displayName: 'SHA256AsicBoost', niceHash: 'SHA256ASICBOOST', unit: 'TH' },
  'HASHIMOTOS': { displayName: 'DaggerHashimoto', niceHash: 'DAGGERHASHIMOTO', unit: 'MH' },
  'ETHASH': { displayName: 'DaggerHashimoto', niceHash: 'DAGGERHASHIMOTO', unit: 'MH' },
  'RANDOMX': { displayName: 'RandomX', niceHash: 'RANDOMXMONERO', unit: 'kH' },
  'KASPA': { displayName: 'kHeavyHash', niceHash: 'KHEAVYHASH', unit: 'TH' },
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
 * Safely retrieves the mapping object for a given algorithm, normalizing the name first.
 * @param {string} algoName - The raw algorithm name.
 * @returns {{displayName: string, niceHash: string, unit: string}} The mapping object or a default.
 */
export function getAlgoMapping(algoName) {
  const key = normalizeAlgo(algoName);
  return ALGO_MAPPING[key] || { displayName: key, niceHash: 'UNKNOWN', unit: 'H' };
}
/**
 * Normalizes an algorithm name from any source (MRR, NiceHash) to a consistent uppercase key.
 * @param {string} algoName - The raw algorithm name.
 * @returns {string} The normalized algorithm key, or the original name if no match is found.
 */
export function normalizeAlgo(algoName) {
  if (!algoName) return 'UNKNOWN';
  const upper = String(algoName).toUpperCase().replace(/[-_\s]/g, '');

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
 * Gets the corresponding NiceHash algorithm name for a given algorithm.
 * @param {string} algoName - The raw algorithm name.
 * @returns {string} The NiceHash algorithm name, or 'UNKNOWN'.
 */
export function normalizeAlgoForNiceHash(algoName) {
  const key = getNormalizedAlgoKey(algoName);
  return ALGO_MAPPING[key]?.niceHash || 'UNKNOWN';
}

/**
 * Gets the hashrate unit for a given MRR algorithm.
 * @param {string} algoName - The raw algorithm name.
 * @returns {string} The hashrate unit (e.g., 'GH', 'TH'), or an empty string.
 */
export function getMrrAlgorithmUnit(algoName) {
  const key = getNormalizedAlgoKey(algoName);
  return ALGO_MAPPING[key]?.unit || '';
}

/**
 * Calculates the price difference between an MRR rental and a NiceHash order.
 * @param {number} mrrPrice - MRR price.
 * @param {string} mrrUnit - MRR unit.
 * @param {number} nhPrice - NiceHash price.
 * @param {string} nhUnit - NiceHash unit.
 * @returns {number|null} The percentage difference, or null if inputs are invalid.
 */
export function calculatePriceComparison(mrrPrice, mrrUnit, nhPrice, nhUnit) {
  const nhPriceNum = Number.parseFloat(nhPrice || 0);
  const mrrPriceNum = Number.parseFloat(mrrPrice || 0);

  if (nhPriceNum <= 0 || mrrPriceNum <= 0) return null;

  // Robustly extract base unit (e.g., 'GH/s' or 'BTC/TH/Day' -> 'GH' or 'TH')
  const clean = (u) => {
    const m = String(u || '').toUpperCase().match(/(EH|PH|TH|GH|MH|KH|H|E|P|T|G|M|K)/);
    if (!m) return 'TH';
    let unit = m[0];
    // Normalize single letters to standard 2-letter codes for mapping
    const singleMap = { 'E': 'EH', 'P': 'PH', 'T': 'TH', 'G': 'GH', 'M': 'MH', 'K': 'KH' };
    return singleMap[unit] || unit;
  };

  const mrrUnitClean = clean(mrrUnit) || 'TH';
  const nhUnitClean = clean(nhUnit) || 'TH';

  const mrrP = UNIT_TO_POWER[mrrUnitClean] ?? -6;
  const nhP = UNIT_TO_POWER[nhUnitClean] ?? -6;

  const mrrPriceNorm = mrrPriceNum / Math.pow(10, mrrP);
  const nhPriceNorm = nhPriceNum / Math.pow(10, nhP);

  if (nhPriceNorm > 0) {
    return ((mrrPriceNorm - nhPriceNorm) / nhPriceNorm) * 100;
  }
  return null;
}

// DEPRECATED: These are kept for backward compatibility but should be phased out.
export const ALGO_DISPLAY_NAMES = Object.fromEntries(
  Object.values(ALGO_MAPPING).map(v => [v.niceHash, v.displayName])
);

export const MRR_ALGO_MAP = Object.fromEntries(
  Object.entries(ALGO_MAPPING).map(([key, value]) => [key, value.niceHash])
);

export const NICEHASH_ALGO_MAP = Object.fromEntries(
  Object.values(ALGO_MAPPING).map(v => [v.niceHash, v.niceHash])
);