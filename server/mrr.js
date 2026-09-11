// server/mrr.js - COMPLETE UPGRADED VERSION
// Fixes: Ghost rental spam, batch processing, reduced logging, better performance, caching,
//        plus missing /compare endpoint for MRR vs NiceHash price comparison,
//        plus /nicehash/price endpoint for direct price lookups from all providers.

import fs from 'fs/promises';
import path from 'path';
import express from 'express';
import { createHash, createHmac } from 'node:crypto';
import { getDb, withSavepoint } from './db.js';
import { normalizeCredential, sanitizeMrrEndpoint } from './utils.js';
import { isAggregate, resolveNhClient, getNiceHashApp, normalizeAlgoForNiceHash, nhConfigs } from './nh.js';
import { getNiceHashUnit } from '../src/core/mapping.js';

// ============================================
// ALGORITHM MAPPING (Minimal implementation to fix server error)
// ============================================
const ALGO_MAPPING = {
  KAWPOW: { displayName: 'Kawpow' },
  OCTOPUS: { displayName: 'Octopus' },
  RANDOMXMONERO: { displayName: 'RandomX' },
  KHEAVYHASH: { displayName: 'kHeavyHash' },
  ETCHASH: { displayName: 'Etchash' },
  AUTOLYKOS2: { displayName: 'Autolykos2' },
  BEAMV3: { displayName: 'BeamV3' },
  ZELHASH: { displayName: 'ZelHash' },
  BLAKE3: { displayName: 'Blake3' },
  DYNEXSOLVE: { displayName: 'DynexSolve' },
  NEXAPOW: { displayName: 'NexaPow' },
  IRONFISH: { displayName: 'IronFish' },
  EQUIHASH: { displayName: 'Equihash' },
  HANDSHAKE: { displayName: 'Handshake' },
  KECCAK: { displayName: 'Keccak' },
  LBRY: { displayName: 'LBRY' },
  LYRA2REV2: { displayName: 'Lyra2REv2' },
  NEOSCRYPT: { displayName: 'NeoScrypt' },
  QUBIT: { displayName: 'Qubit' },
  SCRYPT: { displayName: 'Scrypt' },
  SHA256: { displayName: 'SHA256' },
  X11: { displayName: 'X11' },
  X13: { displayName: 'X13' },
  FISHHASH: { displayName: 'FishHash' },
  KARLSENHASH: { displayName: 'KarlsenHash' },
  PYRINHASH: { displayName: 'PyrinHash' },
};

function getAlgoMapping(algo) {
  if (!algo) return { displayName: 'N/A' };
  const upperAlgo = String(algo).toUpperCase().replace(/[-_\s]/g, '');
  return ALGO_MAPPING[upperAlgo] || { displayName: algo };
}

export function getAlgoDisplayName(algo) {
  if (!algo) return 'N/A';
  const fallback = (s) => (s.toUpperCase() === s && s.toLowerCase() !== s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);
  const mapping = getAlgoMapping(algo);
  return mapping.displayName || fallback(algo);
}

// ============================================
// STATE MANAGEMENT
// ============================================
const mrrLastNonceByClient = new Map();
const mrrInitTracker = new Set();
let mrrClockOffset = 0n;
let mrrClockSynced = false;
let mrrSyncPromise = null;

export let mrrConfigs = {};
export let defaultMrrClient = 'BT';

const mrrQueueByClient = new Map();
const MRR_GLOBAL_COUNTER_KEY = '__mrrGlobalCounter';
let mrrGlobalCounter = 0n;
if (typeof globalThis !== 'undefined' && typeof globalThis[MRR_GLOBAL_COUNTER_KEY] === 'undefined') {
  globalThis[MRR_GLOBAL_COUNTER_KEY] = 0n;
}

function getGlobalMrrCounter() {
  if (typeof globalThis !== 'undefined') {
    const value = globalThis[MRR_GLOBAL_COUNTER_KEY];
    return typeof value === 'bigint' ? value : 0n;
  }
  return mrrGlobalCounter;
}

function bumpGlobalMrrCounter() {
  if (typeof globalThis !== 'undefined') {
    const nextValue = (getGlobalMrrCounter() + 1n) % 10000n;
    globalThis[MRR_GLOBAL_COUNTER_KEY] = nextValue;
    return nextValue;
  }
  mrrGlobalCounter = (mrrGlobalCounter + 1n) % 10000n;
  return mrrGlobalCounter;
}

// Cache and In-flight request tracking
const mrrRequestCache = new Map();
const mrrInflight = new Map();
const MRR_CACHE_TTL_DEFAULT = 10000;
const MRR_CACHE_TTL_STABLE = 300000;
const MRR_GET_CACHE_TTL = 60000;

export const mrrGetCache = new Map();

const MRR_NONCE_RECOVERY_JUMP_SMALL = 60000000000n;
const MRR_NONCE_RECOVERY_JUMP_LARGE = 3600000000000n;

const USER_AGENT = 'Ben Tre Mining Tool/2.0';

const mrrInstances = new Map();

// ============================================
// LOGGING WITH RATE LIMITING
// ============================================
const logCooldown = new Map();
const LOG_COOLDOWN_MS = 30000;

