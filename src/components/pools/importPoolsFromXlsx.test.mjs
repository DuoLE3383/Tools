// components/pools/importPoolsFromXlsx.test.mjs
// Run with: node --test src/components/pools/importPoolsFromXlsx.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPoolsFromXlsxRows,
  mapRowToPool,
} from "./importPoolsFromXlsx.js";
import { buildExportRows } from "./exportVerificationResults.js";

const exportedRow = {
  "NH Client": "BT",
  "Pool Name": "my-pool",
  "Pool ID": "123",
  Status: "SUCCESS",
  Algorithm: "SHA256",
  "Algorithm (Raw)": "SHA256",
  "Stratum Host": "sha256.auto.nicehash.com",
  "Stratum Port": 9200,
  Username: "worker",
  Password: "x",
  Location: "EUROPE",
  "HTTP Status": 200,
  Message: "Pool verified",
  "Exported At": "2026-01-01T00:00:00.000Z",
};

test("maps a row that uses the exported column names", () => {
  const pool = mapRowToPool(exportedRow, 0, "BT");

  assert.equal(pool.name, "my-pool");
  assert.equal(pool.id, "123");
  assert.equal(pool.miningAlgorithm, "SHA256");
  assert.equal(pool.algorithm, "SHA256");
  assert.equal(pool.stratumHost, "sha256.auto.nicehash.com");
  assert.equal(pool.stratumHostname, "sha256.auto.nicehash.com");
  assert.equal(pool.stratumPort, 9200);
  assert.equal(pool.username, "worker");
  assert.equal(pool.password, "x");
  assert.equal(pool.nhClient, "BT");
  assert.equal(pool.poolVerificationServiceLocation, "EUROPE");
});

test("prefers the raw algorithm column over the display name", () => {
  const pool = mapRowToPool(
    {
      "Pool Name": "p",
      Algorithm: "SHA-256",
      "Algorithm (Raw)": "SHA256",
      Host: "h.example.com",
      Port: "3333",
      Username: "u",
    },
    0,
  );

  assert.equal(pool.miningAlgorithm, "SHA256");
});

test("accepts alternative header spellings and string ports", () => {
  const pool = mapRowToPool(
    {
      Name: "alt-pool",
      Algo: "Scrypt",
      Host: "scrypt.example.com",
      Port: "9999",
      User: "alice",
      Pass: "secret",
      Market: "EU",
      "NH Client": "PH3",
    },
    0,
  );

  assert.equal(pool.name, "alt-pool");
  assert.equal(pool.miningAlgorithm, "Scrypt");
  assert.equal(pool.stratumHost, "scrypt.example.com");
  assert.equal(pool.stratumPort, 9999);
  assert.equal(pool.username, "alice");
  assert.equal(pool.password, "secret");
  assert.equal(pool.poolVerificationServiceLocation, "EUROPE");
  assert.equal(pool.nhClient, "PH3");
});

test("requires algorithm, host, port and username", () => {
  const base = {
    "Pool Name": "incomplete",
    "Algorithm (Raw)": "SHA256",
    "Stratum Host": "h.example.com",
    "Stratum Port": 9200,
    Username: "u",
  };

  assert.ok(mapRowToPool(base, 0));

  assert.equal(mapRowToPool({ ...base, Username: "" }, 0), null);
  assert.equal(mapRowToPool({ ...base, "Stratum Port": 0 }, 0), null);
  assert.equal(mapRowToPool({ ...base, "Stratum Port": "abc" }, 0), null);
  assert.equal(mapRowToPool({ ...base, "Stratum Host": "" }, 0), null);
  assert.equal(mapRowToPool({ ...base, "Algorithm (Raw)": "" }, 0), null);
});

test("defaults password, name, client and location", () => {
  const pool = mapRowToPool(
    {
      "Algorithm (Raw)": "SHA256",
      "Stratum Host": "h.example.com",
      "Stratum Port": 9200,
      Username: "u",
      "NH Client": "NOT_A_CLIENT",
    },
    4,
    "LN",
  );

  assert.equal(pool.password, "x");
  assert.equal(pool.name, "Imported Pool 5");
  assert.equal(pool.nhClient, "LN");
  assert.equal(pool.client, "LN");
  assert.equal(pool.poolVerificationServiceLocation, "ANY");
  assert.equal(pool.id, undefined);
});

test("counts unusable rows as skipped", () => {
  const { pools, skipped } = buildPoolsFromXlsxRows([
    exportedRow,
    { "Pool Name": "no-algorithm" },
    { "Algorithm (Raw)": "SHA256", "Stratum Host": "h", "Stratum Port": 1 },
  ]);

  assert.equal(pools.length, 1);
  assert.equal(skipped, 2);
});

test("handles empty input", () => {
  assert.deepEqual(buildPoolsFromXlsxRows([]), { pools: [], skipped: 0 });
  assert.deepEqual(buildPoolsFromXlsxRows(null), { pools: [], skipped: 0 });
});

test("round-trips exported verification rows back into pools", () => {
  const entries = [
    {
      key: "321",
      label: "round-trip-pool",
      algorithm: "Scrypt",
      result: {
        ok: true,
        status: 200,
        data: { message: "Pool verified" },
        poolDetails: {
          nhClient: "XT",
          miningAlgorithm: "Scrypt",
          stratumHost: "scrypt.auto.nicehash.com",
          stratumPort: 3334,
          username: "rt-user",
          password: "rt-pass",
          poolVerificationServiceLocation: "USA",
        },
      },
    },
  ];

  const { pools, skipped } = buildPoolsFromXlsxRows(
    buildExportRows(entries),
    "BT",
  );

  assert.equal(skipped, 0);
  assert.equal(pools.length, 1);

  const [pool] = pools;
  assert.equal(pool.name, "round-trip-pool");
  assert.equal(pool.id, "321");
  assert.equal(pool.miningAlgorithm, "Scrypt");
  assert.equal(pool.stratumHost, "scrypt.auto.nicehash.com");
  assert.equal(pool.stratumPort, 3334);
  assert.equal(pool.username, "rt-user");
  assert.equal(pool.password, "rt-pass");
  assert.equal(pool.poolVerificationServiceLocation, "USA");
  assert.equal(pool.nhClient, "XT");
});
