// poolUtils.js - COMPLETE VERSION

import * as XLSX from "xlsx";
// ✅ Import from mapping
import { getAlgoMapping, normalizeAlgo } from "./mapping.js";

// ============================================
// CONSTANTS
// ============================================
const DEFAULT_VERIFICATION_LOCATION = "ANY";
const KNOWN_NH_CLIENTS = new Set(["BT", "PH", "LN", "NHATLINH", "VN", "ALL"]);

// ============================================
// ✅ EXPORT: Algorithm Display Helpers
// ============================================

/**
 * Gets the user-friendly display name for an algorithm.
 * @param {string} algo - The algorithm name (any format)
 * @returns {string} The display name
 */
export function getAlgoDisplayName(algo) {
  if (!algo) return 'Unknown';
  
  const mapping = getAlgoMapping(algo);
  if (mapping && mapping.displayName) {
    return mapping.displayName;
  }
  
  return String(algo)
    .split(/[\s_-]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Gets the normalized algorithm key.
 * @param {string} algo - The algorithm name (any format)
 * @returns {string} The normalized key
 */
export function getAlgoKey(algo) {
  return normalizeAlgo(algo) || 'UNKNOWN';
}

/**
 * Gets the hashrate unit for an algorithm.
 * @param {string} algo - The algorithm name (any format)
 * @returns {string} The unit (e.g., 'GH', 'TH')
 */
export function getAlgorithmUnit(algo) {
  const mapping = getAlgoMapping(algo);
  return mapping.unit || 'H';
}

// ============================================
// EXPORT: Client Helpers
// ============================================

export function sanitizeNhClientTag(value, fallback = "BT") {
  const candidate = String(value || "").trim().toUpperCase();
  if (KNOWN_NH_CLIENTS.has(candidate)) return candidate;
  const safeFallback = String(fallback || "BT").trim().toUpperCase();
  return KNOWN_NH_CLIENTS.has(safeFallback) ? safeFallback : "BT";
}

// ============================================
// EXPORT: Array Helpers
// ============================================

/** Safely extracts an array from various MRR API response shapes */
export function extractArray(
  payload,
  keys = ["rentals", "rigs", "list", "result", "items", "data"],
) {
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.rigs)) return payload.rigs;
  if (Array.isArray(payload.data)) return payload.data;

  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key];
  }

  if (payload.data && typeof payload.data === "object") {
    return extractArray(payload.data, keys);
  }

  return [];
}

// ============================================
// EXPORT: Location Helpers
// ============================================

const LOCATION_MAP = {
  EU: "EUROPE",
  EUROPE: "EUROPE",
  USA: "USA",
  US: "USA",
  US_EAST: "USA_EAST",
  USA_EAST: "USA_EAST",
  EUROPE_NORTH: "EUROPE_NORTH",
  SA: "SOUTH_AMERICA",
  SOUTH_AMERICA: "SOUTH_AMERICA",
  ASIA: "ASIA",
  JP: "JAPAN",
  JAPAN: "JAPAN",
  IN: "INDIA",
  INDIA: "INDIA",
  BR: "BRAZIL",
  BRAZIL: "BRAZIL",
  RU: "RUSSIA",
  RUSSIA: "RUSSIA",
  ANY: "ANY",
};

// ============================================
// EXPORT: API Helpers
// ============================================

export async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const storedToken =
    typeof localStorage !== "undefined" ? localStorage.getItem("token") : "";

  if (
    storedToken &&
    !headers.Authorization &&
    !headers.authorization &&
    !String(path || "").startsWith("/api/auth/")
  ) {
    headers.Authorization = `Bearer ${storedToken}`;
  }

  const res = await fetch(path, {
    ...options,
    headers,
  });
  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await res.json()
    : await res.text();
  return { ok: res.ok, status: res.status, data, headers: res.headers };
}

// ============================================
// EXPORT: Pool Data Helpers
// ============================================