function shouldLog(key, message) {
  const now = Date.now();
  const lastLog = logCooldown.get(key);
  if (!lastLog || (now - lastLog) > LOG_COOLDOWN_MS) {
    logCooldown.set(key, now);
    return true;
  }
  return false;
}

function logOnce(level, key, message, ...args) {
  if (shouldLog(key, message)) {
    const logger = level === 'warn' ? console.warn : 
                   level === 'error' ? console.error : 
                   console.log;
    logger(message, ...args);
  }
}

const ghostRentalIds = new Set();
const GHOST_RENTAL_CACHE_TTL = 43200000;

function isGhostRental(rental) {
  if (!rental) return true;
  const id = String(rental.id || '');
  if (!id || id === 'false' || id === 'null' || id === 'undefined' || id === '0') return true;
  if (ghostRentalIds.has(id)) return true;
  if (!rental.rigid && !rental.rig && !rental.status && !rental.rented) return true;
  return false;
}

export function markGhostRental(rentalId) {
  const id = String(rentalId);
  if (id && id !== 'false' && id !== 'null' && id !== 'undefined') {
    ghostRentalIds.add(id);
    setTimeout(() => ghostRentalIds.delete(id), GHOST_RENTAL_CACHE_TTL);
  }
}

function clearGhostRentals() {
  ghostRentalIds.clear();
}

// ============================================
// CONFIGURATION
// ============================================
export function initMrrConfigs(env) {
  mrrConfigs = {};
  Object.keys(env).forEach(key => {
    if (key.startsWith('MRR_KEY_RIG_')) {
      const acct = key.replace('MRR_KEY_RIG_', '').toUpperCase();
      if (!mrrConfigs[acct] && env[key] && (env[`MRR_SECRET_RIG_${acct}`] || env[`MRR_API_SECRET_${acct}`])) {
        mrrConfigs[acct] = {
          apiKey: normalizeCredential(env[key]),
          apiSecret: normalizeCredential(env[`MRR_SECRET_RIG_${acct}`] || env[`MRR_API_SECRET_${acct}`]),
          nonceOverride: env[`MRR_NONCE_OVERRIDE_${acct}`] ? BigInt(env[`MRR_NONCE_OVERRIDE_${acct}`]) : null,
        };
      }
    }
  });
  const defaultMrrClientRaw = String(env.MRR_DEFAULT_CLIENT || 'BT').trim().toUpperCase();
  const availableClients = Object.keys(mrrConfigs);
  if (mrrConfigs[defaultMrrClientRaw]) {
    defaultMrrClient = defaultMrrClientRaw;
  } else if (availableClients.length > 0) {
    defaultMrrClient = availableClients[0];
  } else {
    defaultMrrClient = 'BT';
  }
}

// ============================================
// NONCE MANAGEMENT
// ============================================
export async function initNonces() {
  try {
    const db = await getDb();
    const rows = await db.all('SELECT client, last_nonce FROM mrr_nonces');
    if (rows) {
      rows.forEach(row => {
        try {
          if (row.client && row.client.length > 10 && row.last_nonce) {
            mrrLastNonceByClient.set(row.client, BigInt(row.last_nonce));
            console.log(`[mrr:init] Loaded nonce baseline for Key ${row.client.slice(0, 8)}...: ${row.last_nonce}`);
          }
        } catch (e) { /* ignore */ }
      });
    }
  } catch (e) {
    if (!e.message.includes('no such table')) {
      console.warn(`[mrr:init] Could not load nonces from DB: ${e.message}`);
    }
  }
  Object.values(mrrConfigs).forEach(cfg => {
    if (cfg.nonceOverride && cfg.apiKey) {
      const current = mrrLastNonceByClient.get(cfg.apiKey) || 0n;
      if (cfg.nonceOverride > current) {
        console.log(`[mrr:init] Applying manual nonce override for Key ${cfg.apiKey.slice(0, 8)}...: ${cfg.nonceOverride}`);
        mrrLastNonceByClient.set(cfg.apiKey, cfg.nonceOverride);
      }
    }
  });
}

export function nextMrrNonce(apiKey, clientLabel) {
  if (!apiKey) return (BigInt(Date.now()) * 1000000n).toString();
  const lastNonce = BigInt(mrrLastNonceByClient.get(apiKey) || 0n);
  if (lastNonce > 19446744073709551615n) {
    console.warn(`[mrr:${clientLabel}] Nonce overflow. Resetting baseline.`);
    mrrLastNonceByClient.set(apiKey, 1n);
  }
  const nowMs = BigInt(Date.now()) + mrrClockOffset;
  const now19 = (nowMs + 100n) * 1000000n;
  const counter = bumpGlobalMrrCounter();
  const baseNonce = (now19 > lastNonce) ? now19 : (lastNonce + 1n);
  const nonce = baseNonce + counter;
  mrrLastNonceByClient.set(apiKey, nonce);
  new Promise(async (resolve) => {
    try {
      const db = await getDb();
      await db.run(
        `INSERT INTO mrr_nonces (client, last_nonce) VALUES (?, ?)
         ON CONFLICT(client) DO UPDATE SET last_nonce=excluded.last_nonce`,
        [apiKey, nonce.toString()]
      );
    } catch (e) { /* ignore */ }
    resolve();
  });
  return nonce.toString();
}

