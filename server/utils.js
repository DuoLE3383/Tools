// utils.js - Complete fixed version with proper current hashrate extraction

import { logger } from './logger.js';

export const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(err => {
    logger.error(`[api:error] ${req.method} ${req.originalUrl}`, err);
    const status = err.statusCode || 500;

    if (status === 429 && err.headers) {
      if (err.headers['retry-after']) res.set('Retry-After', err.headers['retry-after']);
      if (err.headers['x-ratelimit-limit']) res.set('X-RateLimit-Limit', err.headers['x-ratelimit-limit']);
    }

    res.status(status).json({ error: err.message });
  });
};

const SENSITIVE_KEYS = new Set(['password', 'apiKey', 'apiSecret', 'secret', 'token']);

export function maskSensitive(value) {
  if (Array.isArray(value)) return value.map(maskSensitive);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEYS.has(key) ? '<masked>' : maskSensitive(item),
    ]),
  );
}

export function corsMiddleware(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
  res.setHeader('Access-Control-Expose-Headers', 'X-MRR-Client, Retry-After, X-RateLimit-Limit');

  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}

export function logRequestMiddleware(req, res, next) {
  const start = Date.now();
  const clientTag = String(req.query.client || req.body?.client || 'system').toUpperCase();
  const time = new Date().toLocaleTimeString();
  const body = req.method === 'GET' ? '' : ` body=${JSON.stringify(maskSensitive(req.body || {}))}`;

  logger.info(`[${time}] [api:${clientTag}] -> ${req.method} ${req.originalUrl}${body}`);

  res.on('finish', () => {
    logger.info(`[${time}] [api:${clientTag}] <- ${res.statusCode} ${req.method} ${req.originalUrl} ${Date.now() - start}ms`);
  });

  next();
}

export function normalizeCredential(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return raw.replace(/^['"]|['"]$/g, '').trim();
}

export function extractAlgorithmItems(payload, candidateKeys = []) {
  if (!payload || typeof payload !== 'object') return [];

  for (const key of candidateKeys) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const nestedKey of candidateKeys) {
        if (Array.isArray(value[nestedKey])) return value[nestedKey];
      }
    }
  }

  const visited = new WeakSet();
  const queue = [payload];

  while (queue.length) {
    const node = queue.shift();
    if (!node || typeof node !== 'object' || visited.has(node)) continue;
    visited.add(node);

    if (Array.isArray(node)) {
      if (node.every(item => typeof item === 'object' && (item.algo || item.algorithm || item.name))) {
        return node;
      }
      for (const item of node) {
        if (item && typeof item === 'object') queue.push(item);
      }
    } else {
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) {
          if (value.every(item => typeof item === 'object' && (item.algo || item.algorithm || item.name))) {
            return value;
          }
          for (const item of value) {
            if (item && typeof item === 'object') queue.push(item);
          }
        } else if (value && typeof value === 'object') {
          queue.push(value);
        }
      }
    }
  }
  return [];
}

export function sanitizeMrrEndpoint(rawEndpoint) {
  const value = String(rawEndpoint || '').trim();
  if (!value) {
    const err = new Error('MRR endpoint is required.');
    err.statusCode = 400;
    throw err;
  }

  const normalized = value.startsWith('/') ? value : `/${value}`;
  return normalized.replace(/\/+$|\/+$/, '') || '/';
}

// ============================================================
// HELPER: Format hashrate for display with proper unit detection
// ============================================================
function formatHashrateForDisplay(value, suffix) {
  const num = Number.parseFloat(value || 0);
  if (!Number.isFinite(num) || num <= 0) return '0 H/s';
  
  // If suffix is provided and valid, use it
  if (suffix && suffix !== 'H/s' && suffix !== 'H') {
    let cleanSuffix = suffix.replace(/\/s$/i, '').trim();
    if (!cleanSuffix.endsWith('/s')) {
      cleanSuffix = cleanSuffix + '/s';
    }
    return `${num.toFixed(2)} ${cleanSuffix}`;
  }
  
  // Auto-detect the correct unit based on the value
  const units = ['H/s', 'KH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s', 'EH/s', 'ZH/s'];
  let idx = 0;
  let scaled = num;
  
  while (scaled >= 1000 && idx < units.length - 1) {
    scaled /= 1000;
    idx += 1;
  }
  
  return `${scaled.toFixed(2)} ${units[idx]}`;
}

