// mrrUtils.js - COMPLETE FIXED VERSION

import { parsePriceValue as parsePriceValueUtils } from "./priceUtils.js";

// ============================================
// UNIT CONSTANTS
// ============================================

/** Power factor mapping for normalization (EH/s base) */
export const UNIT_TO_POWER = {
  EH: 0,
  PH: -3,
  TH: -6,
  GH: -9,
  MH: -12,
  KH: -15,
  H: -18,
  GSOL: -9,
  MSOL: -12,
  KSOL: -15,
  SOL: -18,
  E: 0,
  P: -3,
  T: -6,
  G: -9,
  M: -12,
  K: -15,
  EHS: 0,
  PHS: -3,
  THS: -6,
  GHS: -9,
  MHS: -12,
  KHS: -15,
};

/** Hashrate unit multipliers relative to H/s */
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
  Sol: 1,
  Graph: 1,
  kH: 1e3,
  MSol: 1e6,
  GSol: 1e9,
};

// ============================================
// UNIT HELPERS
// ============================================

/** Robustly extract base unit (e.g., 'GH/s' or 'BTC/TH/Day' -> 'GH' or 'TH') */
export const cleanUnit = (u) => {
  const str = String(u || "")
    .toUpperCase()
    .trim();

  const m = str.match(/(GSOL|MSOL|KSOL|SOL|EHS|PHS|THS|GHS|MHS|KHS|EH|PH|TH|GH|MH|KH|H)/) ||
    str.match(/\b(E|P|T|G|M|K|H)\b/);
  if (!m) return "TH";
  let unit = m[0];
  const singleMap = { E: "EH", P: "PH", T: "TH", G: "GH", M: "MH", K: "KH" };
  return singleMap[unit] || unit;
};

/**
 * Converts a price between different units
 * @param {number} price - The price value to convert
 * @param {string} fromUnit - The source unit (e.g., 'PH', 'TH')
 * @param {string} toUnit - The target unit (e.g., 'PH', 'TH')
 * @returns {number} The converted price
 */
export const convertPriceBetweenUnits = (price, fromUnit, toUnit) => {
  if (!price || price <= 0) return 0;
  if (!fromUnit || !toUnit) return price;
  
  const fromPower = UNIT_TO_POWER[cleanUnit(fromUnit)] ?? -6;
  const toPower = UNIT_TO_POWER[cleanUnit(toUnit)] ?? -6;
  return price * Math.pow(10, fromPower - toPower);
};

/**
 * Calculates the percentage difference between MRR and NiceHash prices
 * @param {number} mrrPrice - MRR price
 * @param {string} mrrUnit - MRR unit
 * @param {number} nhPrice - NiceHash price
 * @param {string} nhUnit - NiceHash unit
 * @returns {number|null} Percentage difference, or null if invalid
 */
export function calculatePriceComparison(mrrPrice, mrrUnit, nhPrice, nhUnit) {
  const nhPriceNum = Number.parseFloat(nhPrice || 0);
  const mrrPriceNum = Number.parseFloat(mrrPrice || 0);

  if (nhPriceNum <= 0 || mrrPriceNum <= 0) return null;
  
  const mrrUnitClean = cleanUnit(mrrUnit);
  const nhUnitClean = cleanUnit(nhUnit);

  const mrrP = UNIT_TO_POWER[mrrUnitClean] ?? -6;
  const nhP = UNIT_TO_POWER[nhUnitClean] ?? -6;

  const mrrPriceNorm = mrrPriceNum / Math.pow(10, mrrP);
  const nhPriceNorm = nhPriceNum / Math.pow(10, nhP);

  if (nhPriceNorm === 0) return null;
  return ((mrrPriceNorm - nhPriceNorm) / nhPriceNorm) * 100;
}

// ============================================
// NICEHASH PRICE HELPERS
// ============================================

/**
 * Extracts NiceHash price and normalizes it to TH/s for consistent comparison
 * @param {object|number|string} rawNhData - Raw NiceHash price data
 * @returns {number} Price normalized to TH/s
 */
