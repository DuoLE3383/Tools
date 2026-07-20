import { NiceHashClient } from '../NiceHashClient.js';
import { NICEHASH_ALGO_MAP, normalizeAlgoForNiceHash } from '../src/core/mapping.js';
import { normalizeCredential } from './utils.js';
import { getDb } from './db.js';

export const AGGREGATE_CLIENT = 'VN';
const poolCache = new Map();
const publicCache = new Map();
const POOL_CACHE_TTL = 60000;
const NH_CACHE_TTL_DEFAULT = 30000;
const NH_CACHE_TTL_STABLE = 300000;
const AGGREGATED_ORDERS_CACHE_TTL = 15000;
const aggregatedOrdersCache = new Map();
const nhInflight = new Map();
const nhInstances = new Map();

/** Cache for getNiceHashApp — one proxy object per client, never recreated */
const nhAppCache = new Map();

/** Normalizes market strings (USA/EU) to NiceHash numeric IDs (1/0) */
export function normalizeMarket(market) {
  if (typeof market === 'number') return String(Math.floor(market));
  if (market === '1' || market === '0') return market;
  if (!isNaN(Number(market)) && market !== null && market !== '') return String(Number(market));
  const m = String(market || '0').toUpperCase().trim();
  if (m === 'USA' || m === 'AMERICA' || m === 'US') return '1';
  if (m === 'EU' || m === 'EUROPE') return '0';
  return m;
}

export { NICEHASH_ALGO_MAP, normalizeAlgoForNiceHash };

export let nhConfigs = {};

export function initNhConfigs(env) {
  nhConfigs = {};
  Object.keys(env).forEach(key => {
    if (key.startsWith('NICEHASH_API_KEY_')) {
      const acct = key.replace('NICEHASH_API_KEY_', '').toUpperCase();
      const secretKey = `NICEHASH_API_SECRET_${acct}`;
      const orgIdKey = `NICEHASH_ORG_ID_${acct}`;
      if (env[key] && env[secretKey] && env[orgIdKey]) {
        nhConfigs[acct] = {
          apiKey: normalizeCredential(env[key]),
          apiSecret: normalizeCredential(env[secretKey]),
          orgId: normalizeCredential(env[orgIdKey]),
          environment: normalizeCredential(env[`NICEHASH_ENVIRONMENT_${acct}`] || env.NICEHASH_ENVIRONMENT || 'production'),
        };
      }
    }
  });
  if (env.NICEHASH_API_KEY && env.NICEHASH_API_SECRET && env.NICEHASH_ORG_ID) {
    if (!nhConfigs.BT) {
      nhConfigs.BT = {
        apiKey: normalizeCredential(env.NICEHASH_API_KEY),
        apiSecret: normalizeCredential(env.NICEHASH_API_SECRET),
        orgId: normalizeCredential(env.NICEHASH_ORG_ID),
        environment: normalizeCredential(env.NICEHASH_ENVIRONMENT || 'production'),
      };
    }
  }
}

export const isAggregate = (c) => {
  const uc = String(c || '').trim().toUpperCase();
  return uc === 'ALL' || uc === AGGREGATE_CLIENT;
};

export function resolveNhClient(clientNameRaw) {
  const targetClientName = String(clientNameRaw || AGGREGATE_CLIENT).trim().toUpperCase();
  if (isAggregate(targetClientName)) {
    return { client: { isAggregate: true, name: AGGREGATE_CLIENT }, clientName: AGGREGATE_CLIENT };
  }
  if (nhInstances.has(targetClientName)) {
    return { client: nhInstances.get(targetClientName), clientName: targetClientName };
  }
  const cfg = nhConfigs[targetClientName];
  if (cfg?.apiKey && cfg?.apiSecret && cfg?.orgId) {
    const newClient = new NiceHashClient({ ...cfg, name: targetClientName });
    nhInstances.set(targetClientName, newClient);
    return { client: newClient, clientName: targetClientName };
  }
  if (!isAggregate(targetClientName)) {
    console.warn(`[nh:resolve] Specific client "${targetClientName}" not found or unconfigured.`);
    return { client: undefined, clientName: targetClientName };
  }
  return { client: { isAggregate: true, name: AGGREGATE_CLIENT }, clientName: AGGREGATE_CLIENT };
}