// ============================================================
// EXTRACT RENTAL INFO - COMPLETE FIX FOR CURRENT HASHRATE
// ============================================================
export function extractRentalInfo(rental, liveRig = null) {
  if (!rental) {
    logger.debug('[utils:extractRentalInfo] No rental provided');
    return {};
  }

  // Merge data
  const merged = { ...rental };
  if (liveRig) {
    merged.rig = { ...(rental.rig || {}), ...liveRig };
    if (liveRig.hashrate && typeof liveRig.hashrate === 'object') {
      merged.hashrate = { ...(rental.hashrate || {}), ...liveRig.hashrate };
    }
    if (liveRig.status && typeof liveRig.status === 'object') {
      merged.status = { ...(rental.status || {}), ...liveRig.status };
    }
  }

  // ============================================================
  // EXTRACT CURRENT HASHRATE - TRY EVERY POSSIBLE SOURCE
  // ============================================================
  const getFloat = (value) => {
    if (value === undefined || value === null) return 0;
    if (typeof value === 'object' && value !== null) {
      const nested = value.hash || value.rate || value.speed;
      return parseFloat(nested) || 0;
    }
    return parseFloat(value) || 0;
  };

  const findValue = (...candidates) => {
    for (const cand of candidates) {
      const val = getFloat(cand);
      if (val > 0) return val;
    }
    return 0;
  };

  const findSuffix = (...candidates) => {
    for (const cand of candidates) {
      if (typeof cand === 'string' && cand) return cand;
      if (typeof cand === 'object' && cand !== null) {
        const nested = cand.suffix || cand.unit || cand.type;
        if (typeof nested === 'string' && nested) return nested;
      }
    }
    return '';
  };

  const currentHash = findValue(
    liveRig?.hashrate,
    liveRig?.current_hashrate,
    liveRig?.speed,
    liveRig?.status?.hashrate,
    merged.hashrate?.current,
    merged.hashrate?.hash,
    merged.hashrate?.last_5min,
    merged.hashrate?.last_15min,
    merged.rig?.hashrate,
    merged.rig?.current_hashrate,
    merged.rig?.speed,
    merged.rig?.status?.hashrate,
    merged.status?.hashrate,
    merged.current_hashrate,
    merged.hashrate,
    merged.speed
  );

  const averageHash = findValue(
    merged.hashrate?.average,
    merged.rig?.hashrate?.average,
    merged.average_hashrate
  );

  const advertisedHash = findValue(
    merged.hashrate?.advertised,
    merged.rig?.hashrate?.advertised,
    merged.advertised_hashrate
  );

  let hashrateSuffix = findSuffix(
    liveRig?.hashrate_suffix,
    liveRig?.suffix,
    liveRig?.unit,
    liveRig?.hashrate,
    merged.hashrate?.suffix,
    merged.hashrate?.unit,
    merged.hashrate?.advertised,
    merged.rig?.hashrate_suffix,
    merged.rig?.suffix,
    merged.rig?.unit,
    merged.rig?.hashrate?.advertised
  );

  // ============================================================
  // FALLBACK: Use average as current if no current found
  // ============================================================
  const finalCurrentHash = currentHash > 0 ? currentHash : averageHash;

  // ============================================================
  // DETECT SUFFIX FROM VALUE MAGNITUDE IF NOT FOUND
  // ============================================================
  if (!hashrateSuffix || hashrateSuffix === 'H/s' || hashrateSuffix === 'H') {
    const maxVal = Math.max(finalCurrentHash, averageHash, advertisedHash);
    if (maxVal >= 1e12) hashrateSuffix = 'TH/s';
    else if (maxVal >= 1e9) hashrateSuffix = 'GH/s';
    else if (maxVal >= 1e6) hashrateSuffix = 'MH/s';
    else if (maxVal >= 1e3) hashrateSuffix = 'KH/s';
    else hashrateSuffix = 'H/s';
    logger.debug(`[extractRentalInfo] Auto-detected suffix: ${hashrateSuffix} from value ${maxVal}`);
  }

  // Clean suffix
  hashrateSuffix = hashrateSuffix.replace(/\/s$/i, '');
  if (!hashrateSuffix.endsWith('/s')) {
    hashrateSuffix = hashrateSuffix + '/s';
  }

  // ============================================================
  // FORMAT FOR DISPLAY
  // ============================================================
  const niceHashrate = finalCurrentHash > 0 
    ? `${finalCurrentHash.toFixed(2)} ${hashrateSuffix}` 
    : '0 H/s';
  const niceAverageHashrate = averageHash > 0 
    ? `${averageHash.toFixed(2)} ${hashrateSuffix}` 
    : '0 H/s';
  const niceAdvertisedHashrate = advertisedHash > 0 
    ? `${advertisedHash.toFixed(2)} ${hashrateSuffix}` 
    : '0 H/s';

  // Log final extracted values
  logger.debug(`[extractRentalInfo] FINAL - ${rental.id || 'N/A'}: Current: ${finalCurrentHash} ${hashrateSuffix}, Avg: ${averageHash}, Adv: ${advertisedHash}`);

  // Extract other info
  const algo = merged.algo || merged.algorithm || merged.miningAlgorithm || 
               merged.rig?.algo || merged.rig?.algorithm || merged.rig?.type || 
               merged.type || 'Unknown';
  const type = merged.price_type || merged.price?.type || merged.type || 'Day';
  const duration = merged.length || merged.hours || merged.rig?.hours || '0';
  const rigId = merged.rig?.id || merged.rigid || merged.rig_id || merged.rigId || 'N/A';
  
  let percent = 0;
  if (merged.percent !== undefined && merged.percent !== null) {
    percent = parseFloat(merged.percent);
  } else if (merged.efficiency !== undefined && merged.efficiency !== null) {
    percent = parseFloat(merged.efficiency);
  } else if (merged.hashrate?.average?.percent !== undefined) {
    percent = parseFloat(merged.hashrate.average.percent);
  } else if (merged.rig?.hashrate?.average?.percent !== undefined) {
    percent = parseFloat(merged.rig.hashrate.average.percent);
  }
  
  // Calculate percent if missing
  if (percent <= 0 && averageHash > 0 && advertisedHash > 0) {
    percent = (averageHash / advertisedHash) * 100;
  }
  if (percent <= 0 && finalCurrentHash > 0 && advertisedHash > 0) {
    percent = (finalCurrentHash / advertisedHash) * 100;
  }

  const priceObj = merged.price || merged.rig?.price || {};
  const currency = priceObj.currency || merged.currency || merged.price_unit || 'BTC';

  return {
    algo,
    type,
    duration,
    rigId,
    startTime: merged.start || merged.start_time || merged.rig?.status?.start || merged.rig?.start || '',
    endTime: merged.end || merged.end_time || merged.rig?.status?.end || merged.rig?.end || '',
    percent: Math.round(percent * 100) / 100, // Round to 2 decimal places
    hashrate: { 
      current: finalCurrentHash, 
      advertised: advertisedHash, 
      average: averageHash, 
      suffix: hashrateSuffix 
    },
    price: {
      paid: priceObj.paid || '0.00',
      advertised: priceObj.advertised || '0.00',
      currency
    },
    niceHashrate,
    niceAverageHashrate,
    niceAdvertisedHashrate,
  };
}

