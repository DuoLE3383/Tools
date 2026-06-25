// index.js
import "dotenv/config";
import express from 'express';
import cors from "cors";
import http from 'http';
import path from "path";
import { fileURLToPath } from "url";
import dotenv from 'dotenv';
import { createApp, initializeApp } from "./app.js";
import sqlite3 from "sqlite3";
import { migrateOldCsvToDb } from "./migrate.js";
import { initMiningTrainingDb } from "./mining/miningTrainingDb.js";
import { setDb }from "./db.js";
import { mergeDatabases } from "../data/merge.js";
import { logger } from "./logger.js";
import { startCoinFetcherService } from './coinFetcher.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "..", "data");
const STATS_DB_PATH = path.join(DATA_DIR, "stats.db");

// ============================================================
// CREATE APP
// ============================================================
const app = createApp({ distPath: path.join(__dirname, "..", "dist") });
const PORT = process.env.PORT || 3000;

// ============================================================
// DATABASE SETUP
// ============================================================
let dbInstance;

function initDatabase() {
  return new Promise((resolve, reject) => {
    dbInstance = new sqlite3.Database(STATS_DB_PATH, (dbErr) => {
      if (dbErr) return reject(dbErr);
      dbInstance.run("PRAGMA journal_mode = WAL;", (err) => {
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

// ============================================================
// START SERVER
// ============================================================
async function startServer() {
  try {
    logger.info("[init] Initializing database...");
    await initDatabase();

    logger.info("[init] Initializing app...");
    await initializeApp(process.env);

    // Start the server
    app.server.listen(PORT, "0.0.0.0", () => {
      logger.raw("--- NiceHash API Toolbox Server Started ---");
      logger.raw(`Listening on http://localhost:${PORT}`);
      logger.raw(`WebSocket: ws://localhost:${PORT}/api/v2/mrr/fetch/ws`);
    });

    // Start the coin fetcher service, passing the single DB instance
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
    console.error("❌ Critical Initialization Failure:", err.message, err.stack);
    process.exit(1);
  }
}

startServer();