async function cachedCall(client, options) {
  const isGet = options.method === 'GET';
  const isPublic = options.path.includes('/public/') || options.path.includes('/mining/algorithms') || options.path.includes('/mining/markets');
  if (isGet && isPublic) {
    const cacheKey = `${options.path}:${JSON.stringify(options.query || {})}`;
    const cached = publicCache.get(cacheKey);
    const ttl = options.path.includes('algorithms') || options.path.includes('markets') ? NH_CACHE_TTL_STABLE : NH_CACHE_TTL_DEFAULT;
    if (cached && (Date.now() - cached.ts < ttl)) return cached.data;
    if (nhInflight.has(cacheKey)) return nhInflight.get(cacheKey);
    const promise = client.call(options).then(data => {
      if (data && !data.error) publicCache.set(cacheKey, { data, ts: Date.now() });
      return data;
    }).finally(() => nhInflight.delete(cacheKey));
    nhInflight.set(cacheKey, promise);
    return promise;
  }
  return client.call(options);
}

/** Fetches and caches NiceHash pools to prevent API hammering */
export async function getCachedNhPools(clientNameRaw) {
  const { client, clientName } = resolveNhClient(clientNameRaw);
  if (!client) return [];
  const cached = poolCache.get(clientName);
  if (cached && (Date.now() - cached.ts < POOL_CACHE_TTL)) return cached.pools;
  try {
    const allPools = [];
    let page = 0;
    const size = 100;
    while (true) {
      const res = await client.call({ method: 'GET', path: '/main/api/v2/pools', query: { page: page.toString(), size: size.toString() } });
      const list = res?.list;
      if (!Array.isArray(list) || list.length === 0) break;
      allPools.push(...list);
      if (list.length < size) break;
      page++;
    }
    poolCache.set(clientName, { pools: allPools, ts: Date.now() });
    if (allPools.length > 0) {
      const db = await getDb();
      const savepointName = `nh_pools_sync_${clientName.replace(/[^a-zA-Z0-9]/g, "")}`;
      let savepointCreated = false;
      try {
        await db.run(`SAVEPOINT ${savepointName}`);
        savepointCreated = true;
        const stmt = await db.prepare(`INSERT OR REPLACE INTO nh_pools (id, name, algorithm, stratumHostname, port, username, password, nhClient, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`);
        for (const p of allPools) await stmt.run(p.id, p.name, p.algorithm, p.stratumHostname, p.port, p.username, p.password, clientName);
        await stmt.finalize();
        await db.run(`RELEASE SAVEPOINT ${savepointName}`);
      } catch (e) {
        if (savepointCreated) { try { await db.run(`ROLLBACK TO SAVEPOINT ${savepointName}`); } catch (_) {} }
      }
    }
    return allPools;
  } catch (e) {
    console.warn(`[nh:pools] Cache fetch failed for ${clientName}:`, e.message);
    return cached ? cached.pools : [];
  }
}

// ─── Aggregate helpers ─────────────────────────────────────────────

async function getAggregatedBalances() {
  const allClientNames = Object.keys(nhConfigs).filter(c => nhConfigs[c].apiKey && !isAggregate(c));
  const allCurrencies = [];
  const errors = [];
  let total = { available: 0, pending: 0, totalBalance: 0, currency: "BTC" };
  await Promise.all(allClientNames.map(async (name) => {
    try {
      const { client: singleClient } = resolveNhClient(name);
      if (singleClient && !singleClient.isAggregate) {
        const result = await singleClient.call({ method: 'GET', path: '/main/api/v2/accounting/accounts2', query: { ts: Date.now().toString() } });
        if (result && result.total) {
          total.available += parseFloat(result.total.available || 0);
          total.pending += parseFloat(result.total.pending || 0);
          total.totalBalance += parseFloat(result.total.totalBalance || 0);
          if (result.currencies) allCurrencies.push(...result.currencies.map(c => ({ ...c, nhClient: name })));
        }
      }
    } catch (e) { errors.push({ client: name, message: e.message }); }
  }));
  return { currencies: allCurrencies, total: { available: total.available.toFixed(8), pending: total.pending.toFixed(8), totalBalance: total.totalBalance.toFixed(8), currency: "BTC" }, errors: errors.length > 0 ? errors : undefined };
}

