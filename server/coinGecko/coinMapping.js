// server/coinGecko/coinMapping.js
//
// Unified mining coin / algorithm identity registry.
//
// Sources / concepts:
//   - CoinGecko canonical coin IDs
//   - NiceHash algorithm names
//   - MiningRigRentals algorithm names / slugs
//
// IMPORTANT:
//
// 1. CoinGecko IDs, coin symbols and mining algorithms are DIFFERENT namespaces.
//
// 2. Never use generic substring matching for symbols.
//    "ETH" must not accidentally match "ETHASH", etc.
//
// 3. Coin identity takes priority over algorithm identity.
//
// 4. Algorithm -> coin is only a fallback/default relationship.
//    One algorithm can potentially support multiple coins.
//
// 5. NiceHash and MRR names are marketplace representations of our
//    canonical algorithm.
//
// 6. Live marketplace availability should be fetched from the respective
//    APIs. This registry provides canonicalization, aliases and known
//    relationships.
//
// 7. Unknown coins should resolve to null rather than silently guessing.
//
// -----------------------------------------------------------------------------

// =============================================================================
// VERSION
// =============================================================================

export const COIN_MAPPING_VERSION = '3.1.0';

// =============================================================================
// CANONICAL COIN REGISTRY
// =============================================================================
//
// Key = internal canonical key
//
// geckoId = CoinGecko API ID
//
// symbols = ticker aliases
//
// names = human-readable aliases
//
// algorithms = canonical mining algorithm KEYS used by this coin.
//
// NOTE:
//
//   `algorithms` must contain ONLY canonical keys that exist in ALGORITHMS.
//   Do NOT add aliases such as 'AUTOLYKOS2' or 'BEAMHASHIII' here — those
//   belong in ALGORITHM_ALIASES. Adding aliases here causes validateRegistry()
//   to emit false warnings and makes algorithmConflict detection unreliable.
//