// ============================================
// CLOCK SYNC
// ============================================
function extractEpochMs(payload) {
  const candidates = [
    payload?.data,
    payload?.data?.time,
    payload?.data?.timestamp,
    payload?.data?.server_time,
    payload?.data?.serverTime,
    payload?.time,
    payload?.timestamp,
    payload?.server_time,
    payload?.serverTime,
  ];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null || candidate === '') continue;
    if (typeof candidate === 'object') continue;
    const parsed = Number(candidate);
    if (!Number.isFinite(parsed) || parsed <= 0) continue;
    return parsed >= 1e12 ? BigInt(Math.trunc(parsed)) : BigInt(Math.trunc(parsed * 1000));
  }
  return null;
}

export async function syncMrrClock(force = false) {
  if (mrrClockSynced && !force) return;
  if (mrrSyncPromise) return mrrSyncPromise;
  console.log('[mrr:clock] Synchronizing with MiningRigRentals server time...');
  mrrSyncPromise = (async () => {
    const startSync = Date.now();
    const trySync = async (url) => {
      try {
        const res = await fetch(url, {
          headers: { 'user-agent': USER_AGENT },
          signal: AbortSignal.timeout(5000)
        });
        if (!res.ok) return null;
        const dateHeader = res.headers.get('Date');
        let headerTimeMs = null;
        if (dateHeader) {
          const parsed = new Date(dateHeader).getTime();
          if (Number.isFinite(parsed) && parsed > 0) headerTimeMs = BigInt(parsed);
        }
        const text = await res.text();
        let body = {};
        try { body = JSON.parse(text); } catch { }
        const extracted = extractEpochMs(body);
        return extracted ?? headerTimeMs;
      } catch { return null; }
    };
    try {
      let serverTimeMs = await trySync('https://www.miningrigrentals.com/api/v2/info/time');
      if (!serverTimeMs) {
        serverTimeMs = await trySync('https://www.miningrigrentals.com/');
      }
      const endSync = Date.now();
      const rtt = BigInt(endSync - startSync);
      const estimatedServerTimeAtEnd = (serverTimeMs ?? BigInt(endSync)) + (rtt / 2n);
      mrrClockOffset = estimatedServerTimeAtEnd - BigInt(endSync);
      mrrClockSynced = true;
      if (!serverTimeMs) {
        console.warn('[mrr:clock] Could not sync with MRR. Using local clock.');
      } else if (Math.abs(Number(mrrClockOffset)) > 1000) {
        console.info(`[mrr:clock] Significant drift detected! Offset: ${mrrClockOffset}ms. (RTT: ${rtt}ms)`);
      } else {
        console.info(`[mrr:clock] Synced with MRR. Offset: ${mrrClockOffset}ms.`);
      }
    } catch (err) {
      console.warn(`[mrr:clock] MRR time sync failed: ${err.message}. Using local clock.`);
    } finally {
      mrrSyncPromise = null;
    }
  })();
  return mrrSyncPromise;
}

function getFallbackRealAccount() {
  return Object.keys(mrrConfigs).find(k => !isAggregate(k) && mrrConfigs[k].apiKey && mrrConfigs[k].apiSecret) || 'BT';
}

export function resolveMrrClient(clientNameRaw) {
  let clientName = String(clientNameRaw || defaultMrrClient).trim().toUpperCase();
  if (isAggregate(clientName)) {
    clientName = isAggregate(defaultMrrClient) ? getFallbackRealAccount() : defaultMrrClient;
  }
  if (!mrrInstances.has(clientName)) {
    let config = mrrConfigs[clientName];
    const envKey = process.env[`MRR_KEY_RIG_${clientName}`] || process.env[`MRR_API_KEY_${clientName}`];
    const envSecret = process.env[`MRR_SECRET_RIG_${clientName}`] || process.env[`MRR_API_SECRET_${clientName}`];
    if (envKey && envSecret) {
      config = { apiKey: normalizeCredential(envKey), apiSecret: normalizeCredential(envSecret) };
    }
    if (config?.apiKey && config?.apiSecret) {
      mrrInstances.set(clientName, config);
    }
  }
  const clientConfig = mrrInstances.get(clientName);
  if (!clientConfig) {
    const err = new Error(`MRR credentials missing for client "${clientName}".`);
    err.statusCode = 400;
    throw err;
  }
  return { clientName, clientConfig };
}

export async function runMrrCallInOrder(clientName, task) {
  const previous = mrrQueueByClient.get(clientName) || Promise.resolve();
  const current = previous.catch(() => undefined).then(task);
  mrrQueueByClient.set(clientName, current);
  try {
    return await current;
  } finally {
    if (mrrQueueByClient.get(clientName) === current) {
      mrrQueueByClient.delete(clientName);
    }
  }
}

