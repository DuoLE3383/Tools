// server/routes/external-pools.js
import express from "express";
import { asyncHandler } from "../utils.js";

const router = express.Router();

const fetchWithTimeout = async (url, options = {}, timeout = 8000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  const response = await fetch(url, {
    ...options,
    signal: controller.signal,
  });
  clearTimeout(id);
  return response;
};

/**
 * Normalizes data from different pool APIs into a consistent format.
 */
const normalizePoolData = (pool, source, data) => {
  if (pool === 'herominers') {
    return {
      source: 'HeroMiners',
      hashrate: data.hashrate || '0 H/s',
      hashrate_24h: data.hashrate_24h || '0 H/s',
      balance: data.stats?.balance || 0,
      paid: data.stats?.paid || 0,
      workersOnline: data.workers?.length || 0,
      lastShare: data.stats?.last_share ? new Date(data.stats.last_share * 1000).toLocaleString() : 'N/A',
      raw: data,
    };
  }
  if (pool === '2miners') {
    return {
      source: '2Miners',
      hashrate: data.currentHashrate || 0,
      hashrate_24h: data.hashrate || 0,
      balance: data.stats?.balance || 0,
      paid: data.stats?.paid || 0,
      workersOnline: data.workersOnline || 0,
      lastShare: data.lastBeat ? new Date(data.lastBeat * 1000).toLocaleString() : 'N/A',
      raw: data,
    };
  }
  return source;
};


// Route for HeroMiners
router.get(
  "/api/v2/pool/herominers/:coin/:address",
  asyncHandler(async (req, res) => {
    const { coin, address } = req.params;
    if (!coin || !address) {
      return res.status(400).json({ success: false, error: "Coin and address are required." });
    }

    try {
      const apiUrl = `https://${coin}.herominers.com/api/stats_address?address=${address}`;
      const response = await fetchWithTimeout(apiUrl);

      if (!response.ok) {
        throw new Error(`HeroMiners API returned status ${response.status}`);
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }

      const normalizedData = normalizePoolData('herominers', data);
      res.json({ success: true, data: normalizedData });

    } catch (err) {
      res.status(500).json({ success: false, error: `Failed to fetch from HeroMiners: ${err.message}` });
    }
  })
);

// Route for 2Miners
router.get(
  "/api/v2/pool/2miners/:coin/:address",
  asyncHandler(async (req, res) => {
    const { coin, address } = req.params;
    if (!coin || !address) {
      return res.status(400).json({ success: false, error: "Coin and address are required." });
    }

    try {
      const apiUrl = `https://${coin}.2miners.com/api/accounts/${address}`;
      const response = await fetchWithTimeout(apiUrl, {
        headers: { 'User-Agent': 'Mining-Tool/1.0' } // 2Miners may require a User-Agent
      });

      if (!response.ok) {
        if (response.status === 404) {
          return res.status(404).json({ success: false, error: "Wallet address not found on 2Miners." });
        }
        throw new Error(`2Miners API returned status ${response.status}`);
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }

      const normalizedData = normalizePoolData('2miners', data);
      res.json({ success: true, data: normalizedData });

    } catch (err) {
      res.status(500).json({ success: false, error: `Failed to fetch from 2Miners: ${err.message}` });
    }
  })
);

export default router;