export const poolHelpers = {
  getKey: (p, i = 0) =>
    String(p?.id || p?.poolId || p?.name || p?.__generatedId || `gen-${i}`),
  getId: (p) => p?.id || p?.poolId,
  getLabel: (p, i = 0) =>
    String(
      p?.name || p?.id || p?.poolId || p?.__generatedId || `Pool ${i + 1}`,
    ),
  getAlgo: (p) => {
    let val =
      p?.miningAlgorithm || p?.algorithm || (typeof p === "string" ? p : null);
    if (val && typeof val === "object")
      val = val.code || val.enumName || val.name || "Unknown";
    let str = String(val || "Unknown");
    if (str.includes(":")) str = str.split(":").pop().trim();
    return str;
  },

  normalizeList: (data) => {
    let list = [];
    if (Array.isArray(data)) list = data;
    else if (!data) list = [];
    else if (Array.isArray(data.list)) list = data.list;
    else if (Array.isArray(data.pools)) list = data.pools;
    else if (data.result && Array.isArray(data.result.pools))
      list = data.result.pools;
    else if (typeof data === "object") list = Object.values(data);

    return (Array.isArray(list) ? list : []).map((item, index) => {
      const obj =
        typeof item === "object" && !Array.isArray(item)
          ? { ...item }
          : { value: item };
      const normalizedClient = sanitizeNhClientTag(
        obj.nhClient ?? obj.client,
        obj.nhClient ?? obj.client ?? "BT",
      );
      obj.nhClient = normalizedClient;
      if (obj.client !== undefined) {
        obj.client = sanitizeNhClientTag(obj.client, normalizedClient);
      }
      if (!obj.id && !obj.poolId && !obj.name)
        obj.__generatedId = `gen-${index}`;
      return obj;
    });
  },

  getVerifyMessage: (result) => {
    const data = result?.data || result;
    if (!data) return "No response";

    // Prioritize specific error or status messages
    if (data.error) return data.error;
    if (data.message) return data.message;
    if (data.stopped) return data.message || "Stopped";

    // If logs are present, use the last one for a summary
    if (Array.isArray(data.logs) && data.logs.length > 0) {
      return (
        data.logs[data.logs.length - 1]?.message || "Verification completed"
      );
    }

    // Fallback for simple success/fail cases
    return poolHelpers.isVerifySuccess(result) ? "Verified" : "Verification failed";
  },

  getVerifyLogs: (result) => {
    const logs = result?.data?.logs || result?.logs;
    return Array.isArray(logs) ? logs : [];
  },

  getVerifyAlgo: (result) => {
    let val =
      result?.requestBody?.miningAlgorithm ||
      result?.poolDetails?.miningAlgorithm ||
      result?.poolDetails?.algorithm;

    if (!val) {
      const logs = result?.data?.logs || result?.logs;
      if (Array.isArray(logs)) {
        const found = logs.find(
          (l) => l.message && l.message.includes("mining algorithm:"),
        );
        if (found) val = found.message;
      }
    }

    if (val && typeof val === "object")
      val = val.code || val.enumName || val.name || "Unknown";
    let str = String(val || "Unknown");
    if (str.includes(":")) str = str.split(":").pop().trim();
    return str;
  },

  normalizeLocation: (val) =>
    LOCATION_MAP[
      String(val || "")
        .trim()
        .toUpperCase()
    ] || DEFAULT_VERIFICATION_LOCATION,

  buildVerifyBody: (pool) =>
    !pool
      ? null
      : {
          poolVerificationServiceLocation: poolHelpers.normalizeLocation(
            pool.poolVerificationServiceLocation ||
              pool.serviceLocation ||
              pool.location ||
              pool.market,
          ),
          miningAlgorithm: pool.miningAlgorithm || pool.algorithm,
          stratumHost: pool.stratumHost || pool.stratumHostname || pool.host,
          stratumPort: Number(pool.stratumPort || pool.port),
          username: pool.username,
          password: pool.password,
        },

  buildSaveBody: (pool) =>
    !pool
      ? null
      : {
          ...(pool.id || pool.poolId ? { id: pool.id || pool.poolId } : {}),
          name: pool.name,
          algorithm: pool.algorithm || pool.miningAlgorithm,
          stratumHostname:
            pool.stratumHostname || pool.stratumHost || pool.host,
          stratumPort: Number(pool.stratumPort || pool.port),
          username: pool.username,
          password: pool.password,
        },

  getMissingVerifyFields: (p) =>
    Object.entries(p || {})
      .filter(
        ([, v]) => v === undefined || v === null || v === "" || Number.isNaN(v),
      )
      .map(([k]) => k),

  getMissingSaveFields: (p) =>
    [
      "name",
      "algorithm",
      "stratumHostname",
      "stratumPort",
      "username",
      "password",
    ].filter(
      (k) =>
        p?.[k] === undefined ||
        p?.[k] === null ||
        p?.[k] === "" ||
        Number.isNaN(p?.[k]),
    ),

  isVerifySuccess: (result) => {
    if (!result || result.ok === false) return false;
    const data = result.data || result;
    return !(data.success === false || data.valid === false || data.error);
  },

  exportToXlsx: (data, filename = "export.xlsx") => {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Results");
    XLSX.writeFile(workbook, filename);
  },

  parseXlsx: async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: "array" });
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);
          resolve(jsonData);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  },

  formatHashrate: (hashrate, algo = "") => {
    if (!hashrate || isNaN(hashrate)) return "0 H/s";
    const val = parseFloat(hashrate);
    const units = ["H/s", "KH/s", "MH/s", "GH/s", "TH/s", "PH/s", "EH/s"];

    let i = 0;
    let displayVal = val;
    while (displayVal >= 1000 && i < units.length - 1) {
      displayVal /= 1000;
      i++;
    }
    return `${displayVal.toFixed(2)} ${units[i]}`;
  },
};

