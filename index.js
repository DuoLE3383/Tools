// index.js – COMPLETE FIXED VERSION

import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";

import { setupWebSocket } from "./server/ws.js";
import { registerRoutes } from "./server/routes.js";
import { startMiningOpportunityScanner } from "./server/miningOpportunityNotifier.js";
import { createApp, initializeApp } from "./server/app.js";
import { verifyToken } from "./server/auth.js";
import { resolveNhClient, getNiceHashApp, nhConfigs } from "./server/nh.js";
import {
  mrrApiCall,
  initMrrConfigs,
  mrrConfigs,
  defaultMrrClient,
} from "./server/mrr.js";
import { migrateOldCsvToDb } from "./server/migrate.js";
import { initMiningTrainingDb } from "./server/miningTrainingDb.js";
import { setDb } from "./server/db.js";
import { fetchAndSaveCoinPrices } from "./server/coinGecko/coinGeckoClient.js";
import { scrapeMinerstat } from "./server/miners/minerstat.js";
import { scrapeWhatToMine } from "./server/miners/whatToMine.js";
import { scrapeHeroMinersGlobal } from "./server/miners/heroMiners.js";

// ============================================================
// GLOBAL ERROR HANDLERS - MUST BE FIRST
// ============================================================
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  // Don't exit on unhandled rejections
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  // Log but don't exit
});

// ============================================================
// IMPORT MERGE DATABASES WITH FALLBACK
// ============================================================
let mergeDatabases;
try {
  const mergeModule = await import("./data/merge.js");
  mergeDatabases =
    mergeModule.mergeDatabases || mergeModule.default || (() => {});
  console.log("[init] ✅ mergeDatabases loaded successfully");
} catch (err) {
  console.warn("[init] ⚠️ mergeDatabases not found, skipping database merge");
  mergeDatabases = async () => {
    console.log("[init] Database merge skipped (module not found)");
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, "dist", "client");

const DATA_DIR = path.join(__dirname, "data");
const STATS_DB_PATH = path.join(DATA_DIR, "stats.db");

// Client tags - consolidated
const VALID_NH_CLIENT_TAGS = new Set([
  "BT",
  "PH",
  "LN",
  "NHATLINH",
  "VN",
  "ALL",
]);
const VALID_MRR_CLIENT_TAGS = new Set(["BT", "SL", "LN", "LUCKY", "VN", "ALL"]);

// ============================================================
// CREATE APP
// ============================================================
const app = createApp({ distPath });
const PORT = process.env.PORT || 3000;

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================
// HEALTH CHECK ROUTES (BEFORE ANYTHING ELSE)
// ============================================================
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/heartbeat", (req, res) => {
  res.json({
    status: "ok",
    timestamp: Date.now(),
    uptime: process.uptime(),
  });
});

app.get("/ping", (req, res) => {
  res.send("pong");
});

app.get("/", (req, res) => {
  res.json({
    service: 'NiceHash API Toolbox',
    status: 'running',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      heartbeat: '/api/heartbeat',
      ping: '/ping',
      time: '/api/v2/time',
      mining: '/api/v2/mining-stats'
    }
  });
});

// ============================================================
// DATABASE SETUP
// ============================================================
let dbInstance;