export const COINS = Object.freeze({

  // ---------------------------------------------------------------------------
  // Bitcoin family
  // ---------------------------------------------------------------------------

  bitcoin: {
    geckoId: 'bitcoin',
    symbols: ['BTC'],
    names: ['BITCOIN'],
    algorithms: ['SHA256'],
  },

  'bitcoin-cash': {
    geckoId: 'bitcoin-cash',
    symbols: ['BCH'],
    names: [
      'BITCOIN CASH',
      'BITCOIN-CASH',
      'BITCOINCASH',
    ],
    algorithms: ['SHA256'],
  },

  litecoin: {
    geckoId: 'litecoin',
    symbols: ['LTC'],
    names: ['LITECOIN'],
    algorithms: ['SCRYPT'],
  },

  dogecoin: {
    geckoId: 'dogecoin',
    symbols: ['DOGE'],
    names: ['DOGECOIN'],
    algorithms: ['SCRYPT'],
  },

  // ---------------------------------------------------------------------------
  // Ethereum family
  // ---------------------------------------------------------------------------

  ethereum: {
    geckoId: 'ethereum',
    symbols: ['ETH'],
    names: ['ETHEREUM'],
    algorithms: [],
  },

  'ethereum-classic': {
    geckoId: 'ethereum-classic',
    symbols: ['ETC'],
    names: [
      'ETHEREUM CLASSIC',
      'ETHEREUM-CLASSIC',
      'ETHEREUMCLASSIC',
    ],
    algorithms: ['ETCHASH'],
  },

  // ---------------------------------------------------------------------------
  // Privacy / CPU coins
  // ---------------------------------------------------------------------------

  monero: {
    geckoId: 'monero',
    symbols: ['XMR'],
    names: ['MONERO'],
    algorithms: ['RANDOMX', 'CRYPTONIGHT'],
  },

  'zephyr-protocol': {
    geckoId: 'zephyr-protocol',
    symbols: ['ZEPH'],
    names: [
      'ZEPHYR',
      'ZEPHYR PROTOCOL',
      'ZEPHYR-PROTOCOL',
    ],
    algorithms: ['RANDOMX'],
  },

  salvium: {
    geckoId: 'salvium',
    symbols: ['SAL'],
    names: ['SALVIUM'],
    algorithms: ['RANDOMX'],
  },

  zano: {
    geckoId: 'zano',
    symbols: ['ZANO'],
    names: ['ZANO'],
    algorithms: ['PROGPOWZ'],
  },

  // ---------------------------------------------------------------------------
  // GPU / ASIC / mining coins
  // ---------------------------------------------------------------------------

  beam: {
    // Intentionally 'beam'.
    //
    // CoinGecko has multiple Beam-related assets. For MINING Beam (the
    // MimbleWimble chain), 'beam' is the canonical id, but the registry
    // entry is explicit so we never fall through to a token with a similar
    // name.

    geckoId: 'beam',
    symbols: ['BEAM'],
    names: [
      'BEAM',
      'BEAM V3',
      'BEAM-V3',
      'BEAMV3',
    ],
    algorithms: ['BEAMHASH', 'BEAMV3'],
  },

  ravencoin: {
    geckoId: 'ravencoin',
    symbols: ['RVN'],
    names: ['RAVENCOIN'],
    algorithms: ['KAWPOW'],
  },

  ergo: {
    geckoId: 'ergo',
    symbols: ['ERG'],
    names: ['ERGO'],
    algorithms: ['AUTOLYKOS'],
  },

  kaspa: {
    geckoId: 'kaspa',
    symbols: ['KAS'],
    names: ['KASPA'],
    algorithms: ['KHEAVYHASH'],
  },

  'iron-fish': {
    geckoId: 'iron-fish',
    symbols: ['IRON'],
    names: [
      'IRON FISH',
      'IRON-FISH',
      'IRONFISH',
    ],
    algorithms: ['FISHHASH'],
  },

  dynex: {
    geckoId: 'dynex',
    symbols: ['DNX', 'DYNEX'],
    names: ['DYNEX'],
    algorithms: ['DYNEXSOLVE'],
  },

  alephium: {
    geckoId: 'alephium',
    symbols: ['ALPH'],
    names: ['ALEPHIUM'],
    algorithms: ['BLAKE3'],
  },

  nexacoin: {
    // CoinGecko id is 'nexacoin', not 'nexa'.
    geckoId: 'nexacoin',
    symbols: ['NEXA'],
    names: ['NEXA', 'NEXACOIN'],
    algorithms: ['NEXAPOW'],
  },

  'clore-ai': {
    geckoId: 'clore-ai',
    symbols: ['CLORE'],
    names: [
      'CLORE',
      'CLORE AI',
      'CLORE-AI',
      'CLOREAI',
    ],
    algorithms: ['KAWPOW'],
  },

  conflux: {
    // NOTE: CoinGecko currently exposes the native Conflux network asset
    // under the id 'conflux-token'. If you are certain it has been renamed
    // to 'conflux', update both this entry and TRACKED_COINS. Do NOT map to
    // an unrelated CFX-wrapped token.
    geckoId: 'conflux-token',
    symbols: ['CFX'],
    names: [
      'CONFLUX',
      'CONFLUX NETWORK',
    ],
    algorithms: ['OCTOPUS'],
  },

  'quantum-resistant-ledger': {
    geckoId: 'quantum-resistant-ledger',
    symbols: ['QRL'],
    names: [
      'QUANTUM RESISTANT LEDGER',
      'QUANTUM-RESISTANT-LEDGER',
    ],
    algorithms: [],
  },

  xelis: {
    geckoId: 'xelis',
    symbols: ['XEL', 'XELIS'],
    names: ['XELIS'],
    algorithms: ['XELISHASH', 'XELISHASHV3'],
  },

  neoxa: {
    geckoId: 'neoxa',
    symbols: ['NEOX', 'NEOXA'],
    names: ['NEOXA'],
    algorithms: ['KAWPOW'],
  },

  'verus-coin': {
    geckoId: 'verus-coin',
    symbols: ['VRSC'],
    names: [
      'VERUS',
      'VERUS COIN',
      'VERUS-COIN',
    ],
    algorithms: ['VERUSHASH'],
  },

  vertcoin: {
    geckoId: 'vertcoin',
    symbols: ['VTC'],
    names: ['VERTCOIN'],
    algorithms: ['LYRA2REV2'],
  },

  feathercoin: {
    geckoId: 'feathercoin',
    symbols: ['FTC'],
    names: ['FEATHERCOIN'],
    algorithms: ['NEOSCRYPT'],
  },

  'ai-power-grid': {
    geckoId: 'ai-power-grid',
    symbols: ['AIPG'],
    names: [
      'AIPG',
      'AI POWER GRID',
      'AI-POWER-GRID',
    ],
    algorithms: [],
  },
});

// =============================================================================
// CANONICAL ALGORITHMS
// =============================================================================
//
// canonical        = internal identifier (must equal the object key)
// nicehash         = known NiceHash representations
// miningRigRentals = known MRR representations
// coins            = known canonical coin keys
//
// IMPORTANT:
//
//   This does NOT claim that every listed coin is currently available on
//   every marketplace. Live marketplace APIs determine current availability.
//

