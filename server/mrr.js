// server/mrr.js - COMPLETE UPGRADED VERSION
// Fixes: Ghost rental spam, batch processing, reduced logging, better performance, caching

import fs from 'fs/promises';
import path from 'path';
import express from 'express';
import { createHash, createHmac } from 'node:crypto';
import { getDb } from './db.js';
import { normalizeCredential, sanitizeMrrEndpoint } from './utils.js';
import { isAggregate, resolveNhClient, getNiceHashApp } from './nh.js';

// ============================================
// STATE MANAGEMENT
// ============================================
const mrrLastNonceByClient = new Map();
const mrrInitTracker = new Set();
let mrrClockOffset = 0n;
let mrrClockSynced = false;
let mrrSyncPromise = null;

export let mrrConfigs = {}; // Declare as mutable
export let defaultMrrClient = 'BT'; // Declare as mutable

const mrrQueueByClient = new Map(); // Serialized queue storage to prevent parallel nonce usage
const MRR_GLOBAL_COUNTER_KEY = '__mrrGlobalCounter';
let mrrGlobalCounter = 0n; // Global monotonic counter for nonce generation fallback
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
const MRR_CACHE_TTL_DEFAULT = 10000; // 10 seconds cache
const MRR_CACHE_TTL_STABLE = 300000; // 5 minutes for stable info/algos
const MRR_GET_CACHE_TTL = 60000; // 60 seconds for GET requests

// ✅ FIX: Add mrrGetCache declaration and export it for monitor consumers
export const mrrGetCache = new Map();

const MRR_NONCE_RECOVERY_JUMP_SMALL = 60000000000n; // 1 minute
const MRR_NONCE_RECOVERY_JUMP_LARGE = 3600000000000n; // 1 hour

const USER_AGENT = 'Ben Tre Mining Tool/2.0';

const mrrInstances = new Map();

// ============================================
// LOGGING WITH RATE LIMITING
// ============================================
const logCooldown = new Map();
const LOG_COOLDOWN_MS = 5000; // 5 seconds cooldown for repeated logs

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

const ghostRentalIds = new Set(); // Track ghost rental IDs
const GHOST_RENTAL_CACHE_TTL = 3600000; // 1 hour

// Function to check if a rental is a ghost
function isGhostRental(rental) {
  if (!rental) return true;
  
  const id = String(rental.id || '');
  // Check for invalid IDs
  if (!id || id === 'false' || id === 'null' || id === 'undefined' || id === '0') {
    return true;
  }
  
  // Check if already marked as ghost
  if (ghostRentalIds.has(id)) {
    return true;
  }
  
  // Check for missing essential data
  if (!rental.rigid && !rental.rig && !rental.status && !rental.rented) {
    return true;
  }
  
  return false;
}

// Function to mark a rental as ghost
export function markGhostRental(rentalId) {
  const id = String(rentalId);
  if (id && id !== 'false' && id !== 'null' && id !== 'undefined') {
    ghostRentalIds.add(id);
    // Auto-cleanup after TTL
    setTimeout(() => {
      ghostRentalIds.delete(id);
    }, GHOST_RENTAL_CACHE_TTL);
  }
}

// Function to clear ghost rentals
function clearGhostRentals() {
  ghostRentalIds.clear();
}

// ============================================
// CONFIGURATION
// ============================================
export function initMrrConfigs(env) {
  mrrConfigs = {};

  // Discover additional accounts from environment variables
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
    defaultMrrClient = 'BT'; // Fallback if no clients are configured
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
        } catch (e) {
          // Ignore BigInt parsing errors for invalid data
        }
      });
    }
  } catch (e) {
    // The table might not exist on the first run, which is fine.
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
    console.warn(`[mrr:${clientLabel}] Nonce overflow (Uint64). Resetting baseline.`);
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
    } catch (e) { /* ignore db errors in this fire-and-forget promise */ }
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
      } catch {
        return null;
      }
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

