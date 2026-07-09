import { HASHRATE_SUFFIXES } from "../../core/mapping.js";

export const formatPercent = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "N/A";
  return `${num > 0 ? "+" : ""}${num.toFixed(2)}%`;
};

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