// ============================================
// DATABASE HELPERS
// ============================================
async function saveRigEndpointToDb(endpoint, client) {
  try {
    const db = await getDb();
    const ts = new Date().toISOString();
    await db.run(`CREATE TABLE IF NOT EXISTS mrr_rig_logs (timestamp TEXT, client TEXT, endpoint TEXT)`);
    await db.run(`INSERT INTO mrr_rig_logs (timestamp, client, endpoint) VALUES (?, ?, ?)`, [ts, client, endpoint]);
  } catch (err) {
    if (err) console.error(`[mrr:db] Error saving to mrr_rig_logs: ${err.message}`);
  }
}

// ============================================
// MRR API CALL
// ============================================
export async function mrrApiCall({ endpoint, method = 'GET', query, body, clientNameRaw }) {
  const requestMethod = String(method || 'GET').toUpperCase();
  const isCacheable = requestMethod === 'GET';
  const { clientName, clientConfig } = resolveMrrClient(clientNameRaw);
  const apiKey = clientConfig?.apiKey;
  const { client: _c, ts: _t, endpoint: _e, ...cleanQuery } = query || {};
  const cacheKey = `${apiKey || clientName}:${requestMethod}:${endpoint}:${JSON.stringify(cleanQuery)}:${JSON.stringify(body || {})}`;

  if (isCacheable && !endpoint.includes('/rental/')) {
    const simpleCacheKey = `${apiKey || clientName}:${endpoint}:${JSON.stringify(cleanQuery)}`;
    const cached = mrrGetCache.get(simpleCacheKey);
    if (cached && Date.now() - cached.ts < MRR_GET_CACHE_TTL) {
      return cached.data;
    }
  }

  if (isCacheable && !endpoint.includes('/rental/')) {
    const cached = mrrRequestCache.get(cacheKey);
    if (cached && Date.now() < cached.expires) return cached.data;
    const inflight = mrrInflight.get(cacheKey);
    if (inflight) return inflight;
  }

  const task = (async () => {
    const trackingBase = endpoint.split('\n')[0].trim();
    const trackingEndpoint = trackingBase
      .replace(/\/(rig|rental)\/[^/]+\/pool/, '/$1/:id/pool')
      .replace(/\/(rig|rental)\/[0-9;]+$/, '/$1/:id')
      .replace(/\/(rig|rental)\/[0-9;]+\/info$/, '/$1/:id/info');

    if (!mrrInitTracker.has(trackingEndpoint)) {
      console.log(`[MRR] First-time endpoint delay (3s): ${trackingEndpoint}`);
      await new Promise(r => setTimeout(r, 3000));
      mrrInitTracker.add(trackingEndpoint);
    }

    if (!mrrClockSynced) {
      await syncMrrClock();
    }

    const lockKey = apiKey || clientName;

    return runMrrCallInOrder(lockKey, async () => {
      const normalizedPath = sanitizeMrrEndpoint(endpoint);
      const hasBody = body !== undefined && body !== null && requestMethod !== 'GET' && requestMethod !== 'DELETE';
      const baseUrl = new URL(`https://www.miningrigrentals.com/api/v2${normalizedPath}`);
      const sigEndpoint = normalizedPath;
      if (Object.keys(cleanQuery).length > 0) {
        for (const [key, value] of Object.entries(cleanQuery)) {
          if (value === undefined || value === null || value === '') continue;
          baseUrl.searchParams.set(key, String(value));
        }
      }

      const send = async (nStr, sig, authHeaders = {}) => fetch(baseUrl.toString(), {
        method: requestMethod,
        headers: {
          'user-agent': USER_AGENT,
          'accept': 'application/json',
          'cache-control': 'no-store, no-cache, must-revalidate',
          ...authHeaders,
          ...(hasBody ? { 'content-type': 'application/json' } : {}),
        },
        ...(hasBody ? { body: JSON.stringify(body) } : {}),
      });

      let currentNonce = nextMrrNonce(clientConfig.apiKey, clientName);
      const signString = `${clientConfig.apiKey}${currentNonce}${sigEndpoint}`;
      const signatureV2 = createHmac('sha1', clientConfig.apiSecret).update(signString).digest('hex');

      let response = await send(currentNonce, signatureV2, {
        'x-api-key': clientConfig.apiKey,
        'x-api-nonce': currentNonce,
        'x-api-sign': signatureV2,
      });

      let text, data;
      try {
        text = await response.text();
        try {
          data = text ? JSON.parse(text) : { success: false, message: 'Empty response from MRR' };
        } catch (parseError) {
          data = { success: false, message: `MRR returned non-JSON response: ${text.slice(0, 150)}...` };
        }
      } catch (e) {
        const errorMessage = e.message.includes('fetch failed') ? 'Connection to MRR API failed. The service may be down.' : `Network or parsing error: ${e.message}`;
        console.error(`[mrr:${clientName}] Critical fetch/parse error:`, errorMessage);
        return { statusCode: 503, data: { success: false, message: errorMessage, error: 'ServiceUnavailable' }, clientName };
      }

      let authMessage = String(data?.data?.message || data?.message || '');
      let isAuthFailureMessage = /signature|unauthorized|authenticated|invalid key|missing api key/i.test(authMessage);
      const isBadNonce = /nonce/i.test(authMessage);

      if (isBadNonce || (response.status === 401 && /nonce/i.test(authMessage))) {
        await syncMrrClock(true);
        const nowNano = (BigInt(Date.now()) + mrrClockOffset + 2000n) * 1000000n;
        const failedNonce = BigInt(currentNonce);
        const isSignificantFuture = failedNonce > (nowNano + 60000000000n);
        const jumpSize = isSignificantFuture ? MRR_NONCE_RECOVERY_JUMP_LARGE : MRR_NONCE_RECOVERY_JUMP_SMALL;
        const baseForJump = failedNonce > nowNano ? failedNonce : nowNano;
        const newJumpedNonce = baseForJump + jumpSize;
        console.warn(`[mrr:${clientName}] ☢️ NUCLEAR JUMP: Baseline reset to ${newJumpedNonce} (${isSignificantFuture ? '+1h' : '+1m'}) for key ${clientConfig.apiKey.slice(0, 6)}...`);
        mrrLastNonceByClient.set(clientConfig.apiKey, newJumpedNonce);
        const db = await getDb();
        await db.run('INSERT OR REPLACE INTO mrr_nonces (client, last_nonce) VALUES (?, ?)', [clientConfig.apiKey, newJumpedNonce.toString()]);
        currentNonce = nextMrrNonce(clientConfig.apiKey, clientName);
        const retrySignString = `${clientConfig.apiKey}${currentNonce}${sigEndpoint}`;
        const retrySig = createHmac('sha1', clientConfig.apiSecret).update(retrySignString).digest('hex');
        const retryRes = await send(currentNonce, retrySig, {
          'x-api-key': clientConfig.apiKey,
          'x-api-nonce': currentNonce,
          'x-api-sign': retrySig,
        });
        const retryText = await retryRes.text();
        try {
          data = JSON.parse(retryText);
          if (data.success) {
            return { statusCode: 200, data, clientName };
          }
          const secondMsg = String(data?.data?.message || data?.message || '');
          if (retryRes.status === 401) {
            console.error(`[mrr:${clientName}] Permanent Auth failure for key ${clientConfig.apiKey.slice(0, 6)}... - Check if API Key/Secret are valid.`);
            return { statusCode: 401, data: { ...data, message: "Invalid Credentials (checked via Nonce Reset)" }, clientName };
          }
        } catch (e) {
          return { statusCode: retryRes.status, data: { success: false, message: "Recovery failed" }, clientName };
        }
      }

      const shouldRetry = (!data.success && isAuthFailureMessage && !isBadNonce) || response.status === 401;
      if (shouldRetry && !isBadNonce) {
        console.warn(`[mrr:${clientName}] HMAC failed (${authMessage || 'Unauthorized'}), retrying with Legacy SHA1 Concatenation...`);
        currentNonce = nextMrrNonce(clientConfig.apiKey, clientName);
        const legacyStr = `${clientConfig.apiKey}${currentNonce}${normalizedPath}${clientConfig.apiSecret}`;
        const legacySig = createHash('sha1').update(legacyStr).digest('hex');
        const retryRes = await send(currentNonce, legacySig, {
          'X-Api-Key': clientConfig.apiKey,
          'X-Api-Nonce': currentNonce,
          'X-Api-Sign': legacySig,
        });
        const retryText = await retryRes.text();
        try {
          data = JSON.parse(retryText);
          response = retryRes;
          authMessage = String(data?.data?.message || data?.message || '');
          isAuthFailureMessage = /signature|unauthorized|authenticated|invalid/i.test(authMessage);
        } catch (e) { /* keep original */ }
      }

      let finalStatus = response.status;
      if ((data?.success === false || isAuthFailureMessage) && finalStatus < 400) {
        finalStatus = 401;
      }

      const isFrequentScan = normalizedPath.includes('/pool') || normalizedPath.includes('/rig/');
      if (!isFrequentScan || process.env.DEBUG_MRR === 'true') {
        const logTime = new Date().toLocaleTimeString();
        console.log(`[${logTime}] [mrr:${clientName}] endpoint=${normalizedPath} nonce=${currentNonce} status=${finalStatus} msg=${authMessage || 'OK'}`);
      }

      if (finalStatus === 200 && normalizedPath.startsWith('/rig/')) {
        saveRigEndpointToDb(normalizedPath, clientName);
      }

      // A MRR 401 indicates an upstream API-key/signature problem, not a
      // failed browser session. Do not make the frontend log out globally.
      const responseStatus = finalStatus === 401 ? 502 : finalStatus;
      if (responseStatus === 502 && data && typeof data === 'object') {
        data.upstream = 'mrr';
        data.upstreamStatus = finalStatus;
      }
      return { statusCode: responseStatus, data, clientName };
    });
  })();

  if (isCacheable) {
    mrrInflight.set(cacheKey, task);
  }

  try {
    const result = await task;
    if (isCacheable && result.statusCode === 200 && result.data?.success) {
      const ttl = (endpoint.includes('/info/') || endpoint.includes('/algos')) 
        ? MRR_CACHE_TTL_STABLE 
        : MRR_CACHE_TTL_DEFAULT;
      mrrRequestCache.set(cacheKey, { data: result, expires: Date.now() + ttl });
      const simpleCacheKey = `${apiKey || clientName}:${endpoint}:${JSON.stringify(cleanQuery)}`;
      mrrGetCache.set(simpleCacheKey, { data: result, ts: Date.now() });
    }
    return result;
  } finally {
    if (isCacheable) {
      mrrInflight.delete(cacheKey);
    }
  }
}