poolHelpers.normalizeMrrPoolsForExport = (mrrPoolData) => {
  if (!mrrPoolData || mrrPoolData.success === false) return [];

  let results = [];
  if (
    mrrPoolData?.data &&
    typeof mrrPoolData.data === "object" &&
    !Array.isArray(mrrPoolData.data) &&
    (mrrPoolData.data.pools || mrrPoolData.data.result)
  ) {
    results = [mrrPoolData.data];
  } else {
    const rawData = mrrPoolData.data || mrrPoolData;
    const extracted = extractArray(rawData, ["pools", "data", "result"]);
    if (
      extracted.length > 0 &&
      !extracted[0].pools &&
      (extracted[0].user || extracted[0].host || extracted[0].stratumHost)
    ) {
      results = [{ id: "UnknownRigOrRental", pools: extracted }];
    } else {
      results = extracted;
    }
  }

  const exportableData = [];
  results.forEach((item) => {
    const rigId = item.rigId || item.rigid || item.id || "N/A";
    const pools = Array.isArray(item.pools) ? item.pools : [];
    pools.forEach((pool) => {
      exportableData.push({
        "Rig/Rental ID": rigId,
        Priority: pool.priority,
        Host: pool.host || pool.stratumHost,
        Port: pool.port || pool.stratumPort,
        Username: pool.user || pool.username,
        Password: pool.pass || pool.password,
        Algorithm: pool.algo || pool.algorithm || pool.type,
        Status: pool.status,
      });
    });
  });
  return exportableData;
};

// ============================================
// EXPORT: API Actions
// ============================================

export const poolApi = {
  list: (client) =>
    apiFetch(`/api/v2/pools${client ? `?client=${client}` : ""}`),
  get: (id, client, signal) => {
    const url = `/api/v2/pool/${encodeURIComponent(id)}${client ? `?client=${client}` : ""}`;
    return apiFetch(url, { signal });
  },
  verify: (body, client, signal) => {
    const url = `/api/v2/pools/verify${client ? `?client=${client}` : ""}`;
    return apiFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  },
  save: (body, client) => {
    const url = `/api/v2/pool${client ? `?client=${client}` : ""}`;
    return apiFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },
  mrrRigs: (client, endpoint, params = {}) => {
    const query = new URLSearchParams({
      ...(client ? { client } : {}),
      ...(endpoint ? { endpoint } : {}),
      ...params,
    });
    return apiFetch(`/api/v2/mrr/rigs?${query.toString()}`);
  },
};

// ============================================
// EXPORT: All functions individually (for named imports)
// ============================================

// Re-export all functions so they can be imported individually
// This is already done above with export function syntax