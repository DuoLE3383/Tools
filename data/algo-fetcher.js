// ==========================
//  MRR ALGO FETCHER
//  Fetches and caches MRR algorithm data
// ==========================

import { db } from '../server/db.js';
import { mrrApiCall } from '../server/mrr.js';
import { dbRunAsync, dbAllAsync } from '../server/mrr/db-utils.js';

const ALGO_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
let memoryCache = null;
let lastFetchTime = 0;

/**
 * Fetches MRR algorithms from the API or cache and stores them in the database.
 * @param {boolean} force - If true, bypasses the cache and fetches fresh data.
 * @returns {Promise<Array>} A promise that resolves to the list of algorithms.
 */
export async function fetchAndStoreMrrAlgos(force = false) {
  const now = Date.now();

  // Use in-memory cache to avoid hitting the DB on every call within the TTL
  if (!force && memoryCache && (now - lastFetchTime < ALGO_CACHE_TTL)) {
    return memoryCache;
  }

  try {
    console.log('[mrr-algos] Fetching MRR algorithms from API...');
    const response = await mrrApiCall({ endpoint: '/info/algos' });

    if (!response?.success || !Array.isArray(response.data)) {
      throw new Error('Failed to fetch or invalid data format from MRR /info/algos endpoint.');
    }

    const algos = response.data;

    // Use a transaction for efficient database writes
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        const stmt = db.prepare('INSERT OR REPLACE INTO mrr_algos (id, name, raw_data) VALUES (?, ?, ?)');
        algos.forEach(algo => {
          stmt.run(algo.id, algo.name, JSON.stringify(algo));
        });
        stmt.finalize(err => {
          if (err) {
            db.run('ROLLBACK', () => reject(err));
          } else {
            db.run('COMMIT', () => resolve());
          }
        });
      });
    });

    console.log(`[mrr-algos] Successfully stored ${algos.length} algorithms in the database.`);
    memoryCache = algos;
    lastFetchTime = now;
    return algos;
  } catch (error) {
    console.error('[mrr-algos] Error fetching and storing MRR algorithms:', error.message);
    throw error; // Re-throw the error so the caller can handle it
  }
}