// components/pools/exportVerificationResults.test.mjs
// Run with: node --test src/components/pools/exportVerificationResults.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as XLSX from "xlsx";

import {
  buildExportRows,
  computeColumnWidths,
  exportVerificationResultsToXlsx,
  getCompletedResults,
  getResultStatus,
} from "./exportVerificationResults.js";

const EXPECTED_COLUMNS = [
  "NH Client",
  "Pool Name",
  "Pool ID",
  "Status",
  "Algorithm",
  "Algorithm (Raw)",
  "Stratum Host",
  "Stratum Port",
  "Username",
  "Password",
  "Location",
  "HTTP Status",
  "Message",
  "Exported At",
];

const verifiedEntry = {
  key: "123",
  label: "my-pool",
  algorithm: "SHA256",
  result: {
    ok: true,
    status: 200,
    data: { message: "Pool verified" },
    poolDetails: {
      id: 123,
      name: "my-pool",
      nhClient: "BT",
      miningAlgorithm: "SHA256",
      stratumHost: "sha256.auto.nicehash.com",
      stratumPort: 9200,
      username: "worker",
      password: "x",
      poolVerificationServiceLocation: "EUROPE",
    },
  },
};

const pendingEntry = {
  key: "456",
  label: "pending-pool",
  algorithm: "SHA256",
  result: { pending: true },
};

const skippedEntry = {
  key: "789",
  label: "skipped-pool",
  algorithm: "SHA256",
  result: { ok: true, data: { message: "Skipped: Active Pool" } },
};

const failedEntry = {
  key: "999",
  label: "err-pool",
  algorithm: "Scrypt",
  result: {
    ok: false,
    status: 400,
    data: { error: "Missing required verify fields: username" },
    requestBody: {
      miningAlgorithm: "Scrypt",
      stratumHost: "scrypt.auto.nicehash.com",
      stratumPort: 3333,
      username: "",
      password: "x",
      poolVerificationServiceLocation: "ANY",
    },
  },
};

test("classifies pending, success, skipped and failed results", () => {
  assert.equal(getResultStatus(verifiedEntry), "SUCCESS");
  assert.equal(getResultStatus(pendingEntry), "PENDING");
  assert.equal(getResultStatus(skippedEntry), "SKIPPED");
  assert.equal(getResultStatus(failedEntry), "ERROR");
});

test("excludes pending results from the completed set", () => {
  const completed = getCompletedResults([
    verifiedEntry,
    pendingEntry,
    skippedEntry,
    failedEntry,
  ]);
  assert.equal(completed.length, 3);
  assert.ok(!completed.some((item) => item.key === "456"));
});

test("maps a verified result using its pool details", () => {
  const [row] = buildExportRows([verifiedEntry], "2026-01-01T00:00:00.000Z");

  assert.equal(row["NH Client"], "BT");
  assert.equal(row["Pool Name"], "my-pool");
  assert.equal(row["Pool ID"], "123");
  assert.equal(row.Status, "SUCCESS");
  assert.equal(row["Algorithm (Raw)"], "SHA256");
  assert.equal(typeof row.Algorithm, "string");
  assert.ok(row.Algorithm.length > 0);
  assert.equal(row["Stratum Host"], "sha256.auto.nicehash.com");
  assert.equal(row["Stratum Port"], 9200);
  assert.equal(row.Username, "worker");
  assert.equal(row.Location, "EUROPE");
  assert.equal(row["HTTP Status"], 200);
  assert.equal(row.Message, "Pool verified");
  assert.equal(row["Exported At"], "2026-01-01T00:00:00.000Z");
});

test("falls back to the request body when pool details are absent", () => {
  const [row] = buildExportRows([failedEntry]);

  assert.equal(row.Status, "ERROR");
  assert.equal(row["Stratum Host"], "scrypt.auto.nicehash.com");
  assert.equal(row["Stratum Port"], 3333);
  assert.equal(row.Location, "ANY");
  assert.equal(row["HTTP Status"], 400);
  assert.equal(row.Message, "Missing required verify fields: username");
});

test("marks skipped results distinctly and never reports them as verified", () => {
  const [row] = buildExportRows([skippedEntry]);
  assert.equal(row.Status, "SKIPPED");
  assert.equal(row.Message, "Skipped: Active Pool");
});

test("returns no file when there is nothing to export", () => {
  assert.deepEqual(exportVerificationResultsToXlsx([]), {
    rowCount: 0,
    filename: null,
  });
  assert.deepEqual(exportVerificationResultsToXlsx([pendingEntry]), {
    rowCount: 0,
    filename: null,
  });
});

test("writes a readable workbook with one row per completed result", () => {
  const result = exportVerificationResultsToXlsx([
    verifiedEntry,
    pendingEntry,
    skippedEntry,
    failedEntry,
  ]);

  assert.equal(result.rowCount, 3);
  assert.ok(result.filename.endsWith(".xlsx"));
  assert.ok(fs.existsSync(result.filename), "workbook file should exist");

  try {
    const workbook = XLSX.read(fs.readFileSync(result.filename), {
      type: "buffer",
    });
    assert.equal(workbook.SheetNames.length, 1);

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    assert.equal(rows.length, 3);
    assert.deepEqual(Object.keys(rows[0]), EXPECTED_COLUMNS);
    assert.deepEqual(
      rows.map((row) => row.Status),
      ["SUCCESS", "SKIPPED", "ERROR"],
    );
    assert.equal(rows[0]["Stratum Host"], "sha256.auto.nicehash.com");
  } finally {
    fs.unlinkSync(result.filename);
  }
});

test("derives readable column widths from the widest cell", () => {
  const rows = buildExportRows([verifiedEntry, failedEntry]);
  const widths = computeColumnWidths(rows);

  assert.equal(widths.length, EXPECTED_COLUMNS.length);
  assert.ok(widths.every((col) => Number.isInteger(col.wch)));

  // "Stratum Host" holds the longest values, so it must be wider than "Status".
  const stratumHostWidth = widths[EXPECTED_COLUMNS.indexOf("Stratum Host")];
  const statusWidth = widths[EXPECTED_COLUMNS.indexOf("Status")];
  assert.ok(stratumHostWidth.wch > statusWidth.wch);

  // Widths are clamped to the configured minimum and maximum.
  const messageWidth = widths[EXPECTED_COLUMNS.indexOf("Message")];
  assert.ok(messageWidth.wch >= 12 && messageWidth.wch <= 60);
  assert.equal(computeColumnWidths([]), null);
});
