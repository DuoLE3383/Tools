// index.js – corrected startup
import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { createApp, initializeApp } from "./server/app.js";
import sqlite3 from "sqlite3";
import { migrateOldCsvToDb } from "./server/migrate.js";
import { initMiningTrainingDb } from "./server/mining/miningTrainingDb.js";
import { setDb } from "./server/db.js";
import { mergeDatabases } from "./data/merge.js";
import { logger } from "./server/logger.js";
import { startCoinFetcherService } from './server/coinFetcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "data");
const STATS_DB_PATH = path.join(DATA_DIR, "stats.db");

// ============================================================
// CREATE APP
// ============================================================
const app = createApp({ distPath: path.join(__dirname, "dist") });
const PORT = process.env.PORT || 3000;

// ============================================================
// DATABASE SETUP
// ============================================================
let dbInstance;

function initDatabase() {
  return new Promise((resolve, reject) => {
    dbInstance = new sqlite3.Database(STATS_DB_PATH, (dbErr) => {
      if (dbErr) return reject(dbErr);
      dbInstance.run("PRAGMA journal_mode = WAL;", (err) => { // nosemgrep: javascript.lang.security.audit.non-literal-sql-db-access.non-literal-sql-db-access
        if (err) console.warn("[db] Failed to enable WAL mode:", err.message);
      });
      dbInstance.run(
        `CREATE TABLE IF NOT EXISTS stats_cache (
        key TEXT PRIMARY KEY, data TEXT, ts INTEGER
      )`,
        (err) => {
          if (err) reject(err);
        },
      );
      dbInstance.run(
        `CREATE TABLE IF NOT EXISTS api_errors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT, source TEXT, content_type TEXT, content TEXT
      )`,
        (err) => {
          if (err)
            console.error(
              `[db] Failed to create api_errors table: ${err.message}`,
            );
        },
      );
      dbInstance.run(
        `CREATE TABLE IF NOT EXISTS mrr_nonces (
        client TEXT PRIMARY KEY, last_nonce TEXT
      )`,
        (err) => {
          if (err) reject(err);
        },
      );
      dbInstance.run(
        `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY, value TEXT
      )`,
        (err) => {
          if (err)
            console.error(
              `[db] Failed to create settings table: ${err.message}`,
            );
        },
      );
      setDb(dbInstance);
      resolve();
    });
  });
}

async function cleanAllCache() {
  console.info("[init] Wiping persistent cache for fresh start...");
  try {
    await new Promise((resolve, reject) => { // nosemgrep: javascript.lang.security.audit.non-literal-sql-db-access.non-literal-sql-db-access
      dbInstance.run("DELETE FROM stats_cache", (err) => {
        if (err) return reject(err);
        console.info("✨ Persistent cache (stats_cache) cleared.");
        resolve();
      });
    });
  } catch (err) {
    console.error(`[init] Failed to clean persistent cache: ${err.message}`);
  }
}

function loadStats() {
  return new Promise((resolve) => {
    if (!dbInstance) {
      console.log("[db] Database not initialized, skipping stats load.");
      return resolve();
    }
    dbInstance.all(`SELECT key, data, ts FROM stats_cache`, [], (err, rows) => { // nosemgrep: javascript.lang.security.audit.non-literal-sql-db-access.non-literal-sql-db-access
      if (err) {
        console.log(
          "[db] No existing stats database found or failed to read, starting fresh.",
        );
        return resolve();
      }
      if (rows && rows.length > 0) {
        const statsCache = new Map();
        rows.forEach((row) => {
          try {
            statsCache.set(row.key, { data: JSON.parse(row.data), ts: row.ts });
          } catch (e) {
            console.error(`[db] Failed to parse row ${row.key}:`, e.message);
          }
        });
        console.log("[db] Loaded cached stats from SQLite database");
      }
      resolve();
    });
  });
}

// ============================================================
// START SERVER
// ============================================================
async function startServer() {
  try {
    logger.info("[init] Initializing database...");
    await initDatabase();

    // ✅ RUN DATABASE MERGE AFTER DB IS OPEN
    logger.info("[init] Merging databases into stats.db...");
    try {
      await mergeDatabases();
      logger.info("[init] Database merge completed.");
    } catch (mergeErr) {
      logger.error("[init] Database merge failed:", mergeErr.message);
      // Continue anyway – the app might still work with just stats.db
    }

    logger.info("[init] Cleaning cache...");
    await cleanAllCache();

    logger.info("[init] Initializing mining training DB...");
    await initMiningTrainingDb();

    logger.info("[init] Loading stats...");
    await loadStats();

    logger.info("[init] Migrating old CSV files...");
    await migrateOldCsvToDb();

    logger.info("[init] Initializing app...");
    await initializeApp(process.env);

    // Start the server
    app.server.listen(PORT, "0.0.0.0", () => {
      logger.raw("--- NiceHash API Toolbox Server Started ---");
      logger.raw(
        "Environment: " +
          (process.env.NICEHASH_ENVIRONMENT
            ? process.env.NICEHASH_ENVIRONMENT.toUpperCase()
            : "production"),
      );
      logger.raw(`Listening on http://localhost:${PORT}`);
      logger.raw(`WebSocket: ws://localhost:${PORT}/api/v2/mrr/fetch/ws`);
    });

    // Start the coin fetcher service
    startCoinFetcherService(dbInstance);

    // Graceful shutdown
    function shutdown(signal) {
      logger.info(`[api] Received ${signal}, shutting down...`);
      app.server.close(() => {
        logger.info("[api] Server closed");
        process.exit(0);
      });
    }
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (err) {
    console.error("❌ Critical Initialization Failure:", err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

// ============================================================
// START THE SERVER
// ============================================================
if (process.env.RUN_MAIN !== "false") {
  startServer().catch((err) => {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  });
}