async function getAggregatedRigs() {
  const allClientNames = Object.keys(nhConfigs).filter(c => nhConfigs[c].apiKey && !isAggregate(c));
  const allRigs = [];
  const errors = [];
  await Promise.all(allClientNames.map(async (name) => {
    try {
      const { client: singleClient } = resolveNhClient(name);
      if (singleClient && !singleClient.isAggregate) {
        const result = await singleClient.call({ method: 'GET', path: '/main/api/v2/mining/rigs2', query: { ts: Date.now().toString() } });
        if (result && result.miningRigs) allRigs.push(...result.miningRigs.map(r => ({ ...r, nhClient: name })));
      }
    } catch (e) { errors.push({ client: name, message: e.message }); }
  }));
  return { miningRigs: allRigs, errors: errors.length > 0 ? errors : undefined };
}

async function getAggregatedMyOrders(query = {}) {
  const queryKey = JSON.stringify(query);
  const cached = aggregatedOrdersCache.get(queryKey);
  if (cached && (Date.now() - cached.ts < AGGREGATED_ORDERS_CACHE_TTL)) return cached.data;
  const allClientNames = Object.keys(nhConfigs).filter(c => nhConfigs[c].apiKey && !isAggregate(c));
  const allOrders = [];
  const errors = [];
  await Promise.allSettled(allClientNames.map(async (name) => {
    try {
      const { client: singleClient } = resolveNhClient(name);
      if (singleClient && !singleClient.isAggregate) {
        const result = await singleClient.call({ method: 'GET', path: '/main/api/v2/hashpower/myOrders', query: { ts: Date.now().toString(), ...query } });
        if (result && (result.list || result.myOrders)) allOrders.push(...(result.list || result.myOrders).map(o => ({ ...o, nhClient: name })));
      }
    } catch (e) { errors.push({ client: name, message: e.message }); }
  }));
  const response = { list: allOrders, pagination: { total: allOrders.length, page: 0, size: allOrders.length }, errors: errors.length > 0 ? errors : undefined };
  aggregatedOrdersCache.set(queryKey, { data: response, ts: Date.now() });
  return response;
}

async function getAggregatedPools() {
  const allClientNames = Object.keys(nhConfigs).filter(c => nhConfigs[c].apiKey && !isAggregate(c));
  const allPools = [];
  const errors = [];
  for (const name of allClientNames) {
    try { allPools.push(...(await getCachedNhPools(name)).map(p => ({ ...p, nhClient: name }))); }
    catch (e) { errors.push({ client: name, message: e.message }); }
  }
  return { list: allPools, totalCount: allPools.length, errors: errors.length > 0 ? errors : undefined };
}