export function getNiceHashPriceValue(rawNhData) {
  if (rawNhData === undefined || rawNhData === null) return 0;
  
  // If it's already a number, return it
  if (typeof rawNhData === "number") return rawNhData;
  if (typeof rawNhData === "string") return parsePriceValueUtils(rawNhData);

  // Extract price data
  const nhData = rawNhData?.price || rawNhData;
  
  let price = 0;
  let unit = "TH";
  
  if (nhData) {
    price = parseFloat(
      nhData.fixedPrice ??
      nhData.standardPrice?.fast ??
      nhData.standardPrice ??
      nhData.price ??
      nhData.amount ??
      nhData.total ??
      0
    );
    unit = nhData.speedUnit || nhData.unit || nhData.price_unit || "TH";
  }
  
  // Try raw data if price is still 0
  if (price === 0) {
    price = parseFloat(
      rawNhData.fixedPrice ??
      rawNhData.standardPrice?.fast ??
      rawNhData.standardPrice ??
      rawNhData.price ??
      rawNhData.amount ??
      rawNhData.total ??
      0
    );
    unit = rawNhData.speedUnit || rawNhData.unit || rawNhData.price_unit || "TH";
  }

  // Normalize to TH/s for consistent comparison
  return convertPriceBetweenUnits(price, unit, "TH");
}

/**
 * Gets NiceHash price with its original unit
 * @param {object|number|string} rawNhData - Raw NiceHash price data
 * @returns {{price: number, unit: string}} Price and its unit
 */
export function getNiceHashPriceWithUnit(rawNhData) {
  if (rawNhData === undefined || rawNhData === null) {
    return { price: 0, unit: "TH" };
  }
  
  if (typeof rawNhData === "number") {
    return { price: rawNhData, unit: "TH" };
  }
  if (typeof rawNhData === "string") {
    return { price: parsePriceValueUtils(rawNhData), unit: "TH" };
  }

  const nhData = rawNhData?.price || rawNhData;
  let price = 0;
  let unit = "TH";
  
  if (nhData) {
    price = parseFloat(
      nhData.fixedPrice ??
      nhData.standardPrice?.fast ??
      nhData.standardPrice ??
      nhData.price ??
      nhData.amount ??
      nhData.total ??
      0
    );
    unit = nhData.speedUnit || nhData.unit || nhData.price_unit || "TH";
  }
  
  if (price === 0) {
    price = parseFloat(
      rawNhData.fixedPrice ??
      rawNhData.standardPrice?.fast ??
      rawNhData.standardPrice ??
      rawNhData.price ??
      rawNhData.amount ??
      rawNhData.total ??
      0
    );
    unit = rawNhData.speedUnit || rawNhData.unit || rawNhData.price_unit || "TH";
  }

  return { price, unit };
}

// ============================================
// PRICE HELPERS
// ============================================

/**
 * Parses a price value from various formats
 * @param {any} price - Price value in various formats
 * @returns {number} Parsed price
 */
export function parsePriceValueLocal(price) {
  if (price === undefined || price === null) return 0;
  if (typeof price === "number") return price;
  if (typeof price === "string") {
    const cleaned = price.replace(/,/g, "").replace(/[^\d.-]/g, "");
    return parseFloat(cleaned) || 0;
  }
  if (typeof price === "object") {
    const candidate =
      price.price ??
      price.paid ??
      price.advertised ??
      price.amount ??
      price.total;
    if (candidate !== undefined) return parsePriceValueLocal(candidate);
    const nested = Object.values(price).find(
      (val) =>
        typeof val === "object" &&
        (val.price !== undefined || val.paid !== undefined),
    );
    if (nested) return parsePriceValueLocal(nested.price ?? nested.paid);
  }
  return 0;
}

/**
 * Gets price data from various sources
 * @param {any} source - Price source
 * @returns {{value: number, currency: string}} Price data
 */
