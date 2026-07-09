import { getAlgoMapping } from "../../core/mapping.js";

export function getMrrAlgoKey(normalizedAlgo) {
  if (!normalizedAlgo || normalizedAlgo === "UNKNOWN") return null;

  const mapping = getAlgoMapping(normalizedAlgo);
  if (!mapping || !mapping.niceHash) return null;

  const niceHashAlgo = mapping.niceHash;

  const keyMap = {
    SCRYPT: "scrypt",
    SHA256: "sha256",
    SHA256ASICBOOST: "sha256ab",
    RANDOMXMONERO: "randomx",
    KAWPOW: "kawpow",
    DAGGERHASHIMOTO: "daggerhashimoto",
    ETHASH: "daggerhashimoto",
    ETCHASH: "etchash",
    EQUIHASH: "equihash",
    CRYPTONIGHT: "cryptonight",
    CRYPTONIGHTV7: "cryptonight",
    CRYPTONIGHTV8: "cryptonight",
    CRYPTONIGHTR: "cryptonight",
    X11: "x11",
    X13: "x13",
    X15: "x15",
    X16R: "x16r",
    X16RV2: "x16rv2",
    LYRA2RE: "lyra2re",
    LYRA2REV2: "lyra2rev2",
    LYRA2REV3: "lyra2rev3",
    LYRA2Z: "lyra2z",
    SCRYPTN: "scryptn",
    NEOSCRYPT: "neoscrypt",
    BLAKE256R8: "blake256r8",
    BLAKE256R14: "blake256r14",
    BLAKE2S: "blake2s",
    KECCAK: "keccak",
    NIST5: "nist5",
    QUBIT: "qubit",
    QUARK: "quark",
    WHIRLPOOLX: "whirlpoolx",
    DECRED: "decred",
    SIA: "sia",
    LBRY: "lbry",
    PASCAL: "pascal",
    ZHASH: "zhash",
    BEAM: "beam",
    BEAMV2: "beamv2",
    BEAMV3: "beamv3",
    GRINCUCKAROO29: "grincuckaroo29",
    GRINCUCKATOO31: "grincuckatoo31",
    CUCKOOCYCLE: "cuckoo",
    HANDSHAKE: "handshake",
    AUTOLYKOS: "autolykos",
    OCTOPUS: "octopus",
    VERUSHASH: "verushash",
    KHEAVYHASH: "kheavyhash",
    KASPA: "kheavyhash",
    NEXAPOW: "nexapow",
    ALEPHIUM: "alephium",
    FISHHASH: "fishhash",
    IRONFISH: "ironfish",
    KARLSENHASH: "karlsenhash",
    PYRINHASH: "pyrinhash",
    EAGLESONG: "eaglesong",
  };

  return keyMap[niceHashAlgo] || null;
}

export const COINGECKO_BY_CURRENCY = {
  BTC: "bitcoin",
  LTC: "litecoin",
  DOGE: "dogecoin",
  BCH: "bitcoin-cash",
  ETH: "ethereum",
  ETC: "ethereum-classic",
};

export const PRICE_CURRENCIES = ["BTC", "ETH", "LTC", "DOGE", "BCH"];

export const FALLBACK_BTC_RATES = {
  ETH: 0.02635,
  LTC: 0.000715,
  DOGE: 0.00000117,
  BCH: 0.00327,
  ETC: 0.000117,
};