// index.js – COMPLETE FIXED VERSION

import "dotenv/config";
import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import { setupWebSocket } from "./server/ws.js";
import { registerRoutes } from "./server/routes.js";
import { startMiningOpportunityScanner } from "./server/miningOpportunityNotifier.js";
import { createApp, initializeApp } from "./server/app.js";
import { authMiddleware } from "./server/auth.js";
import { resolveNhClient, getNiceHashApp, nhConfigs } from "./server/nh.js";
import {
  mrrApiCall,
  initMrrConfigs,
  mrrConfigs,
  defaultMrrClient,
} from "./server/mrr.js";
import { migrateOldCsvToDb } from "./server/migrate.js";
import { initMiningTrainingDb } from "./server/miningTrainingDb.js";
import { getDb } from "./server/db.js";
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
    mergeModule.mergeDatabases || mergeModule.default || (() => { });
  console.log("[init] ✅ mergeDatabases loaded successfully");
} catch (err) {
  console.warn("[init] ⚠️ mergeDatabases not found, skipping database merge");
  mergeDatabases = async () => {
    console.log("[init] Database merge skipped (module not found)");
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, "dist");

const DATA_DIR = path.join(__dirname, "data");
const STATS_DB_PATH = path.join(DATA_DIR, "stats.db");

// Client tags - consolidated
const VALID_NH_CLIENT_TAGS = new Set([
  "BT",
  "PH",
  "PH3",
  "HUDA",
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
const PORT = process.env.PORT;

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://huyenbao.com https://www.huyenbao.com https://static.cloudflareinsights.com; " +
    "style-src 'self' 'unsafe-inline'; " +
    "connect-src 'self' https://huyenbao.com https://www.huyenbao.com https://api.huyenbao.com http://localhost:3003 ws: wss:; " +
    "img-src 'self' data:; object-src 'none'; frame-ancestors 'none';"
  );
  next();
});

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

