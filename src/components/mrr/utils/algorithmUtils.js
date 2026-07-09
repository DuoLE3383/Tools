import { 
  normalizeAlgoForNiceHash, 
  getAlgoDisplayName,
  getAlgorithmUnit,
  getMrrAlgorithmUnit,
  getMrrAlgoKey,
  isAsicBoost,
  HASHRATE_SUFFIXES
} from "../../../core/mapping.js";

export const resolveAlgo = (rig, info, algoName) => {
  const rawAlgo = info?.algo || 
    info?.normalized?.algo || 
    rig.algo || 
    rig.algorithm || 
    rig.type || 
    algoName;
  
  const normalizedAlgo = normalizeAlgoForNiceHash(rawAlgo);
  
  return {
    raw: rawAlgo,
    normalized: normalizedAlgo,
    display: getAlgoDisplayName(normalizedAlgo || rawAlgo),
    isAsicBoost: isAsicBoost(normalizedAlgo),
    mrrKey: getMrrAlgoKey(normalizedAlgo),
    mrrUnit: getMrrAlgorithmUnit(normalizedAlgo || rawAlgo),
    nhUnit: getAlgorithmUnit(normalizedAlgo || rawAlgo)
  };
};

export const normalizeOrderAlgo = (order) => {
  const rawOrder = order?.rawOrder || order;
  const pick = (value) => {
    if (!value) return "";
    if (typeof value === "object")
      return value.algorithm || value.displayName || value.name || "";
    return value;
  };
  return normalizeAlgoForNiceHash(
    order?.algo ||
      pick(order?.algorithm) ||
      rawOrder?.algo ||
      pick(rawOrder?.algorithm) ||
      rawOrder?.type,
  );
};

export const resolveAlgoLookupKeys = (...values) => {
  const keys = new Set();

  const addKey = (value) => {
    if (!value) return;
    const raw = String(value).trim();
    if (!raw) return;
    keys.add(raw);
    keys.add(raw.toUpperCase());
    keys.add(raw.toLowerCase());

    const normalized = normalizeAlgoForNiceHash(raw);
    if (normalized && normalized !== "UNKNOWN") {
      keys.add(normalized);
      keys.add(normalized.toLowerCase());
      if (normalized === "SHA256ASICBOOST") {
        keys.add("SHA256AB");
      }
    }
  };

  values.forEach(addKey);
  return Array.from(keys);
};