export function getPriceDataLocal(source) {
  if (source === undefined || source === null) {
    return { value: 0, currency: "BTC" };
  }
  if (typeof source === "number") {
    return { value: source, currency: "BTC" };
  }
  if (typeof source === "string") {
    return { value: parsePriceValueLocal(source), currency: "BTC" };
  }

  const obj = source;
  if (typeof obj === "object") {
    const getObjValue = (key) => {
      const normalized = obj[key];
      if (normalized === undefined) return undefined;
      if (typeof normalized === "object") {
        const nested =
          normalized.paid ??
          normalized.price ??
          normalized.amount ??
          normalized.total ??
          normalized.value ??
          normalized;
        return parsePriceValueLocal(nested);
      }
      return parsePriceValueLocal(normalized);
    };

    const currency = String(
      obj.currency || obj.price_unit || "BTC",
    ).toUpperCase();

    const preferredKeys = ["BTC", "USD", "LTC"];
    for (const key of preferredKeys) {
      const value = getObjValue(key);
      if (value !== undefined) return { value, currency: key.toUpperCase() };
    }

    const directValue =
      obj.paid ?? obj.price ?? obj.advertised ?? obj.amount ?? obj.total;
    if (directValue !== undefined) {
      return { value: parsePriceValueLocal(directValue), currency };
    }

    for (const key of Object.keys(obj)) {
      if (key === "paid" || key === "currency" || key === "price_unit") continue;
      const v = getObjValue(key);
      if (v !== undefined) return { value: v, currency: key.toUpperCase() };
    }
  }

  return { value: 0, currency: "BTC" };
}

// ============================================
// HASHRATE HELPERS
// ============================================

/**
 * Formats a hashrate value with its unit
 * @param {any} rate - Hashrate value
 * @returns {string} Formatted hashrate
 */
export function formatHashrateValue(rate) {
  if (!rate) return "0 N/A";
  if (typeof rate === "string" || typeof rate === "number") return String(rate);
  if (rate.nice) return rate.nice;
  const hash = rate.hash ?? rate.advertised ?? 0;
  const parsed = Number.parseFloat(hash);
  const displayHash = Number.isFinite(parsed)
    ? parsed.toFixed(2)
    : String(hash);
  return `${displayHash} ${String(rate.type || "").toUpperCase()}`.trim();
}

/**
 * Gets raw hashrate value as a number
 * @param {any} rate - Hashrate value
 * @returns {number} Raw hashrate
 */
export function getRawHashrate(rate) {
  if (!rate) return 0;
  if (typeof rate === "number") return rate;
  if (typeof rate === "string") return parseFloat(rate) || 0;
  return parseFloat(rate.hash ?? rate.hashrate ?? rate.advertised ?? 0);
}

/**
 * Gets rental algorithm from rental data
 * @param {object} rental - Rental data
 * @returns {string} Algorithm name
 */
export function getRentalAlgorithm(rental) {
  return (
    rental?.rig?.type ||
    rental?.algorithm ||
    rental?.normalized?.algorithm ||
    "N/A"
  );
}

/**
 * Gets rental advertised hashrate
 * @param {object} rental - Rental data
 * @returns {string} Formatted advertised hashrate
 */
export function getRentalAdvertisedHashrate(rental) {
  const rate =
    rental?.hashrate?.advertised || rental?.rig?.hashrate?.advertised;
  return (
    formatHashrateValue(rate) ||
    rental?.normalized?.niceAdvertisedHashrate ||
    "0 N/A"
  );
}

/**
 * Gets rental average hashrate
 * @param {object} rental - Rental data
 * @returns {string} Formatted average hashrate
 */
export function getRentalAverageHashrate(rental) {
  const rate = rental?.hashrate?.average || rental?.rig?.hashrate?.average;
  return (
    formatHashrateValue(rate) ||
    rental?.normalized?.niceAverageHashrate ||
    "0 N/A"
  );
}

/**
 * Gets rental efficiency
 * @param {object} rental - Rental data
 * @returns {string} Efficiency percentage
 */
export function getRentalEfficiency(rental) {
  return String(
    rental?.hashrate?.average?.percent || rental?.normalized?.percent || "0",
  );
}

// ============================================
// CLIENT HELPERS
// ============================================

/**
 * Gets badge style for a client
 * @param {string} client - Client name
 * @returns {object} Style object
 */
export const getClientBadgeStyle = (client) => {
  const c = String(client || "").toUpperCase();
  const styles = {
    BT: { background: "#2563eb", color: "#fff" },
    SL: { background: "#d97706", color: "#fff" },
    LN: { background: "#eff308", color: "#fff" },
    VN: { background: "#10b981", color: "#fff" },
    LUCKY: { background: "#ec4899", color: "#fff" },
  };
  return styles[c] || { background: "rgba(255,255,255,0.1)", color: "#94a3b8" };
};

// ============================================
// STATUS HELPERS
// ============================================

/**
 * Gets status class styles
 * @param {any} status - Status value
 * @returns {object} Style object
 */