app.get("/api/status", (req, res) => {
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

async function cleanAllCache() {
  console.info("[init] Wiping persistent cache for fresh start...");
  try {
    const db = await getDb();
    await db.run("DELETE FROM stats_cache");
    console.info("✨ Persistent cache (stats_cache) cleared.");
  } catch (err) {
    console.error(`[init] Failed to clean persistent cache: ${err.message}`);
  }
}

async function loadStats() {
  const db = await getDb();
  const rows = await db.all(`SELECT key, data, ts FROM stats_cache`);
  if (rows && rows.length > 0) {
    console.log(`[db] Loaded ${rows.length} cached stats from SQLite database`);
  }
}

function normalizeStoredClientTag(value, fallback, allowedTags) {
  const candidate = String(value || "").trim().toUpperCase();
  if (allowedTags.has(candidate)) return candidate;
  const safeFallback = String(fallback || "").trim().toUpperCase();
  if (allowedTags.has(safeFallback)) return safeFallback;
  return allowedTags.has("BT") ? "BT" : allowedTags.values().next().value || "BT";
}

async function cleanupStoredClientTags() {
  const db = await getDb();
  const tables = new Set((await db.all(`SELECT name FROM sqlite_master WHERE type='table'`)).map((row) => row.name));

  const configuredNhClients = new Set([
    ...VALID_NH_CLIENT_TAGS,
    ...Object.keys(nhConfigs || {}).map((key) => String(key).toUpperCase()),
  ]);
  const configuredMrrClients = new Set([
    ...VALID_MRR_CLIENT_TAGS,
    ...Object.keys(mrrConfigs || {}).map((key) => String(key).toUpperCase()),
  ]);
  const fallbackMrrClient = normalizeStoredClientTag(defaultMrrClient, "VN", configuredMrrClients);

  const tablePlans = [
    { table: "nh_pools", column: "nhClient", fallback: "VN", allowed: configuredNhClients },
    { table: "mrr_pools", column: "mrrClient", fallback: fallbackMrrClient, allowed: configuredMrrClients },
    { table: "mrr_rigs", column: "mrrClient", fallback: fallbackMrrClient, allowed: configuredMrrClients },
  ];

  for (const plan of tablePlans) {
    if (!tables.has(plan.table)) continue;
    const columns = await db.all(`PRAGMA table_info(${plan.table})`);
    if (!columns.some((column) => column.name === plan.column)) continue;
    const allowedList = Array.from(plan.allowed);
    const placeholders = allowedList.map(() => "?").join(", ");
    const result = await db.run(
      `UPDATE ${plan.table} SET ${plan.column} = ? WHERE ${plan.column} IS NOT NULL AND TRIM(UPPER(${plan.column})) NOT IN (${placeholders})`,
      [plan.fallback, ...allowedList],
    );
    if (result?.changes) {
      console.info(`[init] Normalized ${result.changes} stale ${plan.table}.${plan.column} value(s).`);
    }
  }
}

// ============================================================
// START SERVER
// ============================================================
async function startServer() {
  try {
    // ============================================================
    // PRE-FLIGHT: Kill stale process on our port
    // ============================================================
    try {
      const { execSync } = await import("child_process");
      const portCheck = execSync(`lsof -i :${PORT} -t 2>/dev/null || true`, { encoding: "utf-8" }).trim();
      if (portCheck) {
        const pids = portCheck.split("\n").filter(p => p && String(p).trim() !== String(process.pid));
        if (pids.length > 0) {
          console.log(`[init] ⚠️ Port ${PORT} is in use by PID(s): ${pids.join(", ")}. Killing...`);
          execSync(`kill -9 ${pids.join(" ")} 2>/dev/null || true`);
          await new Promise(r => setTimeout(r, 500));
          console.log(`[init] ✅ Port ${PORT} freed`);
        }
      }
    } catch (_) {
      // lsof not available or other error — skip pre-flight
    }

    console.log("[init] Initializing database...");
    await getDb();

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

    // ============================================================
    // ✅ REGISTER ALL ROUTES (INCLUDING AUTH) - BEFORE ANY API 404 HANDLER
    // ============================================================
    console.log("[init] Registering routes...");
    registerRoutes(app);
    console.log("[Routes] All routes registered");

    // ============================================================
    // ✅ API 404 HANDLER - MUST BE AFTER ALL ROUTES
    // ============================================================
    app.use("/api", (req, res) => {
      console.log(`[404] API endpoint not found: ${req.method} ${req.path}`);
      res.status(404).json({ 
        success: false, 
        error: "API endpoint not found", 
        path: req.path 
      });
    });

    // ============================================================
    // SERVE STATIC FILES
    // ============================================================
    app.use(express.static(distPath));

    app.use('/src', (req, res) => {
        res.status(404).send('Source files are not served in this environment.');
    });

    app.use((req, res) => {
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

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use!`);
        console.error(`Please free the port and restart.`);
        process.exit(1);
      } else {
        console.error('❌ Server error:', err);
      }
    });

    try {
      setupWebSocket(server);
      console.log("[WS] WebSocket server initialized");
    } catch (wsErr) {
      console.error("[WS] Failed to setup WebSocket:", wsErr.message);
    }

    server.listen(PORT, "0.0.0.0", () => {
      console.log("--- NiceHash API Toolbox Server Started ---");
      console.log("Environment: " + (process.env.NICEHASH_ENVIRONMENT ? process.env.NICEHASH_ENVIRONMENT.toUpperCase() : "production"));
      console.log(`Listening on: http://localhost:${PORT}`);
      console.log(`WebSocket on: ws://localhost:${PORT}/api/v2/prices/ws`);
      console.log(`Heartbeat: http://localhost:${PORT}/api/heartbeat`);
      console.log(`Ping: http://localhost:${PORT}/ping`);
      console.log(`Auth Login: http://localhost:${PORT}/api/auth/login`);
      console.log(`Auth Profile: http://localhost:${PORT}/api/auth/profile`);

      setTimeout(() => {
        console.log("[Mining Scanner] Initializing...");
        try { startMiningOpportunityScanner(); } catch (err) { console.error("[Mining Scanner] Failed to start:", err.message); }
      }, 5000);
    });

    function shutdown(signal) {
      console.log(`[api] Received ${signal}, shutting down...`);
      server.close(() => { console.log("[api] Server closed"); process.exit(0); });
    }
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

  } catch (err) {
    console.error("❌ Critical Initialization Failure:", err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

if (process.env.RUN_MAIN !== "false") {
  startServer().catch((err) => { console.error("❌ Failed to start server:", err); process.exit(1); });
}

export { app, startServer };