// ═══════════════════════════════════════════════════════════════════
//  OPTIMIZED: Build the NH app proxy ONCE per client, cache it.
//  Previously this object was created on EVERY route call.
// ═══════════════════════════════════════════════════════════════════
function buildSingleClientApp(client) {
  return {
    public: {
      getTime: async () => { try { return await client.getServerTime(); } catch (err) { console.warn(`[nh:getTime] Failed for ${client.name}: ${err.message}. Using local time.`); return Date.now(); } },
      getDoc: () => cachedCall(client, { method: 'GET', path: '/api/v2/doc' }),
      getAlgorithms: () => cachedCall(client, { method: 'GET', path: '/main/api/v2/mining/algorithms' }),
      getMarkets: () => cachedCall(client, { method: 'GET', path: '/main/api/v2/mining/markets' }),
      getCurrencies: () => cachedCall(client, { method: 'GET', path: '/main/api/v2/public/currencies' }),
      getNetworks: () => client.call({ method: 'GET', path: '/main/api/v2/public/networks' }),
      getFeeInfo: () => client.call({ method: 'GET', path: '/main/api/v2/public/service/fee/info' }),
      getCountries: () => client.call({ method: 'GET', path: '/api/v2/enum/countries' }),
      getOrgIndustry: () => client.call({ method: 'GET', path: '/api/v2/enum/organisationIndustry' }),
      getPermissions: () => client.call({ method: 'GET', path: '/api/v2/enum/permissions' }),
      getXchCountries: () => client.call({ method: 'GET', path: '/api/v2/enum/xchCountries' }),
      getSystemFlags: () => client.call({ method: 'GET', path: '/api/v2/system/flags' }),
    },
    accounting: {
      getBalances: () => client.call({ method: 'GET', path: '/main/api/v2/accounting/accounts2', query: { ts: Date.now().toString() } }),
      getBalance: (currency) => client.call({ method: 'GET', path: `/main/api/v2/accounting/account2/${currency}`, query: { ts: Date.now().toString() } }),
      getActivitiesAll: () => client.call({ method: 'GET', path: '/main/api/v2/accounting/activities', query: { ts: Date.now().toString() } }),
      getActivity: (currency) => client.call({ method: 'GET', path: `/main/api/v2/accounting/activity/${currency}`, query: { ts: Date.now().toString() } }),
      getCurrencies: () => client.call({ method: 'GET', path: '/main/api/v2/accounting/currencies', query: { ts: Date.now().toString() } }),
      getDepositAddressLn: (body) => client.call({ method: 'POST', path: '/main/api/v2/accounting/depositAddress/ln', body }),
      getDepositAddresses: () => client.call({ method: 'GET', path: '/main/api/v2/accounting/depositAddresses', query: { ts: Date.now().toString() } }),
      getDepositsAll: () => client.call({ method: 'GET', path: '/main/api/v2/accounting/deposits', query: { ts: Date.now().toString() } }),
      getDeposits: (currency) => client.call({ method: 'GET', path: `/main/api/v2/accounting/deposits/${currency}`, query: { ts: Date.now().toString() } }),
      getDepositDetail: (currency, id) => client.call({ method: 'GET', path: `/main/api/v2/accounting/deposits2/${currency}/${id}`, query: { ts: Date.now().toString() } }),
      getExchangeTrades: (id) => client.call({ method: 'GET', path: `/main/api/v2/accounting/exchange/${id}/trades`, query: { ts: Date.now().toString() } }),
      getHashpowerTransactions: (id) => client.call({ method: 'GET', path: `/main/api/v2/accounting/hashpower/${id}/transactions`, query: { ts: Date.now().toString() } }),
      getMiningEarnings: (currency) => client.call({ method: 'GET', path: `/main/api/v2/accounting/hashpowerEarnings/${currency}`, query: { ts: Date.now().toString() } }),
      getIndividualBalance: () => client.call({ method: 'GET', path: '/main/api/v2/accounting/individual/balance', query: { ts: Date.now().toString() } }),
      listVirginUtxos: () => client.call({ method: 'GET', path: '/main/api/v2/accounting/list/virginUtxo', query: { ts: Date.now().toString() } }),
      selectVirginUtxo: (body) => client.call({ method: 'POST', path: '/main/api/v2/accounting/select/virginUtxo', body }),
      getTransaction: (currency, transactionId) => client.call({ method: 'GET', path: `/main/api/v2/accounting/transaction/${currency}/${transactionId}`, query: { ts: Date.now().toString() } }),
      getTransactions: (currency) => client.call({ method: 'GET', path: `/main/api/v2/accounting/transactions/${currency}`, query: { ts: Date.now().toString() } }),
      transitionConsolidation: (body) => client.call({ method: 'POST', path: '/main/api/v2/accounting/transition/consolidation', body }),
      getTravelRuleData: () => client.call({ method: 'GET', path: '/main/api/v2/accounting/travelrule/transaction/data', query: { ts: Date.now().toString() } }),
      getTravelRuleVasps: () => client.call({ method: 'GET', path: '/main/api/v2/accounting/travelrule/vasps', query: { ts: Date.now().toString() } }),
      resolveWithheld: (id) => client.call({ method: 'POST', path: `/main/api/v2/accounting/travelrule/withheldDeposit/resolve/${id}` }),
      createWithdrawal: (body) => client.call({ method: 'POST', path: '/main/api/v2/accounting/withdrawal', body }),
      cancelWithdrawal: (currency, id) => client.call({ method: 'DELETE', path: `/main/api/v2/accounting/withdrawal/${currency}/${id}`, query: { ts: Date.now().toString() } }),
      getWithdrawalDetail: (currency, id) => client.call({ method: 'GET', path: `/main/api/v2/accounting/withdrawal2/${currency}/${id}`, query: { ts: Date.now().toString() } }),
      getWithdrawalAddress: (id) => client.call({ method: 'GET', path: `/main/api/v2/accounting/withdrawalAddress/${id}`, query: { ts: Date.now().toString() } }),
      getWithdrawalAddresses: () => client.call({ method: 'GET', path: '/main/api/v2/accounting/withdrawalAddresses', query: { ts: Date.now().toString() } }),
      getWithdrawals: (currency) => client.call({ method: 'GET', path: `/main/api/v2/accounting/withdrawals/${currency}`, query: { ts: Date.now().toString() } }),
    },
    mining: {
      getMiningAddress: () => client.call({ method: 'GET', path: '/main/api/v2/mining/miningAddress', query: { ts: Date.now().toString() } }),
      getAlgoStats: () => client.call({ method: 'GET', path: '/main/api/v2/mining/algo/stats', query: { ts: Date.now().toString() } }),
      getGroups: () => client.call({ method: 'GET', path: '/main/api/v2/mining/groups/list', query: { ts: Date.now().toString() } }),
      getRigStatsAlgo: () => client.call({ method: 'GET', path: '/main/api/v2/mining/rig/stats/algo', query: { ts: Date.now().toString() } }),
      getRigStatsUnpaid: () => client.call({ method: 'GET', path: '/main/api/v2/mining/rig/stats/unpaid', query: { ts: Date.now().toString() } }),
      getRigDetails: (rigId) => client.call({ method: 'GET', path: `/main/api/v2/mining/rig2/${rigId}`, query: { ts: Date.now().toString() } }),
      getRigsLegacy: () => client.call({ method: 'GET', path: '/main/api/v2/mining/rigs', query: { ts: Date.now().toString() } }),
      getActiveWorkers: () => client.call({ method: 'GET', path: '/main/api/v2/mining/rigs/activeWorkers', query: { ts: Date.now().toString() } }),
      getPayouts: () => client.call({ method: 'GET', path: '/main/api/v2/mining/rigs/payouts', query: { ts: Date.now().toString() } }),
      getRigsStatsAlgo: () => client.call({ method: 'GET', path: '/main/api/v2/mining/rigs/stats/algo', query: { ts: Date.now().toString() } }),
      getRigsStatsData: () => client.call({ method: 'GET', path: '/main/api/v2/mining/rigs/stats/data', query: { ts: Date.now().toString() } }),
      getRigsStatsDataAlgo: () => client.call({ method: 'GET', path: '/main/api/v2/mining/rigs/stats/data/algo', query: { ts: Date.now().toString() } }),
      getRigsStatsHistory: (query) => client.call({ method: 'GET', path: '/main/api/v2/mining/rigs/stats/history', query }),
      getRigsStatsUnpaid: () => client.call({ method: 'GET', path: '/main/api/v2/mining/rigs/stats/unpaid', query: { ts: Date.now().toString() } }),
      setRigStatus: (body) => client.call({ method: 'POST', path: '/main/api/v2/mining/rigs/status2', body }),
      getRigs: () => client.call({ method: 'GET', path: '/main/api/v2/mining/rigs2', query: { ts: Date.now().toString() } }),
      exportOfflineRigs: () => client.call({ method: 'GET', path: '/main/api/v2/mining/rigs2/exportOffline', query: { ts: Date.now().toString() } }),
    },
    hashpower: {
      getBusinessBuyerStats: () => client.call({ method: 'GET', path: '/main/api/v2/hashpower/business/buyer/stats' }),
      getBusinessBuyerInfo: () => client.call({ method: 'GET', path: '/main/api/v2/hashpower/business/buyers/info' }),
      getMyOrders: (query) => client.call({ method: 'GET', path: '/main/api/v2/hashpower/myOrders', query: { op: 'LE', limit: '1000', ts: Date.now().toString(), ...query } }),
      createOrder: (orderData) => client.call({ method: 'POST', path: '/main/api/v2/hashpower/order', body: orderData }),
      getOrderDetail: async (orderId) => { try { return await client.call({ method: 'GET', path: `/main/api/v2/hashpower/order/${orderId}`, query: { ts: Date.now().toString() } }); } catch (err) { throw err; } },
      cancelOrder: (orderId) => client.call({ method: 'DELETE', path: `/main/api/v2/hashpower/order/${orderId}` }),
      refillOrder: (orderId, body) => client.call({ method: 'POST', path: `/main/api/v2/hashpower/order/${orderId}/refill`, body }),
      updatePriceLimit: (orderId, body) => client.call({ method: 'POST', path: `/main/api/v2/hashpower/order/${orderId}/updatePriceAndLimit`, body }),
      getVmmOrders: () => client.call({ method: 'GET', path: '/main/api/v2/hashpower/vmm/orders' }),
      getOrderPrice: (query) => {
        const { algorithm, market, amount, limit, ...rest } = query || {};
        return client.call({ method: 'GET', path: '/main/api/v2/hashpower/order/calculate', query: { ...rest, algorithm: normalizeAlgoForNiceHash(algorithm), market: normalizeMarket(market || 'USA'), amount: amount || limit || '0.01' } });
      },
      getBusinessOrder: (query) => {
        const { algorithm, market, client: _c, ts: _t, ...rest } = query || {};
        return client.call({ method: 'GET', path: '/main/api/v2/hashpower/order/calculate', query: { ...rest, algorithm: normalizeAlgoForNiceHash(algorithm), market: normalizeMarket(market), amount: rest.amount || '0.001' } });
      },
      getOrderBook: (query) => {
        const { algorithm, market, client: _c, ts: _t, ...rest } = query || {};
        return client.call({ method: 'GET', path: '/main/api/v2/hashpower/orderBook', query: { ...rest, algorithm: normalizeAlgoForNiceHash(algorithm), market: normalizeMarket(market) } });
      },
      getGlobalStats24h: () => client.call({ method: 'GET', path: '/main/api/v2/public/stats/global/24h' }),
    },
    easyMining: {
      getMassBuyConfigs: () => client.call({ method: 'GET', path: '/main/api/v2/hashpower/easymining/massbuy/configurations', query: { ts: Date.now().toString() } }),
      getSoloOrders: () => client.call({ method: 'GET', path: '/main/api/v2/hashpower/solo/order', query: { ts: Date.now().toString() } }),
      buySoloPackage: (body) => client.call({ method: 'POST', path: '/main/api/v2/hashpower/solo/order', body }),
      getCurrencyAlgos: () => client.call({ method: 'GET', path: '/main/api/v2/public/currency-algos' }),
      getPackages: () => client.call({ method: 'GET', path: '/main/api/v2/public/easymining/packages' }),
    },
    pools: {
      getPools: async () => {
        const allPools = [];
        let page = 0;
        const size = 100;
        while (true) {
          const res = await client.call({ method: 'GET', path: '/main/api/v2/pools', query: { page: page.toString(), size: size.toString() } });
          const list = res?.list;
          if (!Array.isArray(list) || list.length === 0) break;
          allPools.push(...list);
          if (list.length < size) break;
          page++;
        }
        return { list: allPools, totalCount: allPools.length };
      },
      getPoolDetails: (poolId) => client.call({ method: 'GET', path: `/main/api/v2/pool/${poolId}` }),
      createPool: (body) => client.call({ method: 'POST', path: '/main/api/v2/pool', body }),
      deletePool: (poolId) => client.call({ method: 'DELETE', path: `/main/api/v2/pool/${poolId}` }),
      verifyPool: (body) => client.call({ method: 'POST', path: '/main/api/v2/pools/verify', body }),
    },
  };
}

