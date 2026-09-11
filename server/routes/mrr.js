// server/routes/mrr.js – Complete version with fixed /compare route
import { asyncHandler, extractRentalInfo, extractRigInfo } from "../utils.js";
import { mrrApiCall, mrrRequest, fetchAggregatedRentals, mrrConfigs, defaultMrrClient } from "../mrr.js";
import { resolveNhClient, isAggregate, getNiceHashApp, normalizeAlgoForNiceHash, getCachedNhPools, nhConfigs } from "../nh.js";
import { getNiceHashUnit } from "../../src/core/mapping.js";
import { getDb, withSavepoint } from "../db.js";
import { saveToDatabase } from "./_helpers.js";
import { runRentalMonitor } from "../monitor.js";
import { exportMrrRentalsToXlsx, RENTAL_EXPORT_PATH } from "../mrr/rental-xlsx-export.js";

const nhPriceCache = new Map();
const NH_PRICE_CACHE_TTL_MS = 30_000;

async function getMatchingNiceHashPools(clientName) {
  // MRR account labels are not necessarily NiceHash account labels (for
  // example SL and LUCKY). Only attempt a pool lookup when that NiceHash
  // account is actually configured.
  if (!nhConfigs[clientName]) return [];
  return getCachedNhPools(clientName);
}