export function extractRigInfo(payload) {
  const queue = [payload];
  while (queue.length > 0) {
    const node = queue.shift();
    if (!node || typeof node !== 'object') continue;

    const miningAlgorithm = node.miningAlgorithm || node.algorithm || node.algo || '';
    const stratumHost = node.stratumHost || node.stratumHostname || node.host || '';
    const stratumPortRaw = node.stratumPort || node.port;
    const stratumPort = Number(stratumPortRaw);
    const username = node.username || node.user || '';
    const password = node.password || node.pass || '';

    if (miningAlgorithm && stratumHost && Number.isFinite(stratumPort) && username && password) {
      return { miningAlgorithm, stratumHost, stratumPort, username, password };
    }

    if (node.pools && Array.isArray(node.pools)) {
      for (const pool of node.pools) {
        const poolAlgo = pool.algo || pool.algorithm || '';
        const poolHost = pool.stratumHost || pool.host || '';
        const poolUser = pool.username || pool.user || '';
        const poolPass = pool.password || pool.pass || '';
        const poolPortFromHost = (poolHost.match(/:(\d+)$/) || [])[1];
        const poolPort = Number(pool.port || pool.stratumPort || poolPortFromHost || null);

        if (poolAlgo && poolHost && poolUser && poolPass && Number.isFinite(poolPort)) {
          return { miningAlgorithm: poolAlgo, stratumHost: poolHost, stratumPort: poolPort, username: poolUser, password: poolPass };
        }
      }
    }

    for (const value of Object.values(node)) {
      if (value && typeof value === 'object') queue.push(value);
    }
  }

  return { miningAlgorithm: '', stratumHost: '', stratumPort: null, username: '', password: '' };
}