// ============================================
// MRR REQUEST WRAPPER
// ============================================
export async function mrrRequest(endpoint, req, res, method = 'GET', body = undefined) {
  const { client: clientQuery, endpoint: _internalPath, ts: _ts, ...forwardQuery } = req.query || {};
  const db = await getDb();
  const targetClient = isAggregate(clientQuery) ? defaultMrrClient : clientQuery;
  const { statusCode, data, clientName } = await mrrApiCall({
    endpoint,
    method,
    clientNameRaw: targetClient,
    query: forwardQuery,
    body,
  });
  res.set('X-MRR-Client', clientName);
  res.status(statusCode).json(data);
}

// ============================================
// FETCH AGGREGATED RENTALS - UPGRADED
// ============================================
export async function fetchAggregatedRentals(query = {}, clientParam = 'BT') {
  const db = await getDb();
  const isAll = isAggregate(clientParam);
  const allClientNames = isAll
    ? Object.keys(mrrConfigs).filter(c => mrrConfigs[c].apiKey && mrrConfigs[c].apiSecret && !isAggregate(c))
    : [clientParam];

  const allRentals = [];
  const errors = [];
  const { ts: _t, client: _c, ...mrrQuery } = query || {};
  const shouldFilterCurrent = !mrrQuery.history && !mrrQuery.includeInactive && !mrrQuery.all;

  const parseRentalTime = (value) => {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    const raw = String(value);
    const normalized = raw.endsWith('UTC') || raw.endsWith('Z') || raw.includes('+') ? raw : `${raw} UTC`;
    const ts = new Date(normalized).getTime();
    return Number.isFinite(ts) ? ts : 0;
  };

  const isCurrentRental = (rental) => {
    const statusRaw = rental?.status;
    const status = String(typeof statusRaw === 'object' ? statusRaw.status : statusRaw || '').toLowerCase();
    const rentedFlag = Boolean(statusRaw?.rented || rental?.rented);
    const endTs = parseRentalTime(rental?.end || rental?.end_time || rental?.endTime || statusRaw?.end);
    return (endTs > Date.now()) || rentedFlag || status.includes('rented') || status.includes('active') || status.includes('running');
  };

  const fetchSingleAccount = async (clientName) => {
    const localRentals = [];
    const requestedType = String(mrrQuery.type || '').trim().toLowerCase();
    const typesToFetch = requestedType
      ? [requestedType]
      : ((mrrQuery.history || mrrQuery.includeBought || mrrQuery.all) ? ['bought', 'sold'] : ['sold']);
    
    for (const type of typesToFetch) {
      const { data, statusCode } = await mrrApiCall({ 
        endpoint: '/rental', 
        method: 'GET', 
        clientNameRaw: clientName, 
        query: { ...mrrQuery, type } 
      });
      if (statusCode === 200 && data.success) {
        const list = Array.isArray(data.data) ? data.data : (data.data?.rentals || []);
        const filtered = list.filter(r => {
          if (isGhostRental(r)) {
            if (r.id && String(r.id) !== 'false' && String(r.id) !== 'null') {
              markGhostRental(r.id);
            }
            return false;
          }
          return r && r.id;
        });
        localRentals.push(...filtered);
      }
    }

    if (localRentals.length === 0) return [];
    const uniqueListRaw = Array.from(new Map(localRentals.map(r => [String(r.id), r])).values());
    const uniqueList = shouldFilterCurrent ? uniqueListRaw.filter(isCurrentRental) : uniqueListRaw;
    if (uniqueList.length === 0) return [];
    uniqueList.forEach(r => r.mrrClient = clientName);
    const rentalIds = uniqueList
      .map(r => r.id)
      .filter(id => id && id !== 'false' && id !== 'null' && id !== 'undefined' && !ghostRentalIds.has(String(id)));
    if (rentalIds.length === 0) {
      return uniqueList.filter(r => !ghostRentalIds.has(String(r.id)));
    }

    const chunkSize = 50;
    const rentalIdsChunks = [];
    for (let i = 0; i < rentalIds.length; i += chunkSize) {
      rentalIdsChunks.push(rentalIds.slice(i, i + chunkSize));
    }

    const poolMap = new Map();
    for (const chunk of rentalIdsChunks) {
      const rentalIdsStr = chunk.join(';');
      try {
        const { data: poolsData, statusCode } = await mrrApiCall({ 
          endpoint: `/rental/${rentalIdsStr}/pool`, 
          clientNameRaw: clientName 
        });
        if (statusCode === 200 && poolsData?.success) {
          const poolItems = Array.isArray(poolsData.data) 
            ? poolsData.data 
            : (Array.isArray(poolsData.data?.result) ? poolsData.data.result : []);
          poolItems.forEach(item => {
            const key = String(item.rigid || item.id || item.rentalid || item.rental_id);
            poolMap.set(key, item.pools || []);
          });
        } else if (statusCode >= 400) {
          for (const rentalId of chunk) {
            try {
              const { data: singlePoolData, statusCode: singleStatusCode } = await mrrApiCall({ endpoint: `/rental/${rentalId}/pool`, clientNameRaw: clientName });
              if (singleStatusCode === 200 && singlePoolData?.success) {
                const singlePoolItems = Array.isArray(singlePoolData.data) ? singlePoolData.data : (Array.isArray(singlePoolData.data?.result) ? singlePoolData.data.result : []);
                singlePoolItems.forEach(item => {
                  const key = String(item.rigid || item.id || item.rentalid || item.rental_id);
                  poolMap.set(key, item.pools || []);
                });
              } else {
                markGhostRental(rentalId);
              }
            } catch (individualError) {
              console.warn(`[mrr:${clientName}] Individual pool fetch failed for rental ${rentalId}: ${individualError.message}`);
              markGhostRental(rentalId);
            }
          }
        }
      } catch (error) {
        console.warn(`[mrr:${clientName}] Error fetching pools chunk: ${error.message}`);
      }
    }

    const validRentals = [];
    for (const r of uniqueList) {
      const id = String(r.id);
      if (ghostRentalIds.has(id)) continue;
      const pools = poolMap.get(id);
      if (pools && pools.length > 0) {
        const p0 = pools.find(p => p.priority === 0 || p.priority === '0') || pools[0];
        r.host = p0.host || p0.stratumHost;
        r.port = p0.port || p0.stratumPort;
        r.user = p0.user || p0.username;
        r.poolFound = true;
        try {
          await withSavepoint(db, `mrr_rig_pool_sync_${id}`, async () => {
            await db.run('DELETE FROM mrr_rig_pools WHERE rig_id = ?', [id]);
            const stmt = await db.prepare('INSERT INTO mrr_rig_pools (rig_id, priority, type, host, port, username, password) VALUES (?, ?, ?, ?, ?, ?, ?)');
            try {
              for (const pool of pools) {
                await stmt.run(id, pool.priority, pool.type, pool.host, pool.port, pool.user, pool.pass);
              }
            } finally {
              await stmt.finalize();
            }
          });
        } catch (e) {
          console.error(`[mrr:rigs] DB pool sync failed for rig ${id}: ${e.message}`);
        }
      } else {
        r.poolFound = false;
      }
      validRentals.push(r);
    }
    return validRentals;
  };

  const results = await Promise.all(allClientNames.map(async (clientName) => {
    try {
      const rentals = await fetchSingleAccount(clientName);
      return { rentals };
    } catch (err) {
      return { error: { client: clientName, message: err.message } };
    }
  }));

  let totalRentals = 0;
  results.forEach(res => {
    if (res.rentals) {
      allRentals.push(...res.rentals);
      totalRentals += res.rentals.length;
    }
    if (res.error) errors.push(res.error);
  });

  if (ghostRentalIds.size > 0) {
    const logTime = new Date().toLocaleTimeString();
    console.log(`[${logTime}] [mrr:fetch] Active ghost rentals: ${ghostRentalIds.size}`);
  }
  if (totalRentals > 0 || errors.length > 0) {
    const logTime = new Date().toLocaleTimeString();
    console.log(`[${logTime}] [mrr:fetch] Total rentals: ${totalRentals} (${errors.length} errors)`);
  }

  return {
    statusCode: 200,
    data: { 
      success: true, 
      data: { 
        rentals: allRentals,
        metadata: {
          ghostCount: ghostRentalIds.size,
          totalFetched: totalRentals + ghostRentalIds.size
        }
      }, 
      errors: errors.length > 0 ? errors : undefined,
      summary: {
        total: totalRentals,
        ghosts: ghostRentalIds.size,
        clients: allClientNames.length,
        errors: errors.length
      }
    },
    clientName: isAll ? 'ALL' : clientParam,
  };
}

