// server/routes/mrr.js – Complete version
import { asyncHandler, extractRentalInfo, extractRigInfo } from "../utils.js";
import { mrrApiCall, mrrRequest, fetchAggregatedRentals, mrrConfigs, defaultMrrClient } from "../mrr.js";
import { resolveNhClient, isAggregate, getNiceHashApp, normalizeAlgoForNiceHash, getCachedNhPools } from "../nh.js";
import { getDb } from "../db.js";
import { saveToDatabase } from "./_helpers.js";
import { runRentalMonitor } from "../monitor.js"; // Corrected path

export function registerMrrRoutes(app) {
  // ─── Monitor ──────────────────────────────────────────────────
  app.post("/api/v2/mrr/monitor/run", asyncHandler(async (req, res) => {
    const scope = String(req.query.client || req.body?.client || "ALL").trim().toUpperCase();
    const result = await runRentalMonitor(true, scope);
    res.json({ success: true, ...result });
  }));

  // ─── MRR Market Proxy (public API, avoids CORS) ─────────────
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
              const nhPools = await getCachedNhPools(clientName);
              const poolItems = Array.isArray(poolsData.data) ? poolsData.data : (poolsData.data?.result || []);
              const poolMap = new Map(await Promise.all(poolItems.map(async (item) => {
                const id = String(item.rigId || item.rigid || item.id || item.rentalid || '');
                if (Array.isArray(item.pools) && item.pools.length > 0) {
                  try {
                    await db.run('BEGIN TRANSACTION');
                    const stmt = db.prepare(`INSERT OR REPLACE INTO mrr_pools (id, name, algo, host, port, user, mrrClient, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`);
                    item.pools.forEach(p => {
                      const algo = p.algo || p.algorithm || p.type || item.algo || item.algorithm || '';
                      stmt.run(id, p.name || `RigPool-${id}`, algo, p.host || p.stratumHost, p.port || p.stratumPort, p.user || p.username, clientName);
                    });
                    stmt.finalize();
                    await db.run('COMMIT');
                  } catch (e) {
                    await db.run('ROLLBACK');
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
        await db.run('BEGIN TRANSACTION');
        try {
          const stmt = db.prepare(`INSERT OR REPLACE INTO mrr_pools (id, name, algo, host, port, user, mrrClient, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`);
          pools.forEach(p => stmt.run(p.id, p.name, p.algo, p.host, p.port, p.user, clientName));
          stmt.finalize();
          await db.run('COMMIT');
        } catch (e) {
          await db.run('ROLLBACK');
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
      const nhPools = await getCachedNhPools(clientName);
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
  app.get("/api/v2/mrr/compare", asyncHandler(async (req, res) => {
    const clientParam = String(req.query.client || defaultMrrClient).toUpperCase();
    const algoParam = req.query.algorithm || req.query.algo;
    const { data: mrrData } = await mrrApiCall({ endpoint: '/rig', query: { algo: algoParam }, clientNameRaw: clientParam });
    const rigs = Array.isArray(mrrData?.data?.rigs) ? mrrData.data.rigs : Array.isArray(mrrData?.data) ? mrrData.data : [];
    if (rigs.length === 0) return res.json({ success: true, data: [] });
    const uniqueAlgos = [...new Set(rigs.map(r => String(r.algo || r.type || 'SHA256').toUpperCase()))];
    const { client: nhClient } = resolveNhClient(clientParam);
    const nhApp = getNiceHashApp(nhClient);
    const priceMap = new Map();
    for (const a of uniqueAlgos) {
      try {
        priceMap.set(a, await nhApp.hashpower.getOrderPrice({ algorithm: a, market: 'USA' }));
      } catch (e) { /* ignore */ }
    }
    const comparison = rigs.map(r => {
      const a = String(r.algo || r.type || 'SHA256').toUpperCase();
      return {
        mrrRig: {
          id: r.id,
          name: r.name,
          algo: r.algo || r.type,
          nicehashAlgo: normalizeAlgoForNiceHash(r.algo || r.type),
          price: r.price || r.min_price || '0',
          currency: r.price_unit || 'BTC',
          hashrate_unit: r.hashrate_unit || 'TH',
        },
        nicehashPrice: priceMap.get(a) || null
      };
    });
    res.json({ success: true, data: comparison });
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
      const nhPools = await getCachedNhPools(clientName);
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