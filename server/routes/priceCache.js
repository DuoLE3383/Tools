// server/routes/priceCache.js
// Persists NiceHash order prices and MRR rental market prices to SQLite
// so miner and mining pages can read them without direct API calls.

import { asyncHandler } from "../utils.js";
import { db } from "../db.js";
import { resolveNhClient, getNiceHashApp, normalizeAlgoForNiceHash } from "../nh.js";
import { mrrApiCall } from "../mrr.js";
import { normalizeCredential } from "../utils.js";

const PRICE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function getAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function ensureTables() {
  await runAsync(`CREATE TABLE IF NOT EXISTS nh_order_prices (
    algo TEXT NOT NULL,
    market TEXT NOT NULL DEFAULT 'USA',
    price REAL DEFAULT 0,
    unit TEXT DEFAULT 'TH',
    source TEXT DEFAULT 'order-book',
    nh_client TEXT DEFAULT 'BT',
    fetched_at INTEGER NOT NULL,
    cached_until INTEGER NOT NULL,
    PRIMARY KEY (algo, market, nh_client)
  )`);

  await runAsync(`CREATE TABLE IF NOT EXISTS mrr_rental_prices (
    algo TEXT NOT NULL,
    client TEXT NOT NULL DEFAULT 'BT',
    price REAL DEFAULT 0,
    unit TEXT DEFAULT 'TH',
    currency TEXT DEFAULT 'BTC',
    fetched_at INTEGER NOT NULL,
    cached_until INTEGER NOT NULL,
    PRIMARY KEY (algo, client)
  )`);

  await runAsync(`CREATE TABLE IF NOT EXISTS nh_active_orders (
    id TEXT PRIMARY KEY,
    algo TEXT NOT NULL,
    market TEXT DEFAULT 'USA',
    price REAL DEFAULT 0,
    limit_amount REAL DEFAULT 0,
    speed REAL DEFAULT 0,
    paid REAL DEFAULT 0,
    status TEXT DEFAULT 'ACTIVE',
    nh_client TEXT DEFAULT 'BT',
    pool_name TEXT DEFAULT '',
    pool_host TEXT DEFAULT '',
    pool_port TEXT DEFAULT '',
    pool_user TEXT DEFAULT '',
    rigs_count INTEGER DEFAULT 0,
    fetched_at INTEGER NOT NULL
  )`);
}