// ---------- Default Router (mountable) ----------
const router = express.Router();

router.get('/rentals', async (req, res) => {
  try {
    const { client: clientParam, ...query } = req.query;
    const { statusCode, data, clientName } = await fetchAggregatedRentals(query, clientParam);
    res.set('X-MRR-Client', clientName);
    res.status(statusCode).json(data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/info/algos', async (req, res) => {
  try {
    const { statusCode, data, clientName } = await mrrApiCall({
      endpoint: '/info/algos',
      method: 'GET',
      clientNameRaw: defaultMrrClient,
    });
    res.set('X-MRR-Client', clientName);
    res.status(statusCode).json(data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ✅ NEW: MRR vs NiceHash comparison route (UPGRADED)
// ============================================
const compareCache = new Map();
const COMPARE_CACHE_TTL = 60000; // 1 minute

router.get('/compare', async (req, res) => {
  try {
    const mrrClient = req.query.client || 'BT';
    const nhClient = req.query.nhClient || 'ALL';
    const cacheKey = `${mrrClient}:${nhClient}`;
    const cached = compareCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < COMPARE_CACHE_TTL) {
      return res.json(cached.data);
    }

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

    // 2. Resolve NiceHash client(s) for price fetching
    const nhClientsToTry = [];
    if (isAggregate(nhClient)) {
      const allNhClients = Object.keys(nhConfigs || {}).filter(k => nhConfigs[k].apiKey && !isAggregate(k));
      for (const name of allNhClients) {
        try {
          const { client } = resolveNhClient(name);
          if (client) nhClientsToTry.push({ client, name });
        } catch (e) { /* ignore clients without credentials */ }
      }
    } else {
      try {
        const { client, clientName } = resolveNhClient(nhClient);
        if (client) nhClientsToTry.push({ client, name: clientName });
      } catch (e) { /* ignore */ }
    }

    if (nhClientsToTry.length === 0) {
      return res.status(400).json({ success: false, error: `No valid NiceHash client(s) for "${nhClient}"` });
    }

    // 3. For each rig, get the MRR price and the NiceHash price for the same algorithm
    const results = await Promise.all(
      rigs.map(async (rig) => {
        const mrrAlgo = rig.algo || rig.algorithm || rig.type;
        const nicehashAlgo = normalizeAlgoForNiceHash(mrrAlgo);
        let nicehashPrice = null;

        if (nicehashAlgo && nicehashAlgo !== 'UNKNOWN') {
          // Try each NiceHash client until we get a price
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
            } catch (e) { /* ignore, try next client */ }
          }

          // Fallback via order book if still no price
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

    // 4. Filter out rigs without a valid MRR price (optional)
    const filteredResults = results.filter(r => r.mrrRig.price && parseFloat(r.mrrRig.price) > 0);

    const responseData = {
      success: true,
      data: filteredResults,
      meta: {
        mrrClient,
        nhClient: isAggregate(nhClient) ? 'ALL' : nhClient,
        totalRigs: rigs.length,
        matched: filteredResults.length,
        withNiceHashPrice: filteredResults.filter(r => r.nicehashPrice).length
      }
    };

    compareCache.set(cacheKey, { data: responseData, ts: Date.now() });
    res.json(responseData);
  } catch (error) {
    console.error('[MRR Compare] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ✅ NEW: Direct NiceHash price lookup (aggregated)
// ============================================
router.get('/nicehash/price', async (req, res) => {
  try {
    const algorithm = req.query.algorithm;
    const market = req.query.market || 'USA';
    if (!algorithm) {
      return res.status(400).json({ success: false, error: 'Missing "algorithm" parameter' });
    }

    const nhAlgo = normalizeAlgoForNiceHash(algorithm);
    if (!nhAlgo || nhAlgo === 'UNKNOWN') {
      return res.status(400).json({ success: false, error: `Unsupported algorithm: ${algorithm}` });
    }

    // Get all configured NiceHash clients
    const allNhClients = Object.keys(nhConfigs || {}).filter(k => nhConfigs[k].apiKey && !isAggregate(k));
    if (allNhClients.length === 0) {
      return res.status(400).json({ success: false, error: 'No NiceHash clients configured' });
    }

    let bestPrice = null;
    let bestSource = null;

    for (const clientName of allNhClients) {
      try {
        const { client } = resolveNhClient(clientName);
        if (!client) continue;
        const app = getNiceHashApp(client);
        const priceResult = await app.hashpower.getOrderPrice({
          algorithm: nhAlgo,
          market: market,
          amount: '0.01'
        });
        if (priceResult && priceResult.price) {
          const price = parseFloat(priceResult.price);
          if (bestPrice === null || price > bestPrice) {
            bestPrice = price;
            bestSource = {
              client: clientName,
              speedUnit: priceResult.speedUnit || getNiceHashUnit(nhAlgo) || 'TH',
              fixedPrice: price.toFixed(8)
            };
          }
        }
      } catch (e) {
        // ignore, try next client
      }
    }

    if (bestPrice === null) {
      // Fallback: order book from first client
      try {
        const firstClient = allNhClients[0];
        const { client } = resolveNhClient(firstClient);
        if (client) {
          const app = getNiceHashApp(client);
          const orderBook = await app.hashpower.getOrderBook({ algorithm: nhAlgo, market: market });
          const buyOrders = orderBook?.buy || [];
          if (buyOrders.length > 0) {
            const best = Math.max(...buyOrders.map(o => parseFloat(o.price || 0)).filter(p => p > 0));
            if (best > 0) {
              bestPrice = best;
              bestSource = {
                client: firstClient,
                speedUnit: getNiceHashUnit(nhAlgo) || 'TH',
                fixedPrice: best.toFixed(8),
                source: 'order-book'
              };
            }
          }
        }
      } catch (e2) { /* ignore */ }
    }

    if (bestPrice === null) {
      return res.status(404).json({ success: false, error: `No price found for ${algorithm} in ${market}` });
    }

    res.json({
      success: true,
      algorithm: nhAlgo,
      market: market,
      price: bestPrice,
      unit: bestSource.speedUnit,
      source: bestSource.source || 'order-calculate',
      client: bestSource.client,
      fixedPrice: bestSource.fixedPrice
    });
  } catch (error) {
    console.error('[NiceHash Price] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