/**
 * OPTIMIZED: Returns a cached NiceHash app proxy for the given client.
 * 
 * BEFORE: Every route call → resolveNhClient → getNiceHashApp(client) 
 * → created brand new object with hundreds of function properties.
 * 
 * AFTER: First call builds+registers. All subsequent calls return cached
 * reference. ~200x reduction in GC pressure per request.
 */
export const getNiceHashApp = (client) => {
  if (client && client.isAggregate) {
    const cacheKey = '__aggregate__';
    const cached = nhAppCache.get(cacheKey);
    if (cached) return cached;

    const { client: fallbackClient } = resolveNhClient('BT');
    const fallbackApp = getNiceHashApp(fallbackClient);

    const aggApp = {
      ...fallbackApp,
      accounting: { ...fallbackApp.accounting, getBalances: () => getAggregatedBalances() },
      mining: { ...fallbackApp.mining, getRigs: () => getAggregatedRigs() },
      hashpower: {
        ...fallbackApp.hashpower,
        getMyOrders: (query) => getAggregatedMyOrders(query),
        getOrderDetail: async (orderId) => {
          const allOrdersResult = await getAggregatedMyOrders({ op: 'LE', limit: 1000 });
          const order = allOrdersResult.list.find(o => o.id === orderId);
          if (order && order.nhClient) {
            const { client: singleClient } = resolveNhClient(order.nhClient);
            if (singleClient && !singleClient.isAggregate) return getNiceHashApp(singleClient).hashpower.getOrderDetail(orderId);
          }
          const error = new Error(`Order ${orderId} not found among active orders for any configured client.`);
          error.statusCode = 404;
          throw error;
        },
      },
      pools: { ...fallbackApp.pools, getPools: () => getAggregatedPools() },
    };
    nhAppCache.set(cacheKey, aggApp);
    return aggApp;
  }

  // Single client — cache by client name
  const name = client?.name || 'BT';
  const cached = nhAppCache.get(name);
  if (cached) return cached;

  const app = buildSingleClientApp(client);
  nhAppCache.set(name, app);
  return app;
};