export const ALGORITHMS = Object.freeze({

  SHA256: {
    canonical: 'SHA256',
    nicehash: ['SHA256', 'SHA-256', 'SHA256ASICBOOST'],
    miningRigRentals: ['SHA256', 'SHA256ASICBOOST'],
    coins: ['bitcoin', 'bitcoin-cash'],
  },

  SCRYPT: {
    canonical: 'SCRYPT',
    nicehash: ['SCRYPT', 'Scrypt'],
    miningRigRentals: ['Scrypt', 'SCRYPT'],
    coins: ['litecoin', 'dogecoin'],
  },

  KAWPOW: {
    canonical: 'KAWPOW',
    nicehash: ['KAWPOW', 'KawPOW', 'Kawpow'],
    miningRigRentals: ['KawPOW', 'Kawpow', 'KAWPOW'],
    coins: ['ravencoin', 'clore-ai', 'neoxa'],
  },

  AUTOLYKOS: {
    canonical: 'AUTOLYKOS',
    nicehash: ['AUTOLYKOS', 'Autolykos', 'Autolykos2'],
    miningRigRentals: ['Autolykos', 'Autolykos2', 'AUTOLYKOS'],
    coins: ['ergo'],
  },

  KHEAVYHASH: {
    canonical: 'KHEAVYHASH',
    nicehash: ['KHEAVYHASH', 'KHeavyHash', 'kHeavyHash'],
    miningRigRentals: ['kHeavyHash', 'KHeavyHash', 'KHEAVYHASH'],
    coins: ['kaspa'],
  },

  FISHHASH: {
    canonical: 'FISHHASH',
    nicehash: ['FISHHASH', 'FishHash', 'Fishhash'],
    miningRigRentals: ['FishHash', 'Fishhash', 'FISHHASH'],
    coins: ['iron-fish'],
  },

  BLAKE3: {
    canonical: 'BLAKE3',
    nicehash: ['BLAKE3', 'Blake3'],
    miningRigRentals: ['BLAKE3', 'Blake3'],
    coins: ['alephium'],
  },

  NEXAPOW: {
    canonical: 'NEXAPOW',
    nicehash: ['NEXAPOW', 'NexaPow', 'Nexapow'],
    miningRigRentals: ['NexaPow', 'Nexapow', 'NEXAPOW'],
    coins: ['nexacoin'],
  },

  OCTOPUS: {
    canonical: 'OCTOPUS',
    nicehash: ['OCTOPUS', 'Octopus'],
    miningRigRentals: ['Octopus', 'OCTOPUS'],
    coins: ['conflux'],
  },

  PROGPOWZ: {
    canonical: 'PROGPOWZ',
    nicehash: ['PROGPOWZ', 'ProgPowZ', 'Progpowz'],
    miningRigRentals: ['ProgPowZ', 'Progpowz', 'PROGPOWZ'],
    coins: ['zano'],
  },

  VERUSHASH: {
    canonical: 'VERUSHASH',
    nicehash: ['VERUSHASH', 'VerusHash', 'Verushash'],
    miningRigRentals: ['VerusHash', 'Verushash', 'VERUSHASH'],
    coins: ['verus-coin'],
  },

  RANDOMX: {
    canonical: 'RANDOMX',
    nicehash: ['RANDOMX', 'RandomX'],
    miningRigRentals: ['RandomX', 'Randomx', 'RANDOMX'],
    coins: ['monero', 'zephyr-protocol', 'salvium'],
  },

  // CryptoNight is the legacy Monero algorithm. Some older pools and miners
  // still label XMR as 'cryptonight'. Kept as its own canonical key (rather
  // than aliased to RANDOMX) so that:
  //   - algorithmConflict correctly reports XMR + CRYPTONIGHT as consistent
  //   - getCoinsForAlgorithm('CRYPTONIGHT') is not silently empty
  CRYPTONIGHT: {
    canonical: 'CRYPTONIGHT',
    nicehash: ['CRYPTONIGHT', 'CryptoNight'],
    miningRigRentals: ['CryptoNight', 'CRYPTONIGHT'],
    coins: ['monero'],
  },

  ETCHASH: {
    canonical: 'ETCHASH',
    nicehash: ['ETCHASH', 'Etchash', 'ETCHASH2'],
    miningRigRentals: ['Etchash', 'ETCHASH'],
    coins: ['ethereum-classic'],
  },

  LYRA2REV2: {
    canonical: 'LYRA2REV2',
    nicehash: ['LYRA2REV2', 'Lyra2REv2', 'Lyra2Rev2'],
    miningRigRentals: ['Lyra2REv2', 'Lyra2Rev2', 'LYRA2REV2'],
    coins: ['vertcoin'],
  },

  NEOSCRYPT: {
    canonical: 'NEOSCRYPT',
    nicehash: ['NEOSCRYPT', 'NeoScrypt', 'Neoscrypt'],
    miningRigRentals: ['NeoScrypt', 'Neoscrypt', 'NEOSCRYPT'],
    coins: ['feathercoin'],
  },

  XELISHASH: {
    canonical: 'XELISHASH',
    nicehash: ['XELISHASH', 'XelisHash', 'Xelishash'],
    miningRigRentals: ['XelisHash', 'Xelishash', 'XELISHASH'],
    coins: ['xelis'],
  },

  XELISHASHV3: {
    canonical: 'XELISHASHV3',
    nicehash: ['XELISHASHV3', 'XelisHashV3', 'XelishashV3'],
    miningRigRentals: ['XelisHashV3', 'XelishashV3', 'XELISHASHV3'],
    coins: ['xelis'],
  },

  DYNEXSOLVE: {
    canonical: 'DYNEXSOLVE',
    nicehash: ['DYNEXSOLVE', 'DynexSolve', 'Dynexsolve'],
    miningRigRentals: ['DynexSolve', 'Dynexsolve', 'DYNEXSOLVE'],
    coins: ['dynex'],
  },

  BEAMHASH: {
    canonical: 'BEAMHASH',
    nicehash: ['BEAMHASH', 'BeamHash', 'BeamHashIII'],
    miningRigRentals: ['BeamHash', 'BeamHashIII', 'BEAMHASH'],
    coins: ['beam'],
  },

  BEAMV3: {
    canonical: 'BEAMV3',
    nicehash: ['BEAMV3', 'BeamV3'],
    miningRigRentals: ['BeamV3', 'BEAMV3'],
    coins: ['beam'],
  },
});

