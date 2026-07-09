import { HASHRATE_SUFFIXES } from "../../../core/mapping.js";

export const cleanHashrateUnit = (unit) => {
  const match = String(unit || "")
    .toUpperCase()
    .match(/GSOL|MSOL|KSOL|SOL|E|P|T|G|M|K|H/);
  return match?.[0] || "H";
};

export const formatHashrateWithUnit = (value, unit) => {
  if (!value || value <= 0) return "0H";
  const cleanUnit = cleanHashrateUnit(unit || "H");
  const multiplier = HASHRATE_SUFFIXES[cleanUnit] || 1;
  const rawH = value * multiplier;
  const units = ["H", "K", "M", "G", "T", "P", "E"];
  const mults = [1, 1e3, 1e6, 1e9, 1e12, 1e15, 1e18];
  let idx = 0;
  for (let i = mults.length - 1; i >= 0; i--) {
    if (rawH >= mults[i]) {
      idx = i;
      break;
    }
  }
  const val = rawH / mults[idx];
  return `${val.toFixed(2)}${units[idx]}`;
};

export const convertHashrateValue = (value, fromUnit, toUnit) => {
  const fromMultiplier = HASHRATE_SUFFIXES[cleanHashrateUnit(fromUnit)] || 1;
  const toMultiplier = HASHRATE_SUFFIXES[cleanHashrateUnit(toUnit)] || 1;
  return (value * fromMultiplier) / toMultiplier;
};

export const getRawHashrateValue = (hashrate) => {
  if (!hashrate) return 0;
  if (typeof hashrate === 'number') return hashrate;
  if (typeof hashrate === 'string') return parseFloat(hashrate) || 0;
  if (typeof hashrate === 'object') {
    // Try common property names
    const val = hashrate.value || hashrate.amount || hashrate.hash || hashrate.hashrate || 0;
    return parseFloat(val) || 0;
  }
  return 0;
};

export const getHashrateUnit = (hashrate) => {
  if (!hashrate) return "H";
  if (typeof hashrate === 'object') {
    return hashrate.unit || hashrate.suffix || hashrate.type || "H";
  }
  return "H";
};