// ─── Fetch and cache NH order prices for all active orders ───
async function refreshNhOrderPrices() {
  const now = Date.now();
  const cachedUntil = now + PRICE_CACHE_TTL;

  // Collect all configured NH clients
  const nhAccounts = ["BT", "PH", "PH3", "LN", "NHATLINH"];
  const activeOrders = [];

  for (const acct of nhAccounts) {
    try {
      const { client, clientName } = resolveNhClient(acct);
      if (!client) continue;

      const data = await getNiceHashApp(client).hashpower.getMyOrders({
        op: "LE",
        limit: 100,
        ts: now.toString(),
      });

      const rawList = data?.list || data?.myOrders || (Array.isArray(data) ? data : []);
      const active = rawList.filter(o =>
        String(o?.status?.code || o?.status || "").toUpperCase() === "ACTIVE"
      );

      for (const order of active) {
        const rawAlgo = typeof order.algorithm === "object"
          ? order.algorithm.algorithm || order.algorithm.displayName
          : order.algorithm || "";
        const algo = normalizeAlgoForNiceHash(rawAlgo);
        const rawMarket = typeof order.market === "object" ? order.market.id : order.market || "USA";
        const market = ["USA", "EU"].includes(rawMarket) ? rawMarket : "USA";

        const price = parseFloat(order.price || 0);
        const speed = parseFloat(order.acceptedCurrentSpeed || 0);
        const paid = parseFloat(order.payedAmount || 0);
        const limitAmt = parseFloat(order.limit || 0);
        const rigsCount = parseInt(order.rigsCount || 0);

        activeOrders.push({
          id: String(order.id || ""),
          algo,
          market,
          price,
          limit_amount: limitAmt,
          speed,
          paid,
          status: "ACTIVE",
          nh_client: clientName,
          pool_name: order.pool?.name || "",
          pool_host: order.pool?.stratumHostname || "",
          pool_port: String(order.pool?.port || ""),
          pool_user: order.pool?.username || "",
          rigs_count: rigsCount,
          fetched_at: now,
        });

        // Also store in price cache
        await runAsync(
          `INSERT OR REPLACE INTO nh_order_prices (algo, market, price, unit, source, nh_client, fetched_at, cached_until)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [algo, market, price, "TH", "active-order", clientName, now, cachedUntil]
        );
      }
    } catch (err) {
      console.warn(`[priceCache] Failed to fetch NH orders for ${acct}:`, err.message);
    }
  }

  // Store all active orders
  for (const order of activeOrders) {
    try {
      await runAsync(
        `INSERT OR REPLACE INTO nh_active_orders
         (id, algo, market, price, limit_amount, speed, paid, status, nh_client,
          pool_name, pool_host, pool_port, pool_user, rigs_count, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [order.id, order.algo, order.market, order.price, order.limit_amount,
         order.speed, order.paid, order.status, order.nh_client,
         order.pool_name, order.pool_host, order.pool_port,
         order.pool_user, order.rigs_count, order.fetched_at]
      );
    } catch (err) {
      // Skip duplicates silently
    }
  }

  console.log(`[priceCache] Cached ${activeOrders.length} NH active orders`);
  return activeOrders;
}

// ─── Fetch and cache MRR rental market prices ───
async function refreshMrrRentalPrices() {
  const now = Date.now();
  const cachedUntil = now + PRICE_CACHE_TTL;
  const mrrAccounts = ["BT", "SL", "LN", "LUCKY"];
  let totalPrices = 0;

  for (const acct of mrrAccounts) {
    try {
      const { statusCode, data } = await mrrApiCall({
        endpoint: "/rental",
        query: { type: "sold", limit: 50 },
        clientNameRaw: acct,
      });

      if (statusCode !== 200 || !data?.success) continue;

      const rentals = Array.isArray(data.data)
        ? data.data
        : (data.data?.rentals || []);

      for (const rental of rentals) {
        const algo = rental.algo || rental.algorithm || rental.type || rental.rig?.type || "";
        if (!algo) continue;

        const price = rental.price || rental.min_price || 0;
        const priceNum = typeof price === "object"
          ? parseFloat(price.paid || price.advertised || price.price || 0)
          : parseFloat(price || 0);

        if (priceNum <= 0) continue;

        await runAsync(
          `INSERT OR REPLACE INTO mrr_rental_prices (algo, client, price, unit, currency, fetched_at, cached_until)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [algo.toUpperCase(), acct, priceNum, "TH", "BTC", now, cachedUntil]
        );
        totalPrices++;
      }
    } catch (err) {
      console.warn(`[priceCache] Failed to fetch MRR rentals for ${acct}:`, err.message);
    }
  }

  console.log(`[priceCache] Cached ${totalPrices} MRR rental prices`);
  return totalPrices;
}

// ─── API endpoints ───

export function registerPriceCacheRoutes(app) {

  // GET cached NH order prices
  app.get("/api/v2/prices/nh-orders", asyncHandler(async (req, res) => {
    await ensureTables();

    const { algo, market, client: nhClient } = req.query;
    const now = Date.now();

    // Check if cache needs refresh (any row expired)
    const oldest = await getAsync(
      `SELECT MIN(cached_until) as oldest FROM nh_order_prices WHERE 1=1${
        algo ? " AND algo = ?" : ""
      }${market ? " AND market = ?" : ""}`,
      [algo, market].filter(Boolean)
    );

    if (!oldest || !oldest.oldest || oldest.oldest < now) {
      await refreshNhOrderPrices();
    }

    let sql = "SELECT * FROM nh_order_prices WHERE 1=1";
    const params = [];
    if (algo) { sql += " AND algo = ?"; params.push(String(algo).toUpperCase()); }
    if (market) { sql += " AND market = ?"; params.push(String(market).toUpperCase()); }
    sql += " ORDER BY price DESC";

    const rows = await allAsync(sql, params);
    res.json({ success: true, data: rows, count: rows.length });
  }));

  // GET cached MRR rental prices
  app.get("/api/v2/prices/mrr-rentals", asyncHandler(async (req, res) => {
    await ensureTables();

    const { algo, client } = req.query;
    const now = Date.now();

    const oldest = await getAsync(
      `SELECT MIN(cached_until) as oldest FROM mrr_rental_prices WHERE 1=1${
        algo ? " AND algo = ?" : ""
      }${client ? " AND client = ?" : ""}`,
      [algo, client].filter(Boolean)
    );

    if (!oldest || !oldest.oldest || oldest.oldest < now) {
      await refreshMrrRentalPrices();
    }

    let sql = "SELECT * FROM mrr_rental_prices WHERE 1=1";
    const params = [];
    if (algo) { sql += " AND algo = ?"; params.push(String(algo).toUpperCase()); }
    if (client) { sql += " AND client = ?"; params.push(String(client).toUpperCase()); }
    sql += " ORDER BY price DESC";

    const rows = await allAsync(sql, params);
    res.json({ success: true, data: rows, count: rows.length });
  }));

  // GET NH active orders from cache
  app.get("/api/v2/prices/nh-active-orders", asyncHandler(async (req, res) => {
    await ensureTables();

    const { algo, client } = req.query;
    const now = Date.now();

    // Auto-refresh if stale
    const oldest = await getAsync(
      `SELECT MIN(fetched_at) as oldest FROM nh_active_orders WHERE status='ACTIVE'${
        client ? " AND nh_client = ?" : ""
      }`,
      client ? [String(client).toUpperCase()] : []
    );

    if (!oldest || !oldest.oldest || (now - oldest.oldest) > PRICE_CACHE_TTL) {
      await refreshNhOrderPrices();
    }

    let sql = "SELECT * FROM nh_active_orders WHERE status='ACTIVE'";
    const params = [];
    if (algo) { sql += " AND algo = ?"; params.push(String(algo).toUpperCase()); }
    if (client) { sql += " AND nh_client = ?"; params.push(String(client).toUpperCase()); }
    sql += " ORDER BY price DESC";

    const rows = await allAsync(sql, params);
    res.json({ success: true, data: rows, count: rows.length });
  }));

  // POST force refresh all price caches
  app.post("/api/v2/prices/refresh-cache", asyncHandler(async (req, res) => {
    await ensureTables();
    const [nhCount, mrrCount] = await Promise.all([
      refreshNhOrderPrices(),
      refreshMrrRentalPrices(),
    ]);
    res.json({
      success: true,
      message: `Refreshed: ${nhCount} NH orders, ${mrrCount} MRR prices`,
    });
  }));

  // GET: miner page can fetch both NH orders and MRR prices in one call
  app.get("/api/v2/prices/miner-overview", asyncHandler(async (req, res) => {
    await ensureTables();
    const now = Date.now();

    // Check freshness
    const nhOldest = await getAsync(
      `SELECT MIN(cached_until) as oldest FROM nh_order_prices`
    );
    const mrrOldest = await getAsync(
      `SELECT MIN(cached_until) as oldest FROM mrr_rental_prices`
    );

    if (!nhOldest?.oldest || nhOldest.oldest < now) {
      await refreshNhOrderPrices();
    }
    if (!mrrOldest?.oldest || mrrOldest.oldest < now) {
      await refreshMrrRentalPrices();
    }

    const [nhPrices, mrrPrices, nhOrders] = await Promise.all([
      allAsync("SELECT * FROM nh_order_prices ORDER BY price DESC"),
      allAsync("SELECT * FROM mrr_rental_prices ORDER BY price DESC"),
      allAsync("SELECT * FROM nh_active_orders ORDER BY price DESC"),
    ]);

    res.json({
      success: true,
      data: {
        nhPrices,
        mrrPrices,
        nhActiveOrders: nhOrders,
        fetchedAt: now,
      }
    });
  }));
}