// =============================================================================
// ALGORITHM ALIASES
// =============================================================================
//
// Keys are compared in two passes:
//   1. normalizeCoinIdentifier (uppercase, hyphens for separators)
//   2. normalizeAlgorithmIdentifier (uppercase, separators removed)
//
// So all of these resolve to KHEAVYHASH:
//   'kHeavyHash', 'k-Heavy-Hash', 'K Heavy Hash', 'KHEAVYHASH'
//
// IMPORTANT:
//
//   Do NOT alias an algorithm that is genuinely shared by multiple coins
//   to a single canonical key. Example: YESPOWER was aliased to VERUSHASH
//   in an earlier revision, which is incorrect — yespower is used by
//   several unrelated chains, and VerusHash is not the same as yespower.
//

export const ALGORITHM_ALIASES = Object.freeze({

  // SHA256
  'SHA-256': 'SHA256',
  SHA256D: 'SHA256',
  SHA256ASICBOOST: 'SHA256',

  // SCRYPT
  SCRYPT: 'SCRYPT',

  // KAWPOW
  'KAW-POW': 'KAWPOW',
  KAWPOW: 'KAWPOW',

  // AUTOLYKOS
  AUTOLYKOS: 'AUTOLYKOS',
  AUTOLYKOS2: 'AUTOLYKOS',

  // KHEAVYHASH
  'K-HEAVYHASH': 'KHEAVYHASH',
  KHEAVYHASH: 'KHEAVYHASH',

  // FISHHASH
  'FISH-HASH': 'FISHHASH',
  FISHHASH: 'FISHHASH',

  // BLAKE3
  BLAKE3: 'BLAKE3',

  // NEXAPOW
  'NEXA-POW': 'NEXAPOW',
  NEXAPOW: 'NEXAPOW',

  // OCTOPUS
  OCTOPUS: 'OCTOPUS',

  // PROGPOWZ
  'PROGPOW-Z': 'PROGPOWZ',
  PROGPOWZ: 'PROGPOWZ',

  // VERUSHASH
  'VERUS-HASH': 'VERUSHASH',
  VERUSHASH: 'VERUSHASH',

  // RANDOMX
  'RANDOM-X': 'RANDOMX',
  RANDOMX: 'RANDOMX',

  // CRYPTONIGHT (legacy Monero)
  'CRYPTO-NIGHT': 'CRYPTONIGHT',
  CRYPTONIGHT: 'CRYPTONIGHT',

  // ETCHASH
  ETCHASH: 'ETCHASH',

  // LYRA2REV2
  'LYRA2-REV2': 'LYRA2REV2',
  LYRA2REV2: 'LYRA2REV2',

  // NEOSCRYPT
  NEOSCRYPT: 'NEOSCRYPT',

  // XELISHASH
  'XELIS-HASH': 'XELISHASH',
  XELISHASH: 'XELISHASH',
  XELISHASHV3: 'XELISHASHV3',

  // DYNEXSOLVE
  DYNEXSOLVE: 'DYNEXSOLVE',

  // BEAM
  BEAMHASH: 'BEAMHASH',
  BEAMHASHIII: 'BEAMHASH',
  BEAMV3: 'BEAMV3',
});

// =============================================================================
// NORMALIZATION
// =============================================================================