export const getStatusClass = (status) => {
  const statusValue = typeof status === "object" ? status.status : status;
  const s = String(statusValue || "").toLowerCase();
  if (s.includes("available") || s.includes("online")) {
    return {
      color: "#10b981",
      background: "rgba(16, 185, 129, 0.1)",
      border: "1px solid rgba(16, 185, 129, 0.2)",
    };
  }
  if (s.includes("rented") || s.includes("active")) {
    return {
      color: "#a78bfa",
      background: "rgba(167, 139, 250, 0.1)",
      border: "1px solid rgba(167, 139, 250, 0.2)",
    };
  }
  if (s.includes("offline") || s.includes("disabled")) {
    return {
      color: "#f87171",
      background: "rgba(248, 113, 113, 0.1)",
      border: "1px solid rgba(248, 113, 113, 0.2)",
    };
  }
  return {
    color: "#94a3b8",
    background: "rgba(148, 163, 184, 0.1)",
    border: "1px solid rgba(148, 163, 184, 0.2)",
  };
};

/**
 * Gets ROI color based on value
 * @param {number} value - ROI percentage
 * @returns {string} Color string
 */
export const getRoiColor = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "#94a3b8";

  const clamped = Math.max(-100, Math.min(100, num));
  if (clamped === 0) return "#fbbf24";

  if (clamped > 0) {
    const t = Math.min(1, clamped / 100);
    const hue = 48 + 72 * t;
    return `hsl(${hue}, 95%, 58%)`;
  }

  const t = Math.min(1, Math.abs(clamped) / 100);
  const hue = 8 + 40 * (1 - t);
  return `hsl(${hue}, 92%, 58%)`;
};

// ============================================
// TIME HELPERS
// ============================================

/**
 * Formats rental start time
 * @param {string} startTime - Start time string
 * @returns {string} Formatted time
 */
export function formatRentalStartTime(startTime) {
  if (!startTime) return "N/A";
  const normalized = /\bUTC\b/i.test(String(startTime))
    ? String(startTime)
    : `${startTime} UTC`;
  const date = new Date(normalized);
  if (isNaN(date.getTime())) return startTime;

  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return `Starts at ${date.toLocaleTimeString()}`;

  const diffSec = Math.floor(diffMs / 1000);
  const d = Math.floor(diffSec / 86400);
  const h = Math.floor((diffSec % 86400) / 3600);
  const m = Math.floor((diffSec % 3600) / 60);

  let elapsed = "";
  if (d > 0) elapsed += `${d}d `;
  if (h > 0 || d > 0) elapsed += `${h}h `;
  elapsed += `${m}m`;

  return elapsed;
}

// ============================================
// ARRAY HELPERS
// ============================================

/**
 * Finds rig array in an object
 * @param {object} obj - Object to search
 * @returns {array} Array of rigs
 */
export function findRigArray(obj) {
  if (!obj || typeof obj !== "object") return [];
  if (Array.isArray(obj)) return obj;
  if (Array.isArray(obj.rigs)) return obj.rigs;
  if (Array.isArray(obj.data)) return obj.data;

  for (const key in obj) {
    const result = findRigArray(obj[key]);
    if (result && result.length > 0) return result;
  }
  return [];
}

// ============================================
// PRICE UTILITY EXPORTS
// ============================================

/**
 * Alias for parsePriceValueLocal (backward compatibility)
 * @deprecated Use parsePriceValueLocal instead
 */
export const parsePriceValueLocalAlias = parsePriceValueLocal;

/**
 * Alias for getPriceDataLocal (backward compatibility)
 * @deprecated Use getPriceDataLocal instead
 */
export const getPriceDataLocalAlias = getPriceDataLocal;

// ============================================
// EXPORTS
// ============================================

// Default export for convenience
export default {
  UNIT_TO_POWER,
  HASHRATE_SUFFIXES,
  cleanUnit,
  convertPriceBetweenUnits,
  calculatePriceComparison,
  getNiceHashPriceValue,
  getNiceHashPriceWithUnit,
  parsePriceValueLocal,
  getPriceDataLocal,
  formatHashrateValue,
  getRawHashrate,
  getRentalAlgorithm,
  getRentalAdvertisedHashrate,
  getRentalAverageHashrate,
  getRentalEfficiency,
  getClientBadgeStyle,
  getStatusClass,
  getRoiColor,
  formatRentalStartTime,
  findRigArray,
};