function initDatabase() {
  return new Promise((resolve, reject) => {
    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    dbInstance = new sqlite3.Database(STATS_DB_PATH, (dbErr) => {
      if (dbErr) return reject(dbErr);

      // Enable WAL with proper busy timeout and synchronous settings for performance
      dbInstance.serialize(() => {
        dbInstance.run("PRAGMA journal_mode = WAL;", (err) => {
          if (err) console.warn("[db] Failed to enable WAL mode:", err.message);
        });
        dbInstance.run("PRAGMA busy_timeout = 5000;", (err) => {
          if (err)
            console.warn("[db] Failed to set busy timeout:", err.message);
        });
        dbInstance.run("PRAGMA synchronous = NORMAL;", (err) => {
          if (err)
            console.warn("[db] Failed to set synchronous mode:", err.message);
        });
        dbInstance.run("PRAGMA cache_size = -20000;", (err) => {
          if (err) console.warn("[db] Failed to set cache_size:", err.message);
        });
      });

      // Create tables
      dbInstance.run(
        `CREATE TABLE IF NOT EXISTS stats_cache (
        key TEXT PRIMARY KEY, 
        data TEXT, 
        ts INTEGER
      )`,
        (err) => {
          if (err) reject(err);
        },
      );

      dbInstance.run(
        `CREATE TABLE IF NOT EXISTS api_errors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT, 
        source TEXT, 
        content_type TEXT, 
        content TEXT
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
        client TEXT PRIMARY KEY, 
        last_nonce TEXT
      )`,
        (err) => {
          if (err) reject(err);
        },
      );

      dbInstance.run(
        `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY, 
        value TEXT
      )`,
        (err) => {
          if (err)
            console.error(
              `[db] Failed to create settings table: ${err.message}`,
            );
        },
      );

      // Add indexes for performance
      dbInstance.run(
        `CREATE INDEX IF NOT EXISTS idx_stats_cache_ts ON stats_cache(ts)`,
        (err) => {
          if (err)
            console.error(
              "[db] Failed to create stats_cache index:",
              err.message,
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
    await new Promise((resolve, reject) => {
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
    dbInstance.all(`SELECT key, data, ts FROM stats_cache`, [], (err, rows) => {
      if (err) {
        console.log(
          "[db] No existing stats database found or failed to read, starting fresh.",
        );
        return resolve();
      }
      if (rows && rows.length > 0) {
        rows.forEach((row) => {
          try {
            // Just log the count, don't store in memory to save RAM
            JSON.parse(row.data);
          } catch (e) {
            console.error(`[db] Failed to parse row ${row.key}:`, e.message);
          }
        });
        console.log(
          `[db] Loaded ${rows.length} cached stats from SQLite database`,
        );
      }
      resolve();
    });
  });
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================
function normalizeStoredClientTag(value, fallback, allowedTags) {
  const candidate = String(value || "")
    .trim()
    .toUpperCase();
  if (allowedTags.has(candidate)) return candidate;
  const safeFallback = String(fallback || "")
    .trim()
    .toUpperCase();
  if (allowedTags.has(safeFallback)) return safeFallback;
  return allowedTags.has("BT")
    ? "BT"
    : allowedTags.values().next().value || "BT";
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    dbInstance.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    dbInstance.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function cleanupStoredClientTags() {
  if (!dbInstance) return;

  const tables = new Set(
    (await dbAll(`SELECT name FROM sqlite_master WHERE type='table'`)).map(
      (row) => row.name,
    ),
  );

  const configuredNhClients = new Set([
    ...VALID_NH_CLIENT_TAGS,
    ...Object.keys(nhConfigs || {}).map((key) => String(key).toUpperCase()),
  ]);
  const configuredMrrClients = new Set([
    ...VALID_MRR_CLIENT_TAGS,
    ...Object.keys(mrrConfigs || {}).map((key) => String(key).toUpperCase()),
  ]);
  const fallbackMrrClient = normalizeStoredClientTag(
    defaultMrrClient,
    "BT",
    configuredMrrClients,
  );

  const tablePlans = [
    {
      table: "nh_pools",
      column: "nhClient",
      fallback: "BT",
      allowed: configuredNhClients,
    },
    {
      table: "mrr_pools",
      column: "mrrClient",
      fallback: fallbackMrrClient,
      allowed: configuredMrrClients,
    },
    {
      table: "mrr_rigs",
      column: "mrrClient",
      fallback: fallbackMrrClient,
      allowed: configuredMrrClients,
    },
  ];

  for (const plan of tablePlans) {
    if (!tables.has(plan.table)) continue;

    const columns = await dbAll(`PRAGMA table_info(${plan.table})`);
    if (!columns.some((column) => column.name === plan.column)) continue;

    const allowedList = Array.from(plan.allowed);
    const placeholders = allowedList.map(() => "?").join(", ");
    const result = await dbRun(
      `UPDATE ${plan.table}
       SET ${plan.column} = ?
       WHERE ${plan.column} IS NOT NULL
         AND TRIM(UPPER(${plan.column})) NOT IN (${placeholders})`,
      [plan.fallback, ...allowedList],
    );

    if (result?.changes) {
      console.info(
        `[init] Normalized ${result.changes} stale ${plan.table}.${plan.column} value(s).`,
      );
    }
  }
}

// ============================================================
// START SERVER
// ============================================================
async function startServer() {
  try {
    console.log("[init] Initializing database...");
    await initDatabase();

    console.log("[init] Merging databases into stats.db...");
    try {
      await mergeDatabases();
      console.log("[init] Database merge completed.");
    } catch (mergeErr) {
      console.warn("[init] Database merge skipped/warning:", mergeErr.message);
    }

    console.log("[init] Cleaning cache...");
    await cleanAllCache();

    console.log("[init] Initializing mining training DB...");
    await initMiningTrainingDb();

    console.log("[init] Loading stats...");
    await loadStats();

    console.log("[init] Migrating old CSV files...");
    await migrateOldCsvToDb();

    console.log("[init] Initializing MRR configs...");
    await initMrrConfigs(process.env);

    console.log("[init] Repairing stored client tags...");
    await cleanupStoredClientTags();

    console.log("[init] Initializing app...");
    await initializeApp(process.env);

    console.log("[init] Registering routes...");
    registerRoutes(app);
    console.log("[Routes] All routes registered");

    // Add mining stats routes
    app.get("/api/v2/mining-stats/minerstat", async (req, res) => {
      try {
        const data = await scrapeMinerstat();
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.get("/api/v2/mining-stats/whattomine", async (req, res) => {
      try {
        const data = await scrapeWhatToMine();
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.get("/api/v2/mining-stats/herominers/global", async (req, res) => {
      try {
        const data = await scrapeHeroMinersGlobal();
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Serve static files
    app.use(express.static(distPath));

    // API 404 handler - using regex pattern to avoid path-to-regexp issues
    app.use("/api", (req, res) => {
      res.status(404).json({
        success: false,
        error: "API endpoint not found",
        path: req.path,
      });
    });
    
    // SPA fallback - serve index.html for non-API routes
    app.get("/*", (req, res) => {
      const indexPath = path.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("Frontend not built. Run `npm run build` first.");
      }
    });

    // ============================================================
    // CREATE AND START HTTP SERVER
    // ============================================================
    const server = http.createServer(app);

    // Handle server errors
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use!`);
        console.error(`Please free the port and restart.`);
        process.exit(1);
      } else {
        console.error('❌ Server error:', err);
      }
    });

    // Setup WebSocket with error handling
    try {
      setupWebSocket(server);
      console.log("[WS] WebSocket server initialized");
    } catch (wsErr) {
      console.error("[WS] Failed to setup WebSocket:", wsErr.message);
    }

    // Start the server
    server.listen(PORT, "0.0.0.0", () => {
      console.log("--- NiceHash API Toolbox Server Started ---");
      console.log(
        "Environment: " +
          (process.env.NICEHASH_ENVIRONMENT
            ? process.env.NICEHASH_ENVIRONMENT.toUpperCase()
            : "production"),
      );
      console.log(`Listening on: http://localhost:${PORT}`);
      console.log(`WebSocket on: ws://localhost:${PORT}/api/v2/prices/ws`);
      console.log(`Heartbeat: http://localhost:${PORT}/api/heartbeat`);
      console.log(`Ping: http://localhost:${PORT}/ping`);

      // Start mining scanner after a delay
      setTimeout(() => {
        console.log("[Mining Scanner] Initializing...");
        try {
          startMiningOpportunityScanner();
        } catch (err) {
          console.error("[Mining Scanner] Failed to start:", err.message);
        }
      }, 5000);
    });

    // Graceful shutdown
    function shutdown(signal) {
      console.log(`[api] Received ${signal}, shutting down...`);
      server.close(() => {
        console.log("[api] Server closed");
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

// ============================================================
// EXPORT FOR TESTING
// ============================================================
export { app, dbInstance, startServer };