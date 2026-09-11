// components/pools/importPoolsFromXlsx.js
// Maps rows parsed from an XLSX file into pool objects usable by the verifier.

import {
  poolHelpers as ph,
  sanitizeNhClientTag,
} from "../../core/poolUtils.js";

const DEFAULT_PASSWORD = "x";
const DEFAULT_NAME_PREFIX = "Imported Pool";

/** Header aliases are matched after lower-casing and stripping punctuation. */
const HEADER_ALIASES = {
  name: ["poolname", "name", "label", "pool"],
  id: ["poolid", "id"],
  algorithm: ["algorithmraw", "algorithm", "miningalgorithm", "algo"],
  stratumHost: ["stratumhost", "stratumhostname", "host"],
  stratumPort: ["stratumport", "port"],
  username: ["username", "user", "pooluser"],
  password: ["password", "pass"],
  location: ["location", "market", "servicelocation"],
  nhClient: ["nhclient", "client", "nhandle"],
};

function normalizeHeader(header) {
  return String(header || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Builds a lookup from normalized header to the original column name. */
function buildHeaderIndex(row) {
  const index = {};
  Object.keys(row || {}).forEach((column) => {
    index[normalizeHeader(column)] = column;
  });
  return index;
}

function readField(row, headerIndex, field) {
  const aliases = HEADER_ALIASES[field] || [];
  for (const alias of aliases) {
    const column = headerIndex[alias];
    if (!column) continue;
    const value = row[column];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

function toPort(value) {
  const port = Number(String(value).trim());
  return Number.isFinite(port) && port > 0 ? port : 0;
}

/**
 * Converts one spreadsheet row into a pool object, or returns null when the
 * row lacks the fields required to run a verification.
 */
export function mapRowToPool(row, position, fallbackClient = "BT") {
  const headerIndex = buildHeaderIndex(row);

  const algorithm = String(readField(row, headerIndex, "algorithm")).trim();
  const stratumHost = String(readField(row, headerIndex, "stratumHost")).trim();
  const stratumPort = toPort(readField(row, headerIndex, "stratumPort"));
  const username = String(readField(row, headerIndex, "username")).trim();

  if (!algorithm || !stratumHost || !stratumPort || !username) return null;

  const client = sanitizeNhClientTag(
    readField(row, headerIndex, "nhClient"),
    fallbackClient,
  );
  const name =
    String(readField(row, headerIndex, "name")).trim() ||
    `${DEFAULT_NAME_PREFIX} ${position + 1}`;
  const id = String(readField(row, headerIndex, "id")).trim();
  const location = readField(row, headerIndex, "location");

  const pool = {
    name,
    algorithm,
    miningAlgorithm: algorithm,
    stratumHost,
    stratumHostname: stratumHost,
    stratumPort,
    username,
    password:
      String(readField(row, headerIndex, "password")).trim() || DEFAULT_PASSWORD,
    nhClient: client,
    client,
    poolVerificationServiceLocation: ph.normalizeLocation(location),
  };

  if (id) pool.id = id;

  return pool;
}

/**
 * Maps parsed XLSX rows into pools.
 * @returns {{ pools: object[], skipped: number }}
 */
export function buildPoolsFromXlsxRows(rows, fallbackClient = "BT") {
  const pools = [];
  let skipped = 0;

  (rows || []).forEach((row) => {
    const pool = mapRowToPool(row, pools.length, fallbackClient);
    if (pool) pools.push(pool);
    else skipped += 1;
  });

  return { pools, skipped };
}

/**
 * Reads an XLSX file and maps it into pools.
 * @returns {Promise<{ pools: object[], skipped: number }>}
 */
export async function importPoolsFromXlsxFile(file, fallbackClient = "BT") {
  const rows = await ph.parseXlsx(file);
  return buildPoolsFromXlsxRows(rows, fallbackClient);
}