export function normalizeCoinIdentifier(value) {
  if (value == null) return '';
  return String(value)
    .trim()
    .toUpperCase()
    .replace(/[._]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export function normalizeAlgorithmIdentifier(value) {
  if (value == null) return '';
  return String(value)
    .trim()
    .toUpperCase()
    .replace(/[\s_-]+/g, '');
}

// =============================================================================
// BUILD LOOKUP INDEXES
// =============================================================================

const SYMBOL_TO_COIN = new Map();
const NAME_TO_COIN = new Map();
const GECKO_ID_TO_COIN = new Map();

for (const [canonicalKey, coin] of Object.entries(COINS)) {
  GECKO_ID_TO_COIN.set(coin.geckoId, canonicalKey);

  for (const symbol of coin.symbols) {
    SYMBOL_TO_COIN.set(
      normalizeCoinIdentifier(symbol),
      canonicalKey
    );
  }

  for (const name of coin.names) {
    NAME_TO_COIN.set(
      normalizeCoinIdentifier(name),
      canonicalKey
    );
  }
}

// Precompile text-match regexes (longest first) so getCoinGeckoIdFromText()
// does not rebuild them on every call.
const escapeRegExp = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const SORTED_TEXT_ALIASES = [
  ...SYMBOL_TO_COIN.entries(),
  ...NAME_TO_COIN.entries(),
]
  .map(([alias, canonical]) => ({
    alias,
    canonical,
    regex: new RegExp(
      `(?:^|[^A-Z0-9])${escapeRegExp(alias)}(?:$|[^A-Z0-9])`
    ),
  }))
  .sort((a, b) => b.alias.length - a.alias.length);

// =============================================================================
// ALGORITHM RESOLUTION
// =============================================================================

export function normalizeAlgorithm(algorithm) {
  if (!algorithm) return null;

  // Pass 1: hyphenated, uppercased, separator-preserving.
  const raw = normalizeCoinIdentifier(algorithm);
  if (!raw) return null;

  if (ALGORITHM_ALIASES[raw]) {
    return ALGORITHM_ALIASES[raw];
  }

  // Pass 2: separator-free aggressive normalization.
  const normalized = normalizeAlgorithmIdentifier(algorithm);
  if (!normalized) return null;

  for (const [alias, canonical] of Object.entries(ALGORITHM_ALIASES)) {
    if (normalizeAlgorithmIdentifier(alias) === normalized) {
      return canonical;
    }
  }

  // Already canonical?
  if (ALGORITHMS[normalized]) {
    return normalized;
  }

  return null;
}

// =============================================================================
// COIN RESOLUTION
// =============================================================================

export function resolveCoin(coinName) {
  if (!coinName) return null;

  const raw = String(coinName).trim();
  const normalized = normalizeCoinIdentifier(raw);

  // Exact symbol
  const symbolMatch = SYMBOL_TO_COIN.get(normalized);
  if (symbolMatch) {
    return {
      canonical: symbolMatch,
      geckoId: COINS[symbolMatch].geckoId,
      source: 'symbol',
      confidence: 1,
      matched: coinName,
    };
  }

  // Exact name
  const nameMatch = NAME_TO_COIN.get(normalized);
  if (nameMatch) {
    return {
      canonical: nameMatch,
      geckoId: COINS[nameMatch].geckoId,
      source: 'name',
      confidence: 1,
      matched: coinName,
    };
  }

  // Direct CoinGecko id (case-insensitive)
  const canonical = GECKO_ID_TO_COIN.get(raw.toLowerCase());
  if (canonical) {
    return {
      canonical,
      geckoId: COINS[canonical].geckoId,
      source: 'coingecko-id',
      confidence: 1,
      matched: coinName,
    };
  }

  return null;
}

// =============================================================================
// ALGORITHM -> COIN RELATIONSHIP
// =============================================================================

export function getCoinsForAlgorithm(algorithm) {
  const canonicalAlgorithm = normalizeAlgorithm(algorithm);
  if (!canonicalAlgorithm) return [];

  const definition = ALGORITHMS[canonicalAlgorithm];
  if (!definition) return [];

  return definition.coins.map((coinKey) => ({
    canonical: coinKey,
    geckoId: COINS[coinKey]?.geckoId ?? null,
  }));
}

// =============================================================================
// COIN -> ALGORITHMS
// =============================================================================

export function getAlgorithmsForCoin(coinName) {
  const coin = resolveCoin(coinName);
  if (!coin) return [];
  return [...COINS[coin.canonical].algorithms];
}

// =============================================================================
// COINGECKO ID (primary)
// =============================================================================

export function mapCoinToCoinGeckoId(coinName) {
  return resolveCoin(coinName)?.geckoId ?? null;
}

// =============================================================================
// ALGORITHM DEFAULT
// =============================================================================
//
// Intentionally separate from coin resolution. If an algorithm supports
// multiple coins, this returns null rather than picking one.
//

export function getDefaultCoinForAlgorithm(algorithm) {
  const coins = getCoinsForAlgorithm(algorithm);
  if (coins.length !== 1) return null;
  return coins[0].geckoId;
}

// =============================================================================
// FULL MINING IDENTITY RESOLVER
// =============================================================================

export function resolveMiningIdentity({
  coin = null,
  coinName = null,
  symbol = null,
  algorithm = null,
  nicehashAlgorithm = null,
  miningRigRentalsAlgorithm = null,
} = {}) {
  const suppliedCoin = coinName ?? coin ?? symbol;
  const suppliedAlgorithm =
    algorithm ?? nicehashAlgorithm ?? miningRigRentalsAlgorithm;

  const coinResult = resolveCoin(suppliedCoin);
  const canonicalAlgorithm = normalizeAlgorithm(suppliedAlgorithm);

  // ---------------------------------------------------------------------------
  // 1. Explicit coin wins.
  // ---------------------------------------------------------------------------

  if (coinResult) {
    const coinDefinition = COINS[coinResult.canonical];

    // Normalize the coin's declared algorithms so that aliases stored in
    // COINS[x].algorithms would still work, but see the COINS comment:
    // declarations should already be canonical.
    const declared = coinDefinition.algorithms
      .map(normalizeAlgorithm)
      .filter(Boolean);

    const algorithmConflict = Boolean(
      canonicalAlgorithm && !declared.includes(canonicalAlgorithm)
    );

    return {
      canonicalCoin: coinResult.canonical,
      coinGeckoId: coinResult.geckoId,
      algorithm: canonicalAlgorithm,
      nicehashAlgorithm: canonicalAlgorithm
        ? getNiceHashAlgorithm(canonicalAlgorithm)
        : null,
      miningRigRentalsAlgorithm: canonicalAlgorithm
        ? getMiningRigRentalsAlgorithm(canonicalAlgorithm)
        : null,
      confidence: 1,
      source: coinResult.source,
      matchedCoin: coinResult.matched,
      algorithmConflict,
      warning: algorithmConflict ? 'ALGORITHM_CONFLICT' : null,
    };
  }

  // ---------------------------------------------------------------------------
  // 2. No explicit coin — algorithm may identify a coin only when exactly one
  //    registered coin uses that algorithm.
  // ---------------------------------------------------------------------------

  if (canonicalAlgorithm) {
    const candidates = getCoinsForAlgorithm(canonicalAlgorithm);

    if (candidates.length === 1) {
      const candidate = candidates[0];

      return {
        canonicalCoin: candidate.canonical,
        coinGeckoId: candidate.geckoId,
        algorithm: canonicalAlgorithm,
        nicehashAlgorithm: getNiceHashAlgorithm(canonicalAlgorithm),
        miningRigRentalsAlgorithm:
          getMiningRigRentalsAlgorithm(canonicalAlgorithm),
        confidence: 0.75,
        source: 'algorithm',
        matchedCoin: null,
        algorithmConflict: false,
        warning: null,
      };
    }

    if (candidates.length > 1) {
      return {
        canonicalCoin: null,
        coinGeckoId: null,
        algorithm: canonicalAlgorithm,
        nicehashAlgorithm: getNiceHashAlgorithm(canonicalAlgorithm),
        miningRigRentalsAlgorithm:
          getMiningRigRentalsAlgorithm(canonicalAlgorithm),
        confidence: 0,
        source: 'ambiguous-algorithm',
        matchedCoin: null,
        candidates,
        algorithmConflict: false,
        warning: 'AMBIGUOUS_ALGORITHM',
      };
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Unresolved.
  // ---------------------------------------------------------------------------

  return {
    canonicalCoin: null,
    coinGeckoId: null,
    algorithm: canonicalAlgorithm,
    nicehashAlgorithm: canonicalAlgorithm
      ? getNiceHashAlgorithm(canonicalAlgorithm)
      : null,
    miningRigRentalsAlgorithm: canonicalAlgorithm
      ? getMiningRigRentalsAlgorithm(canonicalAlgorithm)
      : null,
    confidence: 0,
    source: 'unresolved',
    matchedCoin: null,
    algorithmConflict: false,
    warning: 'UNRESOLVED',
  };
}

// =============================================================================
// NICEHASH REPRESENTATION
// =============================================================================

export function getNiceHashAlgorithm(algorithm) {
  const canonical = normalizeAlgorithm(algorithm);
  if (!canonical) return null;
  const definition = ALGORITHMS[canonical];
  if (!definition) return null;
  return definition.nicehash[0] ?? null;
}

// =============================================================================
// MININGRIGRENTALS REPRESENTATION
// =============================================================================

export function getMiningRigRentalsAlgorithm(algorithm) {
  const canonical = normalizeAlgorithm(algorithm);
  if (!canonical) return null;
  const definition = ALGORITHMS[canonical];
  if (!definition) return null;
  return definition.miningRigRentals[0] ?? null;
}

// =============================================================================
// MARKETPLACE ALIAS RESOLUTION
// =============================================================================
//
// Both helpers fall back to the canonical resolver so that callers may pass
// an already-canonical algorithm key without it being present in the
// per-platform alias list.
//

export function resolveNiceHashAlgorithm(value) {
  if (!value) return null;

  // Fast path: caller already passed a canonical key.
  const canonical = normalizeAlgorithm(value);
  if (canonical && ALGORITHMS[canonical]) return canonical;

  const normalized = normalizeAlgorithmIdentifier(value);

  for (const [key, definition] of Object.entries(ALGORITHMS)) {
    for (const alias of definition.nicehash) {
      if (normalizeAlgorithmIdentifier(alias) === normalized) {
        return key;
      }
    }
  }

  return null;
}

export function resolveMiningRigRentalsAlgorithm(value) {
  if (!value) return null;

  const canonical = normalizeAlgorithm(value);
  if (canonical && ALGORITHMS[canonical]) return canonical;

  const normalized = normalizeAlgorithmIdentifier(value);

  for (const [key, definition] of Object.entries(ALGORITHMS)) {
    for (const alias of definition.miningRigRentals) {
      if (normalizeAlgorithmIdentifier(alias) === normalized) {
        return key;
      }
    }
  }

  return null;
}

// =============================================================================
// MRR DISPLAY STRING PARSER
// =============================================================================
//
// MRR exposes labels such as:
//
//   "kHeavyHash (Kaspa)"
//   "KawPOW (RVN)"
//
// We parse the algorithm and the coin context separately.
//

export function parseMiningRigRentalsAlgorithm(value) {
  if (!value) {
    return { algorithm: null, coin: null, coinGeckoId: null };
  }

  const text = String(value).trim();

  const match = text.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (!match) {
    const algorithm = resolveMiningRigRentalsAlgorithm(text);
    return { algorithm, coin: null, coinGeckoId: null };
  }

  const algorithm = resolveMiningRigRentalsAlgorithm(match[1]);
  const coin = resolveCoin(match[2]);

  return {
    algorithm,
    coin: coin?.canonical ?? null,
    coinGeckoId: coin?.geckoId ?? null,
  };
}

// =============================================================================
// TEXT COIN RESOLUTION
// =============================================================================
//
// Safe text matching. We do NOT call text.includes('ETH') — that produces
// false positives ('ETHASH', 'ETHEREUM', ...).
//
// Two fixes relative to earlier revisions:
//
//   1. Input is normalized with normalizeCoinIdentifier, so that
//      "Bitcoin Cash" produces "BITCOIN-CASH" and matches the
//      hyphenated alias (previously "BITCOIN CASH" would fall through
//      to the shorter 'BITCOIN' alias and resolve to bitcoin).
//
//   2. Regexes are precompiled at module load (SORTED_TEXT_ALIASES)
//      instead of being rebuilt on every call.
//

export function getCoinGeckoIdFromText(value) {
  if (!value) return null;

  const normalized = normalizeCoinIdentifier(value);
  if (!normalized) return null;

  // Exact match first.
  const exact = mapCoinToCoinGeckoId(normalized);
  if (exact) return exact;

  for (const { regex, canonical } of SORTED_TEXT_ALIASES) {
    if (regex.test(normalized)) {
      return COINS[canonical].geckoId;
    }
  }

  return null;
}

// =============================================================================
// BACKWARD COMPATIBILITY
// =============================================================================
//
// Existing application code can continue doing:
//
//   getCoinGeckoId('KAS', 'kHeavyHash')
//
// Note: unlike the pre-3.0 mapping, this now returns null for ambiguous
// algorithms with no explicit coin (e.g. getCoinGeckoId(null, 'KAWPOW')).
// If you need the old "best guess" behavior, use the explicit helper
// getBestEffortCoinGeckoId below — do not rely on the primary resolver.
//

export function getCoinGeckoId(coinName, algorithm) {
  return resolveMiningIdentity({
    coinName,
    algorithm,
  }).coinGeckoId;
}

// Explicit opt-in helper for the pre-3.0 "guess the most likely coin"
// behavior. Returns the first candidate for ambiguous algorithms.
//
// Only use this where a wrong guess is acceptable (e.g. UI fallback). For
// profitability logic, prefer resolveMiningIdentity() and handle
// AMBIGUOUS_ALGORITHM explicitly.
export function getBestEffortCoinGeckoId(coinName, algorithm) {
  const result = resolveMiningIdentity({ coinName, algorithm });

  if (result.coinGeckoId) return result.coinGeckoId;
  if (result.candidates?.length) return result.candidates[0].geckoId;

  return null;
}

// =============================================================================
// TRACKED COINS
// =============================================================================

export const TRACKED_COINS = Object.freeze(
  Object.values(COINS).map((coin) => coin.geckoId)
);

export const TRACKED_COIN_SET = new Set(TRACKED_COINS);

export function isTrackedCoinGeckoId(id) {
  return typeof id === 'string' && TRACKED_COIN_SET.has(id);
}

// =============================================================================
// COIN INFORMATION
// =============================================================================

export function getCoinDefinition(value) {
  if (!value) return null;

  const resolved = resolveCoin(value);
  if (!resolved) return null;

  const definition = COINS[resolved.canonical];

  return {
    canonical: resolved.canonical,
    geckoId: definition.geckoId,
    symbols: [...definition.symbols],
    names: [...definition.names],
    algorithms: [...definition.algorithms],
  };
}

// =============================================================================
// ALGORITHM INFORMATION
// =============================================================================

export function getAlgorithmDefinition(value) {
  const canonical = normalizeAlgorithm(value);
  if (!canonical) return null;

  const definition = ALGORITHMS[canonical];
  if (!definition) return null;

  return {
    canonical: definition.canonical,
    nicehash: [...definition.nicehash],
    miningRigRentals: [...definition.miningRigRentals],
    coins: definition.coins.map((coin) => ({
      canonical: coin,
      geckoId: COINS[coin]?.geckoId ?? null,
    })),
  };
}

// =============================================================================
// LIST HELPERS
// =============================================================================

export function getSupportedCoinGeckoIds() {
  return [...TRACKED_COINS];
}

export function getSupportedCoinSymbols() {
  return [
    ...new Set(
      Object.values(COINS).flatMap((coin) => coin.symbols)
    ),
  ];
}

export function getSupportedAlgorithms() {
  return Object.keys(ALGORITHMS);
}

// =============================================================================
// REGISTRY VALIDATION
// =============================================================================
//
// Pure function. Call it from tests or CI. Do NOT run at module load — a
// failed assertion inside an imported module is much harder to diagnose
// than a test failure.
//
//   const result = validateRegistry();
//   if (!result.valid) console.error(result.errors);
//

export function validateRegistry() {
  const errors = [];
  const warnings = [];

  // ---------------------------------------------------------------------------
  // Validate coins
  // ---------------------------------------------------------------------------

  for (const [canonicalKey, coin] of Object.entries(COINS)) {
    if (!coin.geckoId) {
      errors.push(`${canonicalKey}: missing geckoId`);
    }

    if (!Array.isArray(coin.symbols)) {
      errors.push(`${canonicalKey}: symbols must be an array`);
    }

    if (!Array.isArray(coin.names)) {
      errors.push(`${canonicalKey}: names must be an array`);
    }

    if (!Array.isArray(coin.algorithms)) {
      errors.push(`${canonicalKey}: algorithms must be an array`);
    }

    for (const algorithm of coin.algorithms) {
      // Accept canonical keys as well as aliases, but flag anything that
      // does not normalize to a real algorithm. This is a warning, not an
      // error, because a coin may declare an algorithm that we do not
      // currently model.
      const canonical = normalizeAlgorithm(algorithm);
      if (!canonical || !ALGORITHMS[canonical]) {
        warnings.push(
          `${canonicalKey}: unknown algorithm ${algorithm}`
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Validate algorithms
  // ---------------------------------------------------------------------------

  for (const [algorithmKey, definition] of Object.entries(ALGORITHMS)) {
    if (definition.canonical !== algorithmKey) {
      errors.push(
        `Algorithm ${algorithmKey}: canonical mismatch`
      );
    }

    if (!Array.isArray(definition.nicehash)) {
      errors.push(
        `Algorithm ${algorithmKey}: nicehash must be array`
      );
    }

    if (!Array.isArray(definition.miningRigRentals)) {
      errors.push(
        `Algorithm ${algorithmKey}: miningRigRentals must be array`
      );
    }

    if (!Array.isArray(definition.coins)) {
      errors.push(
        `Algorithm ${algorithmKey}: coins must be array`
      );
    }

    for (const coinKey of definition.coins) {
      if (!COINS[coinKey]) {
        errors.push(
          `Algorithm ${algorithmKey}: unknown coin ${coinKey}`
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Cross-check: coin declares algorithm but algorithm does not declare coin.
  // ---------------------------------------------------------------------------

  for (const [coinKey, coin] of Object.entries(COINS)) {
    for (const algorithm of coin.algorithms) {
      const canonical = normalizeAlgorithm(algorithm);
      if (!canonical) continue;

      const definition = ALGORITHMS[canonical];
      if (!definition) continue;

      if (!definition.coins.includes(coinKey)) {
        warnings.push(
          `Coin ${coinKey} declares ${canonical}, ` +
          `but ${canonical}.coins does not include it`
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Duplicate symbols
  // ---------------------------------------------------------------------------

  const symbolOwners = new Map();

  for (const [coinKey, coin] of Object.entries(COINS)) {
    for (const symbol of coin.symbols) {
      const normalized = normalizeCoinIdentifier(symbol);
      const existing = symbolOwners.get(normalized);

      if (existing && existing !== coinKey) {
        warnings.push(
          `Symbol ${symbol} is shared by ${existing} and ${coinKey}`
        );
      }

      symbolOwners.set(normalized, coinKey);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// =============================================================================
// CI / DEV ASSERTION HELPER
// =============================================================================
//
// Call from a test file, e.g.:
//
//   import { assertRegistryValid } from '../coinMapping.js';
//   assertRegistryValid();
//

export function assertRegistryValid({ throwOnWarning = false } = {}) {
  const result = validateRegistry();

  if (!result.valid) {
    const message = [
      '[coinMapping] Registry validation failed:',
      ...result.errors.map((e) => `  - ${e}`),
    ].join('\n');
    throw new Error(message);
  }

  if (result.warnings.length) {
    const message = [
      '[coinMapping] Registry warnings:',
      ...result.warnings.map((w) => `  - ${w}`),
    ].join('\n');

    if (throwOnWarning) {
      throw new Error(message);
    }
    // eslint-disable-next-line no-console
    console.warn(message);
  }

  return result;
}