export function registerMrrRoutes(app) {
  app.get("/api/v2/mrr/nicehash/price", asyncHandler(async (req, res) => {
    const algorithm = normalizeAlgoForNiceHash(req.query.algorithm);
    const market = String(req.query.market || "USA").toUpperCase();
    if (!algorithm || algorithm === "UNKNOWN") {
      return res.status(400).json({ success: false, error: "A supported algorithm is required." });
    }

    const cacheKey = `${algorithm}:${market}`;
    const cached = nhPriceCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < NH_PRICE_CACHE_TTL_MS) {
      return res.json({ ...cached.data, cached: true });
    }

    const clients = Object.keys(nhConfigs).filter((name) => {
      const config = nhConfigs[name];
      return config?.apiKey && config?.apiSecret && config?.orgId && !isAggregate(name);
    });
    const results = await Promise.all(clients.map(async (clientName) => {
      try {
        const { client } = resolveNhClient(clientName);
        const niceHash = getNiceHashApp(client).hashpower;
        try {
          const quote = await niceHash.getOrderPrice({
            algorithm,
            market,
            amount: "0.01",
          });
          const price = Number.parseFloat(quote?.price ?? quote?.fixedPrice);
          if (Number.isFinite(price) && price > 0) {
            return { client: clientName, price, unit: quote?.speedUnit || getNiceHashUnit(algorithm) || "TH", source: "order-calculate" };
          }
        } catch {
          // Some algorithms reject the minimum calculate amount. Fall back to
          // the live order book for this same client instead of dropping it.
        }

        const orderBook = await niceHash.getOrderBook({ algorithm, market });
        const orders = [
          ...(orderBook?.buy || orderBook?.data?.buy || []),
          ...Object.values(orderBook?.stats || {}).flatMap((stat) => stat?.orders || []),
        ];
        const prices = orders
          .map((order) => Number.parseFloat(order?.price ?? order?.fixedPrice ?? order?.rate))
          .filter((price) => Number.isFinite(price) && price > 0);
        if (prices.length === 0) throw new Error("NiceHash returned no usable price.");
        return {
          client: clientName,
          price: Math.max(...prices),
          unit: orderBook?.stats?.BTC?.displayPriceFactor || getNiceHashUnit(algorithm) || "TH",
          source: "order-book",
        };
      } catch (error) {
        return { client: clientName, error: error.message };
      }
    }));

    let prices = results.filter((result) => !result.error);

    // Fallback: global 24h stats are reliable for algorithms with a thin or
    // empty order book/calculate quote. Mirror /api/v2/hashpower/order/price so
    // client=ALL never fails just because no live order/quote exists.
    if (prices.length === 0 && clients.length > 0) {
      try {
        const { client: fallbackClient } = resolveNhClient(clients[0]);
        if (fallbackClient && !fallbackClient.isAggregate) {
          const fallbackApp = getNiceHashApp(fallbackClient);
          const stats24h = await fallbackApp.hashpower.getGlobalStats24h();
          const algoList = await fallbackApp.public.getAlgorithms();
          const algorithms = algoList?.miningAlgorithms || [];
          const algoMetaMap = new Map(algorithms.flatMap((item, index) => [
            [item.order, item],
            [index, item],
          ]).filter(([key]) => Number.isFinite(Number(key))));
          const match = (stats24h?.algos || []).find(stat => {
            const meta = algoMetaMap.get(Number(stat.a));
            return meta && normalizeAlgoForNiceHash(meta.algorithm) === algorithm;
          });
          const price = parseFloat(match?.p || 0);
          if (price > 0) {
            const unit = getNiceHashUnit(algorithm) || "TH";
            prices = [{
              client: clients[0],
              price,
              unit,
              source: "global-stats-24h",
            }];
          }
        }
      } catch (e) {
        console.warn(`[NH Price] Global stats fallback failed for ${algorithm}:`, e.message);
      }
    }

    if (prices.length === 0) {
      return res.status(502).json({
        success: false,
        error: `No NiceHash account returned a price for ${algorithm}.`,
        errors: results,
      });
    }

    // Preserve the existing UI contract while exposing every account's quote.
    const selected = prices.reduce((best, current) => current.price > best.price ? current : best);
    const data = {
      success: true,
      algorithm,
      market,
      price: selected.price,
      fixedPrice: selected.price.toFixed(8),
      unit: selected.unit,
      client: selected.client,
      prices,
      errors: results.filter((result) => result.error),
    };
    nhPriceCache.set(cacheKey, { timestamp: Date.now(), data });
    res.json(data);
  }));

  app.post("/api/v2/mrr/rentals/export", asyncHandler(async (req, res) => {
    const client = String(req.query.client || req.body?.client || 'ALL').trim().toUpperCase();
    const exportResult = await exportMrrRentalsToXlsx(client);
    console.log(`[MRR export] Manual rental workbook exported (${exportResult.activeCount} active rentals).`);
    res.download(RENTAL_EXPORT_PATH, 'rentals.xlsx');
  }));

  // ─── Monitor ──────────────────────────────────────────────────
  app.post("/api/v2/mrr/monitor/run", asyncHandler(async (req, res) => {
    const scope = String(req.query.client || req.body?.client || "ALL").trim().toUpperCase();
    const result = await runRentalMonitor(true, scope);
    res.json({ success: true, ...result });
  }));

  // ─── MRR Market Proxy (public APIs, avoids CORS) ────────────
  app.get("/api/v2/mrr/market/algos/:algo", asyncHandler(async (req, res) => {
    const { algo } = req.params;
    const url = `https://www.miningrigrentals.com/api/v2/market/algos/${algo}`;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const data = await response.json();
      res.json(data);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }));

  // ─── MRR Public Info/Algos (no auth needed) ─────────────────
  app.get("/api/v2/mrr/info/algos", asyncHandler(async (req, res) => {
    try {
      const response = await fetch("https://www.miningrigrentals.com/api/v2/info/algos", {
        signal: AbortSignal.timeout(8000)
      });
      const data = await response.json();
      if (data?.success && data?.data) {
        const items = Array.isArray(data.data) ? data.data : data.data;
        res.json({ success: true, data: items, source: "public" });
      } else {
        res.status(502).json({ success: false, error: "MRR public API returned unexpected data" });
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }));

  // ─── Rigs ─────────────────────────────────────────────────────
  app.get("/api/v2/mrr/rigs", asyncHandler(async (req, res) => {
    const clientParam = String(req.query.client || defaultMrrClient).toUpperCase();
    const targetEndpoint = req.query.endpoint || "/rig/mine";
    if (isAggregate(clientParam)) {
      const allClientNames = Object.keys(mrrConfigs).filter(c => mrrConfigs[c].apiKey && mrrConfigs[c].apiSecret && !isAggregate(c));
      const allRigs = [];
      const results = await Promise.all(allClientNames.map(async (clientName) => {
        try {
          const db = await getDb();
          const { data, statusCode } = await mrrApiCall({ endpoint: targetEndpoint, clientNameRaw: clientName });
          const rigs = Array.isArray(data?.data) ? data.data : (Array.isArray(data?.data?.rigs) ? data.data.rigs : []);
          if (targetEndpoint === "/rig/mine" && statusCode === 200 && data.success && rigs.length > 0) {
            const rigIds = rigs.map(r => r.id).join(';');
            const { data: poolsData } = await mrrApiCall({ endpoint: `/rig/${rigIds}/pool`, clientNameRaw: clientName });
            if (poolsData && poolsData.success) {
              const nhPools = await getMatchingNiceHashPools(clientName);
              const poolItems = Array.isArray(poolsData.data) ? poolsData.data : (poolsData.data?.result || []);
              const poolMap = new Map(await Promise.all(poolItems.map(async (item) => {
                const id = String(item.rigId || item.rigid || item.id || item.rentalid || '');
                if (Array.isArray(item.pools) && item.pools.length > 0) {
                  try {
                    await withSavepoint(db, `mrr_rig_pool_sync_${id}`, async () => {
                      const stmt = await db.prepare(`INSERT OR REPLACE INTO mrr_pools (id, name, algo, host, port, user, mrrClient, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`);
                      try {
                        for (const p of item.pools) {
                          const algo = p.algo || p.algorithm || p.type || item.algo || item.algorithm || '';
                          await stmt.run(id, p.name || `RigPool-${id}`, algo, p.host || p.stratumHost, p.port || p.stratumPort, p.user || p.username, clientName);
                        }
                      } finally {
                        await stmt.finalize();
                      }
                    });
                  } catch (e) {
                    console.error(`[mrr:rigs] DB pool sync failed for rig ${id}:`, e.message);
                  }
                }
                if (Array.isArray(item.pools)) {
                  item.pools.forEach(p => {
                    const mrrUser = String(p.user || p.username || '').trim().toLowerCase();
                    const nhMatch = nhPools.find(nhp => String(nhp.username || '').trim().toLowerCase() === mrrUser);
                    if (nhMatch) p.nhPoolName = nhMatch.name;
                  });
                }
                return [id, item.pools];
              }).filter(i => i[0])));
              rigs.forEach(rig => {
                const pools = poolMap.get(String(rig.id));
                if (pools && pools.length > 0) {
                  const p0 = pools.find(p => p.priority === 0 || p.priority === '0') || pools[0];
                  rig.host = p0.host || p0.stratumHost;
                  rig.port = p0.port || p0.stratumPort;
                  rig.user = p0.user || p0.username;
                }
              });
            }
          }
          if (statusCode === 200 && data?.success && rigs.length > 0) {
            return { rigs: rigs.map(rig => ({ ...rig, mrrClient: clientName, nicehashAlgo: normalizeAlgoForNiceHash(rig.algo || rig.type || rig.miningAlgorithm) })) };
          }
          return { error: { client: clientName, message: data?.message || `Failed to fetch rigs (status: ${statusCode})` } };
        } catch (err) {
          return { error: { client: clientName, message: err.message } };
        }
      }));
      const errors = [];
      results.forEach(res => { if (res.rigs) allRigs.push(...res.rigs); if (res.error) errors.push(res.error); });
      await saveToDatabase('mrr_rigs.csv', allRigs);
      res.json({ success: true, rigs: allRigs, errors: errors.length > 0 ? errors : undefined });
    } else {
      if (targetEndpoint === "/rig/mine") {
        const { data, statusCode, clientName } = await mrrApiCall({ endpoint: '/rig/mine', clientNameRaw: clientParam });
        if (statusCode === 200 && data.success) {
          const rigs = Array.isArray(data.data) ? data.data : (data.data?.rigs || []);
          rigs.forEach(rig => { rig.nicehashAlgo = normalizeAlgoForNiceHash(rig.algo || rig.type || rig.miningAlgorithm); });
          if (rigs.length > 0) {
            const rigIds = rigs.map(r => r.id).join(';');
            const { data: poolsData } = await mrrApiCall({ endpoint: `/rig/${rigIds}/pool`, clientNameRaw: clientParam });
            if (poolsData && poolsData.success) {
              const poolItems = Array.isArray(poolsData.data) ? poolsData.data : (poolsData.data?.result || []);
              const poolMap = new Map(poolItems.map(item => [String(item.rigId || item.rigid || item.id), item.pools]));
              rigs.forEach(rig => {
                const pools = poolMap.get(String(rig.id));
                if (pools && pools.length > 0) {
                  const p0 = pools.find(p => p.priority === 0 || p.priority === '0') || pools[0];
                  rig.host = p0.host || p0.stratumHost;
                  rig.port = p0.port || p0.stratumPort;
                  rig.user = p0.user || p0.username;
                }
              });
            }
          }
        }
        res.set('X-MRR-Client', clientName);
        return res.status(statusCode).json(data);
      }
      await mrrRequest(targetEndpoint, req, res);
    }
  }));

  app.get("/api/v2/mrr/rigs/pools", asyncHandler(async (req, res) => {
    const clientParam = String(req.query.client || defaultMrrClient).toUpperCase();
    if (isAggregate(clientParam)) {
      const allClientNames = Object.keys(mrrConfigs).filter(c => mrrConfigs[c].apiKey && mrrConfigs[c].apiSecret && !isAggregate(c));
      const results = await Promise.all(allClientNames.map(async (clientName) => {
        try {
          const { data: rigsData } = await mrrApiCall({ endpoint: '/rig/mine', clientNameRaw: clientName });
          const rigs = Array.isArray(rigsData?.data) ? rigsData.data : (Array.isArray(rigsData?.data?.rigs) ? rigsData.data.rigs : []);
          if (rigsData?.success && rigs.length > 0) {
            const rigIds = rigs.map(r => r.id).join(';');
            const { data: poolsData } = await mrrApiCall({ endpoint: `/rig/${rigIds}/pool`, clientNameRaw: clientName });
            if (poolsData?.success) {
              const items = (Array.isArray(poolsData.data) ? poolsData.data : [poolsData.data]).map(item => ({
                ...item,
                mrrClient: clientName,
                nicehashAlgo: normalizeAlgoForNiceHash(item.algo || item.algorithm || item.type)
              }));
              return { pools: items.map(item => ({ ...item, mrrClient: clientName })) };
            }
          }
        } catch (err) {
          return { error: { client: clientName, message: err.message } };
        }
        return { pools: [] };
      }));
      const allResults = [];
      const errors = [];
      results.forEach(res => {
        if (res.pools) allResults.push(...res.pools);
        if (res.error) errors.push(res.error);
      });
      res.set('X-MRR-Client', 'ALL');
      return res.json({ success: true, data: allResults, errors: errors.length > 0 ? errors : undefined });
    }
    const { data: rigsData, clientName } = await mrrApiCall({ endpoint: '/rig/mine', clientNameRaw: clientParam });
    const rigs = Array.isArray(rigsData?.data) ? rigsData.data : (Array.isArray(rigsData?.data?.rigs) ? rigsData.data.rigs : []);
    if (!rigsData?.success || rigs.length === 0) {
      res.set('X-MRR-Client', clientName);
      return res.json(rigsData || { success: true, data: [] });
    }
    const rigIds = rigs.map(r => r.id).join(';');
    const { statusCode, data } = await mrrApiCall({ endpoint: `/rig/${rigIds}/pool`, clientNameRaw: clientName });
    res.set('X-MRR-Client', clientName);
    res.status(statusCode).json(data);
  }));

  // ─── Rentals ──────────────────────────────────────────────────
  app.get("/api/v2/mrr/rentals", asyncHandler(async (req, res) => {
    const { client: clientQuery, ...forwardQuery } = req.query || {};
    const result = await fetchAggregatedRentals(forwardQuery, String(clientQuery || defaultMrrClient).toUpperCase());
    await saveToDatabase('mrr_rentals.csv', result.data?.data?.rentals || []);
    res.set('X-MRR-Client', result.clientName);
    res.status(result.statusCode).json(result.data);
  }));

  app.get("/api/v2/mrr/rentals/cached", asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit, 10) || 100;
    const db = await getDb();
    const rows = await db.all(`SELECT * FROM mrr_rentals ORDER BY rowid DESC LIMIT ?`, [limit]);
    res.json({
      success: true,
      data: {
        rentals: rows || [],
      },
      source: 'cache'
    });
  }));

  app.get("/api/v2/mrr/rental/history", asyncHandler(async (req, res) => {
    const { client: clientQuery, ...forwardQuery } = req.query || {};
    const result = await fetchAggregatedRentals({ ...forwardQuery, history: '1' }, String(clientQuery || defaultMrrClient).toUpperCase());
    await saveToDatabase('mrr_rental_history.csv', result.data?.data?.rentals || []);
    res.set('X-MRR-Client', result.clientName);
    res.status(result.statusCode).json(result.data);
  }));

  // ⭐ ADDED: Fetch rental details with enrichment
  app.get("/api/v2/mrr/rental/:rentalIds", asyncHandler(async (req, res) => {
    const clientParam = String(req.query.client || defaultMrrClient).toUpperCase();
    const rentalId = req.params.rentalIds;

    async function fetchAggressiveRental(clientName) {
      const { statusCode, data } = await mrrApiCall({
        endpoint: `/rental/${rentalId}`,
        clientNameRaw: clientName,
      });
      let rental = data?.data;
      if (statusCode === 200 && data?.success && rental) {
        const initialNorm = extractRentalInfo(rental);
        const hasAlgo = initialNorm.algo !== 'Unknown';
        const hasHash = initialNorm.niceAverageHashrate !== '0 N/A' && initialNorm.niceAverageHashrate !== '0.00 N/A';
        const hasDuration = initialNorm.duration !== '0';
        if (!hasAlgo || !hasHash || !hasDuration) {
          const listRes = await mrrApiCall({ endpoint: '/rental', clientNameRaw: clientName });
          let list = listRes.data?.success ? (Array.isArray(listRes.data.data) ? listRes.data.data : (listRes.data.data?.rentals || [])) : [];
          let found = list.find(r => String(r.id) === String(rentalId));
          if (!found) {
            const histRes = await mrrApiCall({ endpoint: '/rental', query: { history: '1' }, clientNameRaw: clientName });
            list = histRes.data?.success ? (Array.isArray(histRes.data.data) ? histRes.data.data : (histRes.data.data?.rentals || [])) : [];
            found = list.find(r => String(r.id) === String(rentalId));
          }
          if (found) rental = { ...found, ...rental };
        }

        const poolRes = await mrrApiCall({ endpoint: `/rental/${rentalId}/pool`, clientNameRaw: clientName });
        if (poolRes.statusCode === 200 && poolRes.data?.success) {
          const pData = poolRes.data.data || poolRes.data;
          rental.pools = Array.isArray(pData.pools) ? pData.pools : (Array.isArray(pData) ? pData : []);
        }

        const normalized = extractRentalInfo(rental);
        const nhAlgo = normalizeAlgoForNiceHash(normalized.algo);
        normalized.nicehashAlgo = nhAlgo;
        if (nhAlgo && nhAlgo !== 'UNKNOWN' && nhAlgo !== 'N/A' && nhAlgo !== '') {
          try {
            const { client: nhClient } = resolveNhClient(clientParam);
            rental.nicehashPrice = await getNiceHashApp(nhClient).hashpower.getOrderPrice({ algorithm: nhAlgo, market: 1 });
          } catch (e) { /* ignore */ }
        }

        if (data.data) data.data = { ...rental, normalized };
        else Object.assign(data, { ...rental, normalized });
      }
      return { statusCode, data };
    }

    if (isAggregate(clientParam)) {
      const clients = Object.keys(mrrConfigs).filter(c => mrrConfigs[c].apiKey && mrrConfigs[c].apiSecret && !isAggregate(c));
      const candidates = await Promise.all(clients.map(async (clientName) => {
        const res = await fetchAggressiveRental(clientName);
        return { clientName, ...res };
      }));
      const found = candidates.find(c => c.statusCode === 200 && c.data?.success);
      if (found) {
        res.set('X-MRR-Client', found.clientName);
        return res.json(found.data);
      }
      return res.status(404).json({ success: false, message: 'Rental ID not found in any configured account.' });
    }

    const { statusCode, data } = await fetchAggressiveRental(clientParam);
    res.status(statusCode).json(data);
  }));

  app.get("/api/v2/mrr/rental/:rentalIds/pool", asyncHandler(async (req, res) => {
    await mrrRequest(`/rental/${req.params.rentalIds}/pool`, req, res);
  }));

  // ⭐ ADDED: Fetch rig info with pools and NiceHash price
  app.get("/api/v2/mrr/rig/:rigIds/info", asyncHandler(async (req, res) => {
    const ids = req.params.rigIds.split(';').map(id => id.trim()).filter(Boolean);
    if (ids.length === 0) return res.status(400).json({ success: false, message: 'No Rig IDs provided' });

    const fetchSingleInfo = async (id) => {
      try {
        const poolRes = await mrrApiCall({ endpoint: `/rig/${id}/pool`, clientNameRaw: req.query.client });
        let info = extractRigInfo(poolRes.data);
        if (!info.miningAlgorithm || !info.stratumHost || !info.username || !info.password || !info.stratumPort) {
          const rigRes = await mrrApiCall({ endpoint: `/rig/${id}`, clientNameRaw: req.query.client });
          info = extractRigInfo(rigRes.data);
        }
        const nhAlgo = normalizeAlgoForNiceHash(info.miningAlgorithm);
        info.nicehashAlgo = nhAlgo;
        if (nhAlgo && nhAlgo !== 'N/A' && nhAlgo !== '' && nhAlgo !== 'UNKNOWN') {
          try {
            const { client: nhClient } = resolveNhClient(req.query.client);
            info.nicehashPrice = await getNiceHashApp(nhClient).hashpower.getOrderPrice({ algorithm: nhAlgo, market: 1 });
          } catch (e) { /* ignore */ }
        }
        return { rigId: id, success: true, ...info };
      } catch (err) {
        return { rigId: id, success: false, message: err.message };
      }
    };

    if (ids.length === 1) {
      const result = await fetchSingleInfo(ids[0]);
      res.set('X-MRR-Client', String(req.query.client || defaultMrrClient).toUpperCase());
      return res.json(result);
    }

    const results = await Promise.all(ids.map(id => fetchSingleInfo(id)));
    res.set('X-MRR-Client', String(req.query.client || defaultMrrClient).toUpperCase());
    res.json({ success: true, data: results });
  }));

  // ─── List configured MRR clients ─────────────────────────────
  app.get("/api/v2/mrr/clients", asyncHandler(async (req, res) => {
    const allClientNames = Object.keys(mrrConfigs).filter(c => mrrConfigs[c].apiKey && mrrConfigs[c].apiSecret);
    const clients = allClientNames.map(name => ({
      name,
      isDefault: name === defaultMrrClient,
      hasCredentials: true,
    }));
    // Sort: default first, then alphabetical
    clients.sort((a, b) => {
      if (a.isDefault) return -1;
      if (b.isDefault) return 1;
      return a.name.localeCompare(b.name);
    });
    res.json({ success: true, clients, defaultClient: defaultMrrClient });
  }));

  // ─── Account / Balance / Algos ──────────────────────────────
  app.get("/api/v2/mrr/balance", asyncHandler(async (req, res) => mrrRequest('/account/balance', req, res)));
  app.get("/api/v2/mrr/algos", asyncHandler(async (req, res) => {
    const { statusCode, data, clientName } = await mrrApiCall({ endpoint: '/market/algos', clientNameRaw: req.query.client });
    if (statusCode === 200 && data?.success && data.data) {
      const items = Array.isArray(data.data) ? data.data : (data.data.algos || []);
      items.forEach(a => { a.nicehashAlgo = normalizeAlgoForNiceHash(a.algo || a.name || a.slug); });
    }
    res.set('X-MRR-Client', clientName);
    res.status(statusCode).json(data);
  }));
  app.get("/api/v2/mrr/profiles", asyncHandler(async (req, res) => mrrRequest('/profile', req, res)));
  app.get("/api/v2/mrr/account/pool", asyncHandler(async (req, res) => {
    const { client: clientQuery, ...forwardQuery } = req.query || {};
    const targetClient = isAggregate(clientQuery) ? defaultMrrClient : clientQuery;
    const { statusCode, data, clientName } = await mrrApiCall({
      endpoint: '/account/pool',
      method: 'GET',
      clientNameRaw: targetClient,
      query: forwardQuery,
    });
    if (statusCode === 200 && data?.success) {
      await saveToDatabase('mrr_account_pools.csv', data.data || []);
      const db = await getDb();
      const pools = data.data || [];
      if (pools.length > 0) {
        try {
          await withSavepoint(db, `mrr_acct_pool_sync_${clientName}`, async () => {
            const stmt = await db.prepare(`INSERT OR REPLACE INTO mrr_pools (id, name, algo, host, port, user, mrrClient, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`);
            try {
              for (const p of pools) {
                await stmt.run(p.id, p.name, p.algo, p.host, p.port, p.user, clientName);
              }
            } finally {
              await stmt.finalize();
            }
          });
        } catch (e) {
          console.warn(`[mrr:acct-pool] Pool sync failed for ${clientName}: ${e.message}`);
        }
      }
    }
    res.set('X-MRR-Client', clientName);
    res.status(statusCode).json(data);
  }));
  app.get("/api/v2/mrr/account/pool/:poolIds", asyncHandler(async (req, res) => {
    const clientParam = String(req.query.client || defaultMrrClient).toUpperCase();
    const { statusCode, data, clientName } = await mrrApiCall({ endpoint: `/account/pool/${req.params.poolIds}`, clientNameRaw: clientParam });
    if (statusCode === 200 && data?.success) {
      const nhPools = await getMatchingNiceHashPools(clientName);
      const items = Array.isArray(data.data) ? data.data : [data.data];
      items.forEach(item => {
        const mrrUser = String(item.user || item.username || '').trim().toLowerCase();
        const nhMatch = nhPools.find(nhp => String(nhp.username || '').trim().toLowerCase() === mrrUser);
        if (nhMatch) item.nhPoolName = nhMatch.name;
        if (Array.isArray(item.pools)) {
          item.pools.forEach(p => {
            const pUser = String(p.user || p.username || '').trim().toLowerCase();
            const pMatch = nhPools.find(nhp => String(nhp.username || '').trim().toLowerCase() === pUser);
            if (pMatch) p.nhPoolName = pMatch.name;
          });
        }
      });
    }
    res.set('X-MRR-Client', clientName);
    res.status(statusCode).json(data);
  }));
  app.post("/api/v2/mrr/account/pool", asyncHandler(async (req, res) => {
    const { client } = req.query;
    const { statusCode, data, clientName } = await mrrApiCall({ endpoint: '/account/pool', method: 'PUT', clientNameRaw: client, body: req.body });
    if (statusCode === 200 && data?.success && data.data?.id && !data.data.name && req.body?.name) {
      data.data.name = req.body.name;
    }
    res.set('X-MRR-Client', clientName);
    res.status(statusCode).json(data);
  }));
  app.put("/api/v2/mrr/account/pool", asyncHandler(async (req, res) => mrrRequest('/account/pool', req, res, 'PUT', req.body)));
  app.put("/api/v2/mrr/account/pool/:poolIds", asyncHandler(async (req, res) => mrrRequest(`/account/pool/${req.params.poolIds}`, req, res, 'PUT', req.body)));
  app.delete("/api/v2/mrr/account/pool/:poolIds", asyncHandler(async (req, res) => mrrRequest(`/account/pool/${req.params.poolIds}`, req, res, 'DELETE')));

  // ─── Compare ──────────────────────────────────────────────────
  // FIXED: uses nhClient query parameter and aggregates over all NiceHash clients when nhClient=ALL
  app.get("/api/v2/mrr/compare", asyncHandler(async (req, res) => {
    const mrrClient = String(req.query.client || defaultMrrClient).toUpperCase();
    const nhClient = String(req.query.nhClient || mrrClient).toUpperCase(); // 👈 read nhClient

    // 1. Fetch MRR rigs for the given MRR client
    const { data: mrrData } = await mrrApiCall({
      endpoint: '/rig',
      method: 'GET',
      clientNameRaw: mrrClient,
      query: { all: 'true' }
    });

    if (!mrrData?.success || !Array.isArray(mrrData.data)) {
      return res.status(400).json({ success: false, error: 'Failed to fetch MRR rigs' });
    }

    const rigs = mrrData.data;

    // 2. Resolve NiceHash client(s)
    const nhClientsToTry = [];
    if (isAggregate(nhClient)) {
      const allNhClients = Object.keys(nhConfigs).filter(k => nhConfigs[k].apiKey && !isAggregate(k));
      for (const name of allNhClients) {
        const { client } = resolveNhClient(name);
        if (client) nhClientsToTry.push({ client, name });
      }
    } else {
      const { client, clientName } = resolveNhClient(nhClient);
      if (client) nhClientsToTry.push({ client, name: clientName });
    }

    if (nhClientsToTry.length === 0) {
      return res.status(400).json({ success: false, error: `No valid NiceHash client(s) for "${nhClient}"` });
    }

    // 3. For each rig, get MRR price and NiceHash price
    const results = await Promise.all(
      rigs.map(async (rig) => {
        const mrrAlgo = rig.algo || rig.algorithm || rig.type;
        const nicehashAlgo = normalizeAlgoForNiceHash(mrrAlgo);
        let nicehashPrice = null;

        if (nicehashAlgo && nicehashAlgo !== 'UNKNOWN') {
          for (const { client, name } of nhClientsToTry) {
            try {
              const app = getNiceHashApp(client);
              const priceResult = await app.hashpower.getOrderPrice({
                algorithm: nicehashAlgo,
                market: 'USA',
                amount: '0.01'
              });
              if (priceResult && priceResult.price) {
                const unit = priceResult.speedUnit || getNiceHashUnit(nicehashAlgo) || 'TH';
                nicehashPrice = {
                  algorithm: nicehashAlgo,
                  fixedPrice: parseFloat(priceResult.price).toFixed(8),
                  currency: 'BTC',
                  speedUnit: unit,
                  source: 'order-calculate',
                  nhClient: name
                };
                break;
              }
            } catch (e) { /* try next client */ }
          }

          // Fallback: order book (using first client)
          if (!nicehashPrice && nhClientsToTry.length > 0) {
            try {
              const { client } = nhClientsToTry[0];
              const app = getNiceHashApp(client);
              const orderBook = await app.hashpower.getOrderBook({ algorithm: nicehashAlgo, market: 'USA' });
              const buyOrders = orderBook?.buy || [];
              if (buyOrders.length > 0) {
                const bestPrice = Math.max(...buyOrders.map(o => parseFloat(o.price || 0)).filter(p => p > 0));
                if (bestPrice > 0) {
                  nicehashPrice = {
                    algorithm: nicehashAlgo,
                    fixedPrice: bestPrice.toFixed(8),
                    currency: 'BTC',
                    speedUnit: getNiceHashUnit(nicehashAlgo) || 'TH',
                    source: 'order-book',
                    nhClient: nhClientsToTry[0].name
                  };
                }
              }
            } catch (e2) { /* ignore */ }
          }
        }

        return {
          mrrRig: {
            id: rig.id,
            name: rig.name || rig.rig_name || 'N/A',
            algo: mrrAlgo,
            price: rig.price,
            currency: rig.currency || 'BTC',
            type: rig.type
          },
          nicehashPrice
        };
      })
    );

    // 4. Filter out rigs without a valid MRR price
    const filteredResults = results.filter(r => r.mrrRig.price && parseFloat(r.mrrRig.price) > 0);

    res.json({
      success: true,
      data: filteredResults,
      meta: {
        mrrClient,
        nhClient: isAggregate(nhClient) ? 'ALL' : nhClient,
        totalRigs: rigs.length,
        matched: filteredResults.length,
        withNiceHashPrice: filteredResults.filter(r => r.nicehashPrice).length
      }
    });
  }));

  // ─── Rig Info ─────────────────────────────────────────────────
  app.get("/api/v2/mrr/rig/all", asyncHandler(async (req, res) => mrrRequest('/rig', req, res)));
  app.get("/api/v2/mrr/whoami", asyncHandler(async (req, res) => mrrRequest('/account/whoami', req, res)));
  app.get("/api/v2/mrr/rig", asyncHandler(async (req, res) => mrrRequest('/rig', req, res)));
  app.get("/api/v2/mrr/rig/:rigIds", asyncHandler(async (req, res) => mrrRequest(`/rig/${req.params.rigIds}`, req, res)));
  app.get("/api/v2/mrr/rig/:rigIds/pool", asyncHandler(async (req, res) => {
    const clientParam = String(req.query.client || defaultMrrClient).toUpperCase();
    const { statusCode, data, clientName } = await mrrApiCall({ endpoint: `/rig/${req.params.rigIds}/pool`, clientNameRaw: clientParam });
    if (statusCode === 200 && data?.success) {
      const nhPools = await getMatchingNiceHashPools(clientName);
      const items = Array.isArray(data.data) ? data.data : [data.data];
      items.forEach(item => {
        if (Array.isArray(item.pools)) {
          item.pools.forEach(p => {
            const mrrUser = String(p.user || p.username || '').trim().toLowerCase();
            const nhMatch = nhPools.find(nhp => String(nhp.username || '').trim().toLowerCase() === mrrUser);
            if (nhMatch) p.nhPoolName = nhMatch.name;
          });
        }
      });
    }
    res.set('X-MRR-Client', clientName);
    res.status(statusCode).json(data);
  }));
  app.put("/api/v2/mrr/rig/:rigId", asyncHandler(async (req, res) => {
    await mrrRequest(`/rig/${req.params.rigId}`, req, res, 'PUT', req.body);
  }));

  // ─── MRR Call Proxy ──────────────────────────────────────────
  app.post("/api/v2/mrr/call", asyncHandler(async (req, res) => {
    const { endpoint, method = 'GET', client, query, body } = req.body || {};
    const { statusCode, data, clientName } = await mrrApiCall({ endpoint, method, clientNameRaw: client || req.query.client, query: query && typeof query === 'object' ? query : undefined, body });
    res.set('X-MRR-Client', clientName);
    res.status(statusCode).json(data);
  }));
}
