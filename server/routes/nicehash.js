// routes/nicehash.js
import { asyncHandler, extractAlgorithmItems } from "../utils.js";
import { resolveNhClient, getNiceHashApp, nhConfigs, isAggregate, normalizeAlgoForNiceHash, NICEHASH_ALGO_MAP, getCachedNhPools } from "../nh.js";
import { mrrApiCall } from "../mrr.js";
import fs from "fs/promises";
import path from "path";
import { getDb } from "../db.js";
import { getAlgoMapping } from "../../src/core/mapping.js";
const ALGO_MAPPING = (algo) => {
  const mapping = getAlgoMapping(algo);
  return mapping?.unit || 'H';
};
import { saveToDatabase } from "./_helpers.js"; // see below

export function registerNiceHashRoutes(app) {
  // Middleware for NiceHash client resolution
  app.use("/api/v2", (req, res, next) => {
    if (req.path.startsWith("/mrr/") || req.path === "/algos/mapping" || req.path === "/extracted-pools") return next();
    try {
      const { client, clientName } = resolveNhClient(req.query.client);
      if (client) {
        req.nhApp = getNiceHashApp(client);
        res.set("X-NH-Client", clientName);
      }
      next();
    } catch (err) {
      next();
    }
  });

  // ─── Public / Info ──────────────────────────────────────────
  app.get("/api/v2/time", asyncHandler(async (req, res) => res.json(await req.nhApp.public.getTime())));
  app.get("/api/v2/algorithms", asyncHandler(async (req, res) => res.json(await req.nhApp.public.getAlgorithms())));
  app.get("/api/v2/public/currency-algos", asyncHandler(async (req, res) => res.json(await req.nhApp.easyMining.getCurrencyAlgos())));
  app.get("/api/v2/mining/markets", asyncHandler(async (req, res) => res.json(await req.nhApp.public.getMarkets())));
  app.get("/api/v2/public/stats/24h", asyncHandler(async (req, res) => res.json(await req.nhApp.hashpower.getGlobalStats24h())));

  // New route for static NiceHash algo data
  app.get("/api/v2/nicehash-algos", asyncHandler(async (req, res) => {
    try {
      const filePath = path.resolve(process.cwd(), 'nicehashMiningAlgo.json');
      const fileContent = await fs.readFile(filePath, 'utf-8');
      res.json(JSON.parse(fileContent));
    } catch (error) {
      console.error("Failed to read nicehashMiningAlgo.json:", error);
      res.status(500).json({ success: false, error: "Could not load static algorithm data." });
    }
  }));

  // ─── Algorithm Mapping ──────────────────────────────────────
  app.get("/api/v2/algos/mapping", asyncHandler(async (req, res) => {
    const { client: nhClient, clientName: nhClientName } = resolveNhClient(req.query.client);
    const nhResponse = await getNiceHashApp(nhClient).public.getAlgorithms();
    const { data: mrrResponse, clientName } = await mrrApiCall({ endpoint: "/market/algos", method: "GET", clientNameRaw: req.query.client });
    const nhItems = extractAlgorithmItems(nhResponse, ["miningAlgorithms", "algorithms", "data", "list", "result", "items"]);
    const mrrItems = extractAlgorithmItems(mrrResponse, ["algos", "algorithms", "data", "list", "result", "items"]).map(item => ({
      ...item,
      slug: String(item?.algo || item?.name || item?.slug || "").toLowerCase(),
    }));
    const mrrSlugSet = new Set(mrrItems.map(item => String(item?.algo || item?.name || item?.slug || "").toLowerCase()).filter(Boolean));

    const combinedAlgos = new Map();

    // Process all NiceHash algorithms first
    nhItems.forEach(item => {
      const nicehash = String(item?.algorithm || item?.name || item?.algo || "").toUpperCase();
      if (nicehash && !combinedAlgos.has(nicehash)) {
        combinedAlgos.set(nicehash, { nicehash, mrr: null, mrrExists: false });
      }
    });

    // Map and check for existence
    for (const [nicehash, entry] of combinedAlgos.entries()) {
      const mrr = NICEHASH_ALGO_MAP(nicehash);
      entry.mrr = mrr;
      entry.mrrExists = mrrSlugSet.has(String(mrr).toLowerCase());
    }

    const mapping = Array.from(combinedAlgos.values());
    res.set("X-MRR-Client", clientName);
    res.set("X-NH-Client", nhClientName);
    res.json({ success: true, data: { mapping, totals: { nicehash: nhItems.length, mrr: mrrItems.length, mapped: mapping.length } } });
  }));

  // ─── Accounting ─────────────────────────────────────────────
  app.get("/api/v2/accounting/balances", asyncHandler(async (req, res) => {
    const clientParam = String(req.query.client || "BT").toUpperCase();
    if (isAggregate(clientParam)) {
      const nhAccounts = Object.keys(nhConfigs).filter(k => nhConfigs[k].apiKey && nhConfigs[k].apiSecret && nhConfigs[k].orgId);
      const clientMap = new Map();
      for (const acct of nhAccounts) {
        const { client, clientName } = resolveNhClient(acct);
        if (client && !clientMap.has(clientName) && (acct === "BT" || clientName !== "BT")) {
          clientMap.set(clientName, client);
        }
      }
      const results = await Promise.all(Array.from(clientMap.entries()).map(async ([clientName, client]) => {
        try {
          const data = await getNiceHashApp(client).accounting.getBalances();
          return data ? { client: clientName, data } : null;
        } catch { return null; }
      }));
      const filtered = results.filter(Boolean);
      if (filtered.length === 0) return res.json({ currencies: [], total: { available: "0", pending: "0", totalBalance: "0", currency: "BTC" } });
      const total = { available: 0, pending: 0, totalBalance: 0, currency: "BTC" };
      const allCurrencies = [];
      filtered.forEach(r => {
        total.available += parseFloat(r.data.total?.available || 0);
        total.pending += parseFloat(r.data.total?.pending || 0);
        total.totalBalance += parseFloat(r.data.total?.totalBalance || 0);
        if (r.data.currencies) allCurrencies.push(...r.data.currencies.map(c => ({ ...c, nhClient: r.client })));
      });
      return res.json({ currencies: allCurrencies, total: { available: total.available.toFixed(8), pending: total.pending.toFixed(8), totalBalance: total.totalBalance.toFixed(8), currency: "BTC" } });
    }
    res.json(await req.nhApp.accounting.getBalances());
    // The middleware prepares req.nhApp, which is either a single client app
    // or an aggregate app that handles fetching from all accounts.
    const balances = await req.nhApp.accounting.getBalances();
    res.json(balances);
  }));
  app.get("/api/v2/accounting/balance/:currency", asyncHandler(async (req, res) => res.json(await req.nhApp.accounting.getBalance(req.params.currency))));
  app.post("/api/v2/accounting/withdrawal", asyncHandler(async (req, res) => res.json(await req.nhApp.accounting.createWithdrawal(req.body))));

  // ─── Mining ──────────────────────────────────────────────────
  app.get("/api/v2/mining/address", asyncHandler(async (req, res) => res.json(await req.nhApp.mining.getMiningAddress())));
  app.get("/api/v2/mining/rigs2", asyncHandler(async (req, res) => {
    const clientParam = String(req.query.client || "BT").toUpperCase();
    if (isAggregate(clientParam)) {
      const nhAccounts = Object.keys(nhConfigs).filter(k => nhConfigs[k].apiKey && nhConfigs[k].apiSecret && nhConfigs[k].orgId && !isAggregate(k));
      const clientMap = new Map();
      for (const acct of nhAccounts) {
        const { client, clientName } = resolveNhClient(acct);
        if (client && !clientMap.has(clientName) && (acct === "BT" || clientName !== "BT")) {
          clientMap.set(clientName, client);
        }
      }
      const results = await Promise.all(Array.from(clientMap.entries()).map(async ([clientName, client]) => {
        try {
          const data = await getNiceHashApp(client).mining.getRigs();
          return (data?.miningRigs || []).map(r => ({ ...r, nhClient: clientName }));
        } catch { return []; }
      }));
      return res.json({ miningRigs: results.flat() });
    }
    res.json(await req.nhApp.mining.getRigs());
    const rigsData = await req.nhApp.mining.getRigs();
    res.json(rigsData);
  }));
  app.get("/api/v2/mining/rig/:rigId", asyncHandler(async (req, res) => res.json(await req.nhApp.mining.getRigDetails(req.params.rigId))));
  app.post("/api/v2/mining/rigs/status", asyncHandler(async (req, res) => res.json(await req.nhApp.mining.setRigStatus(req.body))));
  app.get("/api/v2/mining/payouts", asyncHandler(async (req, res) => res.json(await req.nhApp.mining.getPayouts())));
  app.get("/api/v2/mining/history", asyncHandler(async (req, res) => res.json(await req.nhApp.mining.getRigsStatsHistory(req.query))));
  app.get("/api/v2/mining/algo-stats", asyncHandler(async (req, res) => res.json(await req.nhApp.mining.getAlgoStats())));

  // ─── Hashpower Orders ───────────────────────────────────────
  app.get("/api/v2/hashpower/myOrders", asyncHandler(async (req, res) => {
    const clientParam = String(req.query.client || "BT").toUpperCase();
    const query = { ...req.query };
    if (!query.ts) query.ts = Date.now().toString();
    let data;
    if (isAggregate(clientParam)) {
      const nhAccounts = Object.keys(nhConfigs).filter(k => nhConfigs[k].apiKey && nhConfigs[k].apiSecret && nhConfigs[k].orgId && !isAggregate(k));
      const clientMap = new Map();
      for (const acct of nhAccounts) {
        const { client, clientName } = resolveNhClient(acct);
        if (client && !clientMap.has(clientName) && (acct === "BT" || clientName !== "BT")) {
          clientMap.set(clientName, client);
        }
      }
      const results = await Promise.all(Array.from(clientMap.entries()).map(async ([clientName, client]) => {
        try {
          const result = await getNiceHashApp(client).hashpower.getMyOrders(query);
          return (result?.list || []).map(o => ({ ...o, nhClient: clientName }));
        } catch { return []; }
      }));
      data = { list: results.flat() };
    } else {
      data = await req.nhApp.hashpower.getMyOrders(query);
    }

    const data = await req.nhApp.hashpower.getMyOrders(query);

    const rawList = data?.list || data?.myOrders || (Array.isArray(data) ? data : []);
    const processedList = rawList.map(o => ({
      id: o.id || "",
      acceptedCurrentSpeed: o.acceptedCurrentSpeed || 0,
      algorithmSpeed: o.acceptedCurrentSpeed || 0,
      niceAdvertisedHashrate: o.limit || 0,
      poolName: o.pool?.name || "",
      poolHost: o.pool?.stratumHostname || "",
      poolPort: o.pool?.port || "",
      algorithm: typeof o.algorithm === "object" ? o.algorithm.algorithm : o.algorithm,
      market: typeof o.market === "object" ? o.market.id : o.market,
      price: o.price,
      limit: o.limit,
      payedAmount: o.payedAmount || 0,
      availableAmount: o.availableAmount || 0,
      rigsCount: o.rigsCount || 0,
      poolUser: o.pool?.username || "",
      poolPass: o.pool?.password || "",
      status: typeof o.status === "object" ? o.status.code : o.status,
      isDead: (o.status?.code || o.status) === "ACTIVE" && parseFloat(o.acceptedCurrentSpeed || 0) === 0 && parseInt(o.rigsCount || 0) === 0,
      pool: o.pool,
      nhClient: o.nhClient,
      ts: new Date().toISOString(),
    }));
    await saveToDatabase("nh_order.csv", processedList.filter(o => o.status === "ACTIVE"));
    res.json(typeof data === "object" && !Array.isArray(data) ? { ...data, list: processedList } : processedList);
  }));
  app.get("/api/v2/hashpower/rented-summary", asyncHandler(async (req, res) => {
    const maxPrice = parseFloat(req.query.price);
    if (isNaN(maxPrice)) return res.status(400).json({ error: 'Valid "price" query parameter is required (e.g. ?price=0.007)' });
    const clientParam = String(req.query.client || "ALL").toUpperCase();
    const nhAccounts = isAggregate(clientParam) ? Object.keys(nhConfigs).filter(k => nhConfigs[k].apiKey && nhConfigs[k].apiSecret && nhConfigs[k].orgId && !isAggregate(k)) : [clientParam];
    let totalPaid = 0;
    const matchingOrders = [];
    const results = await Promise.all(nhAccounts.map(async (acct) => {
      const { client, clientName } = resolveNhClient(acct);
      if (!client || (acct !== "BT" && clientName === "BT" && acct !== "PH")) return null;
      try {
        const data = await getNiceHashApp(client).hashpower.getMyOrders({ limit: 1000 });
        return { clientName, list: data?.list || [] };
      } catch { return null; }
    }));
    results.filter(Boolean).forEach(({ clientName, list }) => {
      list.forEach(o => {
        const status = typeof o.status === "object" ? o.status.code : o.status;
        const price = parseFloat(o.price);
        if (status === "ACTIVE" && price < maxPrice) {
          const paid = parseFloat(o.payedAmount || 0);
          totalPaid += paid;
          matchingOrders.push({ id: o.id, account: clientName, price: o.price, paid: o.payedAmount });
        }
      });
    });
    res.json({ success: true, maxPrice, totalPaid: totalPaid.toFixed(8), count: matchingOrders.length, orders: matchingOrders });
  }));
  app.get("/api/v2/hashpower/order/price", asyncHandler(async (req, res) => {
    const clientParam = String(req.query.client || "BT").toUpperCase();
    const query = { ...req.query };
    if (!query.ts) query.ts = Date.now().toString();
    const algorithm = normalizeAlgoForNiceHash(query.algorithm);

    const matchActiveOrder = async (clientName, client) => {
      try {
        const data = await getNiceHashApp(client).hashpower.getMyOrders({ op: "LE", limit: 100 });
        const rawList = data?.list || data?.myOrders || (Array.isArray(data) ? data : []);
        const activeOrders = rawList.filter(o => String(o?.status?.code || o?.status || "").toUpperCase() === "ACTIVE");
        const found = activeOrders.find(o => normalizeAlgoForNiceHash(o?.algorithm || o?.algo || o?.type) === algorithm);
        if (!found) return null;
        const price = Number.parseFloat(found.price ?? found.marketPrice ?? found.fixedPrice ?? 0);
        if (!Number.isFinite(price) || price <= 0) return null;
        return { fixedPrice: price.toFixed(8), speedUnit: ALGO_MAPPING(algorithm), price, marketPrice: price, marketUnit: ALGO_MAPPING(algorithm), source: "active-order", nhClient: clientName, orderId: found.id };
      } catch { return null; }
    };

    const matchMarketPrice = async (clientName, client) => {
      try {
        const orderBook = await getNiceHashApp(client).hashpower.getOrderBook({ algorithm, market: query.market || "USA" });
        const buyOrders = orderBook?.buy || [];
        if (Array.isArray(buyOrders) && buyOrders.length > 0) {
          const prices = buyOrders
            .map(o => parseFloat(o.price ?? o.fixedPrice ?? o.rate ?? 0))
            .filter(p => p > 0);
          if (prices.length > 0) {
            const price = Math.max(...prices);
            return {
              fixedPrice: price.toFixed(8),
              speedUnit: ALGO_MAPPING(algorithm),
              price,
              marketPrice: price,
              marketUnit: ALGO_MAPPING(algorithm),
              source: "order-book",
              nhClient: clientName
            };
          }
        }
      } catch {}
      return null;
    };

    const matchCalculatePrice = async (clientName, client) => {
      try {
        const result = await getNiceHashApp(client).hashpower.getOrderPrice({ algorithm, market: query.market || "USA", amount: "0.01" });
        if (result) {
          const price = parseFloat(result?.price ?? result?.fixedPrice ?? result?.marketPrice ?? 0);
          if (Number.isFinite(price) && price > 0) {
            return {
              fixedPrice: price.toFixed(8),
              speedUnit: ALGO_MAPPING(algorithm),
              price,
              marketPrice: price,
              marketUnit: ALGO_MAPPING(algorithm),
              source: "calculate",
              nhClient: clientName
            };
          }
        }
      } catch {}
      return null;
    };

    // Build a list of clients to try
    const clientsToTry = [];
    if (isAggregate(clientParam)) {
      const nhAccounts = Object.keys(nhConfigs).filter(k => nhConfigs[k].apiKey && nhConfigs[k].apiSecret && nhConfigs[k].orgId && !isAggregate(k));
      const seen = new Set();
      for (const acct of nhAccounts) {
        const { client, clientName } = resolveNhClient(acct);
        if (client && !seen.has(clientName)) {
          seen.add(clientName);
          clientsToTry.push({ clientName, client });
        }
      }
    } else if (clientParam !== "ALL") {
      const { client, clientName } = resolveNhClient(clientParam);
      if (client) clientsToTry.push({ clientName, client });
    }

    // Try methods in order across all clients
    for (const { clientName, client } of clientsToTry) {
      const result = await matchActiveOrder(clientName, client);
      if (result) { res.set("X-NH-Client", clientName); return res.json(result); }
    }
    for (const { clientName, client } of clientsToTry) {
      const result = await matchMarketPrice(clientName, client);
      if (result) { res.set("X-NH-Client", clientName); return res.json(result); }
    }
    for (const { clientName, client } of clientsToTry) {
      const result = await matchCalculatePrice(clientName, client);
      if (result) { res.set("X-NH-Client", clientName); return res.json(result); }
    }

    // Last resort: try the global 24h stats to get a market price estimate
    try {
      const stats24h = await getNiceHashApp(clientsToTry[0]?.client || resolveNhClient("BT").client).hashpower.getGlobalStats24h();
      if (stats24h?.algorithms) {
        const algoStats = Array.isArray(stats24h.algorithms) ? stats24h.algorithms : Object.values(stats24h.algorithms);
        const match = algoStats.find(a => normalizeAlgoForNiceHash(a.algorithm || a.algo || a.name) === algorithm);
        if (match) {
          const price = parseFloat(match?.price ?? match?.marketPrice ?? match?.averagePrice ?? 0);
          if (Number.isFinite(price) && price > 0) {
            return res.json({
              fixedPrice: price.toFixed(8),
              speedUnit: ALGO_MAPPING(algorithm),
              price,
              marketPrice: price,
              marketUnit: ALGO_MAPPING(algorithm),
              source: "global-stats-24h",
              nhClient: clientsToTry[0]?.clientName || "BT"
            });
          }
        }
      }
    } catch {}

    // Absolute fallback: return a nominal price based on common estimates
    const fallbackPrices = {
      SHA256: 0.15, SCRYPT: 0.003, X11: 0.0008, KAWPOW: 0.000004,
      BEAMV3: 0.000005, KHEAVYHASH: 0.000009, OCTOPUS: 0.0000035,
      FISHHASH: 0.0000025, RANDOMX: 0.000006, ETCHASH: 0.000005,
      AUTOLYKOS2: 0.0000035, ZELHASH: 0.0000025, BLAKE3: 0.0000035,
      DYNEXSOLVE: 0.0000025, KARLSENHASH: 0.0000015, NEXA: 0.000002,
    };
    const fallbackPrice = fallbackPrices[algorithm] || 0.000001;
    console.log(`[NH Price] Using fallback estimate for ${algorithm}: ${fallbackPrice}`);
    return res.json({
      fixedPrice: fallbackPrice.toFixed(8),
      speedUnit: ALGO_MAPPING(algorithm),
      price: fallbackPrice,
      marketPrice: fallbackPrice,
      marketUnit: ALGO_MAPPING(algorithm),
      source: "fallback-estimate",
      nhClient: "BT"
    });
  }));
  app.get("/api/v2/hashpower/orderBook/:algo/:market", asyncHandler(async (req, res) => {
    const { algo, market } = req.params;
    const clientParam = String(req.query.client || "BT").toUpperCase();
    const { client } = resolveNhClient(clientParam);
    const app = getNiceHashApp(client);
    res.json(await app.hashpower.getOrderBook({ algorithm: algo, market }));
  }));
  app.get("/api/v2/hashpower/order/:orderId", asyncHandler(async (req, res) => {
    const clientParam = String(req.query.client || "BT").toUpperCase();
    if (isAggregate(clientParam)) {
      const nhAccounts = Object.keys(nhConfigs).filter(k => nhConfigs[k].apiKey && nhConfigs[k].apiSecret && nhConfigs[k].orgId && !isAggregate(k));
      const processedClients = new Set();
      for (const acct of nhAccounts) {
        const { client, clientName } = resolveNhClient(acct);
        if (!client || (acct !== "BT" && clientName === "BT") || processedClients.has(clientName)) continue;
        processedClients.add(clientName);
        try {
          const data = await getNiceHashApp(client).hashpower.getOrderDetail(req.params.orderId);
          if (data && !data.error) { res.set("X-NH-Client", clientName); return res.json(data); }
        } catch {}
      }
    }
    res.json(await req.nhApp.hashpower.getOrderDetail(req.params.orderId));
  }));
  app.post("/api/v2/hashpower/order", asyncHandler(async (req, res) => res.json(await req.nhApp.hashpower.createOrder(req.body))));
  app.get("/api/v2/hashpower/order-book", asyncHandler(async (req, res) => res.json(await req.nhApp.hashpower.getOrderBook(req.query))));
  app.delete("/api/v2/hashpower/order/:orderId", asyncHandler(async (req, res) => res.json(await req.nhApp.hashpower.cancelOrder(req.params.orderId))));
  app.post("/api/v2/hashpower/order/:orderId/refill", asyncHandler(async (req, res) => res.json(await req.nhApp.hashpower.refillOrder(req.params.orderId, req.body))));
  app.post("/api/v2/hashpower/order/:orderId/update", asyncHandler(async (req, res) => res.json(await req.nhApp.hashpower.updatePriceLimit(req.params.orderId, req.body))));

  // ─── Pools ──────────────────────────────────────────────────
  app.get("/api/v2/pools", asyncHandler(async (req, res) => {
    const clientParam = String(req.query.client || "BT").toUpperCase();
    if (isAggregate(clientParam)) {
      const nhAccounts = Object.keys(nhConfigs).filter(k => nhConfigs[k].apiKey && nhConfigs[k].apiSecret && nhConfigs[k].orgId && !isAggregate(k));
      const clientMap = new Map();
      for (const acct of nhAccounts) {
        const { client, clientName } = resolveNhClient(acct);
        if (client && !clientMap.has(clientName) && (acct === "BT" || clientName !== "BT")) {
          clientMap.set(clientName, client);
        }
      }
      const results = await Promise.all(Array.from(clientMap.entries()).map(async ([clientName, client]) => {
        try {
          const data = await getNiceHashApp(client).pools.getPools();
          const pools = (data?.list || []).map(p => ({ ...p, nhClient: clientName }));
          if (pools.length > 0) {
            const db = await getDb();
            await db.run('BEGIN TRANSACTION');
            try {
              const stmt = await db.prepare(`INSERT OR REPLACE INTO nh_pools (id, name, algorithm, stratumHostname, port, username, password, nhClient, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`);
              for (const p of pools) {
                await stmt.run(p.id, p.name, p.algorithm, p.stratumHostname, p.port, p.username, p.password, clientName);
              }
              await stmt.finalize();
              await db.run('COMMIT');
            } catch (e) {
              await db.run('ROLLBACK');
            }
          }
          return pools;
        } catch { return []; }
      }));
      return res.json({ list: results.flat(), totalCount: results.flat().length });
    }
    const data = await req.nhApp.pools.getPools();
    const pools = data?.list || [];
    const clientName = res.get("X-NH-Client") || "BT";
    if (pools.length > 0) {

    // For single-client calls, persist the fetched pools to the database.
    // Aggregate calls handle this internally via getCachedNhPools.
    if (pools.length > 0 && !isAggregate(clientName)) {
      const db = await getDb();
      await db.run('BEGIN TRANSACTION');
      try {
        const stmt = await db.prepare(`INSERT OR REPLACE INTO nh_pools (id, name, algorithm, stratumHostname, port, username, password, nhClient, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`);
        for (const p of pools) {
          await stmt.run(p.id, p.name, p.algorithm, p.stratumHostname, p.port, p.username, p.password, clientName);
        }
        await stmt.finalize();
        await db.run('COMMIT');
      } catch (e) {
        console.error(`[DB] Failed to save pools for ${clientName}:`, e.message);
        await db.run('ROLLBACK');
      }
    }
    res.json(data);
  }));
  app.get("/api/v2/pool/:poolId", asyncHandler(async (req, res) => {
    const clientParam = String(req.query.client || "BT").toUpperCase();
    if (isAggregate(clientParam)) {
      const nhAccounts = Object.keys(nhConfigs).filter(k => nhConfigs[k].apiKey && nhConfigs[k].apiSecret && nhConfigs[k].orgId && !isAggregate(k));
      const processedClients = new Set();

    // If an aggregate client is requested OR no client is specified, search across all accounts.
    if (isAggregate(clientParam) || !req.query.client) {
      res.set("X-NH-Client", "VN"); // Indicate an aggregate search
      const nhAccounts = Object.keys(nhConfigs).filter(k => nhConfigs[k].apiKey && !isAggregate(k));
      for (const acct of nhAccounts) {
        const { client, clientName } = resolveNhClient(acct);
        if (!client || (acct !== "BT" && clientName === "BT") || processedClients.has(clientName)) continue;
        processedClients.add(clientName);
        try {
          const data = await getNiceHashApp(client).pools.getPoolDetails(req.params.poolId);
          if (data && !data.error) { res.set("X-NH-Client", clientName); return res.json(data); }
          const { client } = resolveNhClient(acct);
          if (client && !client.isAggregate) {
            const data = await getNiceHashApp(client).pools.getPoolDetails(req.params.poolId);
            if (data && !data.error) {
              return res.json(data);
            }
          }
        } catch {}
      }
      return res.status(404).json({ success: false, error: `Pool ${req.params.poolId} not found in any account.` });
    }

    // For a specific client, use the app prepared by the middleware.
    res.json(await req.nhApp.pools.getPoolDetails(req.params.poolId));
  }));
  app.post("/api/v2/pool", asyncHandler(async (req, res) => res.json(await req.nhApp.pools.createPool(req.body))));
  app.post("/api/v2/pools/verify", asyncHandler(async (req, res) => res.json(await req.nhApp.pools.verifyPool(req.body))));
  app.post("/api/v2/pools/verify-browser", asyncHandler(async (req, res) => {
    const { stratumHost, stratumPort, username } = req.body;
    const clientParam = String(req.query.client || "BT").toUpperCase();
    const isHeadless = req.query.headless === "true";
    const options = new chrome.Options();
    if (isHeadless) options.addArguments("--headless=new");
    options.addArguments("--window-size=1280,720");
    let driver = await new Builder().forBrowser("chrome").setChromeOptions(options).build();
    try {
      await driver.get("https://www.nicehash.com/tools/pool-verification");
      const wait = 3000;
      const hostInput = await driver.wait(until.elementLocated(By.css('input[placeholder*="stratum"]')), wait);
      await hostInput.clear();
      await hostInput.sendKeys(`${stratumHost}:${stratumPort}`);
      const userInput = await driver.findElement(By.css('input[placeholder*="username"]'));
      await userInput.clear();
      await userInput.sendKeys(username);
      const verifyBtn = await driver.findElement(By.xpath("//button[contains(., 'Verify')]"));
      await verifyBtn.click();
      const resultSection = await driver.wait(until.elementLocated(By.className("verification-results")), 5000);
      const resultText = await resultSection.getText();
      const isSuccess = resultText.toLowerCase().includes("success") || resultText.toLowerCase().includes("verified");
      res.json({ success: isSuccess, message: resultText, client: clientParam });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    } finally {
      await driver.quit();
    }
  }));
}
