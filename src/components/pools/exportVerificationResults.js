// components/pools/exportVerificationResults.js
// Builds spreadsheet rows from pool verification results and writes them to XLSX.

import { poolHelpers as ph, getAlgoDisplayName } from "../../core/poolUtils.js";

const STATUS_PENDING = "PENDING";
const STATUS_SUCCESS = "SUCCESS";
const STATUS_ERROR = "ERROR";
const STATUS_SKIPPED = "SKIPPED";

const SKIPPED_MARKER = "Skipped";
const PENDING_MESSAGE = "Pending verification";

const MIN_COLUMN_WIDTH = 12;
const MAX_COLUMN_WIDTH = 60;
const COLUMN_WIDTH_PADDING = 2;
const SHEET_NAME = "Pool Verification";

/** True while a result is still being fetched. */
export function isPendingResult(item) {
  return Boolean(item?.result?.pending);
}

/** True when the verify loop deliberately skipped the pool. */
export function isSkippedResult(item) {
  if (isPendingResult(item)) return false;
  const message = ph.getVerifyMessage(item?.result);
  return typeof message === "string" && message.includes(SKIPPED_MARKER);
}

/** Normalized status label for a verification entry. */
export function getResultStatus(item) {
  if (isPendingResult(item)) return STATUS_PENDING;
  if (isSkippedResult(item)) return STATUS_SKIPPED;
  return item?.result?.ok ? STATUS_SUCCESS : STATUS_ERROR;
}

/** Entries that finished verifying (skipped pools count as finished). */
export function getCompletedResults(verifyResults) {
  return (verifyResults || []).filter((item) => !isPendingResult(item));
}

function firstDefined(...values) {
  return values.find(
    (value) => value !== undefined && value !== null && value !== "",
  );
}

/**
 * Verification entries carry the pool config either on `poolDetails`
 * (fetched pool) or on `requestBody` (the payload that was sent).
 */
function resolvePoolConfig(item) {
  return item?.result?.poolDetails || item?.result?.requestBody || {};
}

function resolveMessage(item) {
  if (isPendingResult(item)) return PENDING_MESSAGE;
  return ph.getVerifyMessage(item?.result) || "";
}

function resolveAlgorithm(item) {
  return (
    item?.algorithm || ph.getVerifyAlgo(item?.result) || "Unknown"
  );
}

/** Flattens a single verification entry into a spreadsheet row. */
export function buildExportRow(item, exportedAt = "") {
  const config = resolvePoolConfig(item);
  const algorithm = resolveAlgorithm(item);

  return {
    "NH Client": firstDefined(config.nhClient, config.client, "") || "",
    "Pool Name": item?.label || "",
    "Pool ID": item?.key === undefined || item?.key === null ? "" : String(item.key),
    Status: getResultStatus(item),
    Algorithm: getAlgoDisplayName(algorithm),
    "Algorithm (Raw)": algorithm,
    "Stratum Host": firstDefined(
      config.stratumHost,
      config.stratumHostname,
      config.host,
      "",
    ),
    "Stratum Port": firstDefined(config.stratumPort, config.port, ""),
    Username: firstDefined(config.username, config.user, ""),
    Password: firstDefined(config.password, config.pass, ""),
    Location: firstDefined(
      config.poolVerificationServiceLocation,
      config.serviceLocation,
      config.location,
      config.market,
      "",
    ),
    "HTTP Status": firstDefined(item?.result?.status, ""),
    Message: resolveMessage(item),
    "Exported At": exportedAt,
  };
}

/** Builds export rows for every completed verification entry. */
export function buildExportRows(verifyResults, exportedAt = "") {
  return getCompletedResults(verifyResults).map((item) =>
    buildExportRow(item, exportedAt),
  );
}

/** Readable column widths derived from the widest cell in each column. */
export function computeColumnWidths(rows) {
  if (rows.length === 0) return null;
  const headers = Object.keys(rows[0]);

  return headers.map((header) => {
    const longest = rows.reduce((widest, row) => {
      const value = row[header];
      const length =
        value === undefined || value === null ? 0 : String(value).length;
      return Math.max(widest, length);
    }, header.length);

    return {
      wch: Math.min(
        Math.max(longest + COLUMN_WIDTH_PADDING, MIN_COLUMN_WIDTH),
        MAX_COLUMN_WIDTH,
      ),
    };
  });
}

function buildFilename(exportedAt) {
  const stamp = exportedAt
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .replace("Z", "");
  return `pool_verification_${stamp}.xlsx`;
}

/**
 * Writes completed verification results to an XLSX download.
 * @returns {{ rowCount: number, filename: string | null }}
 */
export function exportVerificationResultsToXlsx(verifyResults) {
  const exportedAt = new Date().toISOString();
  const rows = buildExportRows(verifyResults, exportedAt);

  if (rows.length === 0) {
    return { rowCount: 0, filename: null };
  }

  const filename = buildFilename(exportedAt);
  ph.exportToXlsx(rows, filename, {
    sheetName: SHEET_NAME,
    columnWidths: computeColumnWidths(rows),
  });

  return { rowCount: rows.length, filename };
}