/**
 * Generates a strictly increasing nonce for a specific API Key.
 * Keying by API Key prevents collisions if multiple client names share the same credentials.
 */
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

  // ✅ Check simple GET cache
  if (isCacheable && !endpoint.includes('/rental/')) {
    const simpleCacheKey = `${apiKey || clientName}:${endpoint}:${JSON.stringify(cleanQuery)}`;
    const cached = mrrGetCache.get(simpleCacheKey);
    if (cached && Date.now() - cached.ts < MRR_GET_CACHE_TTL) {
      return cached.data;
    }
  }

  // Existing inflight / request cache
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
        // Attempt to parse JSON, but fall back to a structured error if it fails
    try {
          data = text ? JSON.parse(text) : { success: false, message: 'Empty response from MRR' };
        } catch (parseError) {
          // Handle cases where MRR returns non-JSON error pages (e.g., Cloudflare blocks)
          data = { success: false, message: `MRR returned non-JSON response: ${text.slice(0, 150)}...` };
        }
      } catch (e) {
        // This block handles network errors (like connection refused) or if the response isn't valid JSON.
        const errorMessage = e.message.includes('fetch failed') ? 'Connection to MRR API failed. The service may be down.' : `Network or parsing error: ${e.message}`;
        console.error(`[mrr:${clientName}] Critical fetch/parse error:`, errorMessage);
        return { statusCode: 503, data: { success: false, message: errorMessage, error: 'ServiceUnavailable' }, clientName };
    }

      let authMessage = String(data?.data?.message || data?.message || '');
      let isAuthFailureMessage = /signature|unauthorized|authenticated|invalid key|missing api key/i.test(authMessage);
      const isBadNonce = /nonce/i.test(authMessage);

      // Nuclear Jump for bad nonce
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
        db.run('INSERT OR REPLACE INTO mrr_nonces (client, last_nonce) VALUES (?, ?)', [clientConfig.apiKey, newJumpedNonce.toString()]);

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
        } catch (e) {
          // keep original response
        }
      }

      let finalStatus = response.status;
      if ((data?.success === false || isAuthFailureMessage) && finalStatus < 400) {
        finalStatus = 401;
      }

      // Only log endpoint calls that are not the frequent pool scans
      const isFrequentScan = normalizedPath.includes('/pool') || normalizedPath.includes('/rig/');
      if (!isFrequentScan || process.env.DEBUG_MRR === 'true') {
        const logTime = new Date().toLocaleTimeString();
        console.log(`[${logTime}] [mrr:${clientName}] endpoint=${normalizedPath} nonce=${currentNonce} status=${finalStatus} msg=${authMessage || 'OK'}`);
      }

      if (finalStatus === 200 && normalizedPath.startsWith('/rig/')) {
        saveRigEndpointToDb(normalizedPath, clientName);
      }

      return { statusCode: finalStatus, data, clientName };
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

      // ✅ Also store in simple GET cache
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
        // Filter out ghost rentals
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

    if (localRentals.length === 0) {
      return [];
    }
    
    // Deduplicate
    const uniqueListRaw = Array.from(new Map(localRentals.map(r => [String(r.id), r])).values());
    const uniqueList = shouldFilterCurrent ? uniqueListRaw.filter(isCurrentRental) : uniqueListRaw;
    
    if (uniqueList.length === 0) {
      return [];
    }
    
    // Add client name to each rental
    uniqueList.forEach(r => r.mrrClient = clientName);
    
    // Filter out falsy rental IDs and ghosts before fetching pools
    const rentalIds = uniqueList
      .map(r => r.id)
      .filter(id => id && id !== 'false' && id !== 'null' && id !== 'undefined' && !ghostRentalIds.has(String(id)));
    
    if (rentalIds.length === 0) {
      console.log(`[mrr:${clientName}] No valid rental IDs after filtering ghosts`);
      return uniqueList.filter(r => !ghostRentalIds.has(String(r.id)));
    }
    
    // Fetch pools in chunks to handle large numbers of rentals
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
          // If the chunk fails, try each rental individually. This is more robust than marking all as ghosts.
          console.warn(`[mrr:${clientName}] Pool chunk failed with status ${statusCode}, retrying individually for ${chunk.length} rentals...`);
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

    // Add pool data and filter out ghosts
    const validRentals = [];
      uniqueList.forEach(r => {
      const id = String(r.id);
      
      // Skip if marked as ghost
      if (ghostRentalIds.has(id)) {
        return;
      }
      
      const pools = poolMap.get(id);
        if (pools && pools.length > 0) {
          const p0 = pools.find(p => p.priority === 0 || p.priority === '0') || pools[0];
          r.host = p0.host || p0.stratumHost;
          r.port = p0.port || p0.stratumPort;
          r.user = p0.user || p0.username;
        r.poolFound = true;
      } else {
        r.poolFound = false;
        }
      
      validRentals.push(r);
      });
    
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

  // Log ghost rental summary
  if (ghostRentalIds.size > 0) {
    const logTime = new Date().toLocaleTimeString();
    console.log(`[${logTime}] [mrr:fetch] Active ghost rentals: ${ghostRentalIds.size}`);
  }

  // Only log summary (not individual rentals)
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
    // This is a public endpoint, but we'll use a default client for consistency.
    const { statusCode, data, clientName } = await mrrApiCall({
      endpoint: '/info/algos',
      method: 'GET',
      clientNameRaw: defaultMrrClient, // Use default client for public calls
    });
    res.set('X-MRR-Client', clientName);
    res.status(statusCode).json(data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
