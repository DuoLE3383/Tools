// /miners/herominers-routes.js
import express from 'express';
import { scrapeHeroMinersGlobal, scrapeHeroMinersAddress, COIN_TO_ALGO_MAP } from './heroMiners.js';
import { HeroMinersAPI } from './herominers-api.js';
import { parseHeroMinersResponse, buildDashboardData } from './herominers-parser.js';
import { getCoinPricesFromDb } from '../coinGecko/coinGeckoClient.js';

const router = express.Router();

// Supported coins
const SUPPORTED_COINS = [...new Set(Object.keys(COIN_TO_ALGO_MAP).map(c => c.toUpperCase()))];

/**
 * GET /api/v2/mining-stats/herominers
 * Get miner stats from HeroMiners
 */
router.get('/herominers', async (req, res) => {
  try {
    const { address, coin = 'ZEPH' } = req.query;

    // Validate inputs
    if (!address) {
      return res.status(400).json({
        success: false,
        error: 'Address is required'
      });
    }

    const coinUpper = coin.toUpperCase();
    if (!SUPPORTED_COINS.includes(coinUpper)) {
      return res.status(400).json({
        success: false,
        error: `Unsupported coin. Supported: ${SUPPORTED_COINS.join(', ')}`
      });
    }

    // Create API client
    const api = new HeroMinersAPI({
      timeout: 30000
    });

    // Get miner stats
    const response = await api.getMinerStats(address, coinUpper);

    // Parse response
    const parsed = parseHeroMinersResponse(response, address, coinUpper);
    
    if (!parsed) {
      return res.status(404).json({
        success: false,
        error: 'No data found for this address'
      });
    }

    // Get price data for the coin
    const prices = await getCoinPricesFromDb([coinUpper]);
    const priceData = prices[coinUpper] || {};

    // Build dashboard data
    const dashboard = buildDashboardData(parsed, priceData);

    // Return full response
    return res.json({
      success: true,
      data: dashboard,
      raw: parsed,
      address,
      coin: coinUpper,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[HeroMiners API Error]', error.message);
    
    // Handle specific errors
    if (error.message.includes('timeout')) {
      return res.status(504).json({
        success: false,
        error: 'Request timeout. Please try again.'
      });
    }

    if (error.message.includes('404')) {
      return res.status(404).json({
        success: false,
        error: 'Address not found on HeroMiners'
      });
    }

    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch miner stats'
    });
  }
});

/**
 * GET /api/v2/mining-stats/herominers/hashrate
 * Get hashrate history
 */
router.get('/herominers/hashrate', async (req, res) => {
  try {
    const { address, coin = 'ZEPH', period = '24h' } = req.query;

    if (!address) {
      return res.status(400).json({
        success: false,
        error: 'Address is required'
      });
    }

    const api = new HeroMinersAPI();
    const response = await api.getMinerHashrateHistory(address, coin.toUpperCase(), period);

    return res.json({
      success: true,
      data: response,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[HeroMiners Hashrate History Error]', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v2/mining-stats/herominers/payments
 * Get payment history
 */
router.get('/herominers/payments', async (req, res) => {
  try {
    const { address, coin = 'ZEPH', limit = 50 } = req.query;

    if (!address) {
      return res.status(400).json({
        success: false,
        error: 'Address is required'
      });
    }

    const api = new HeroMinersAPI();
    const response = await api.getMinerPayments(address, coin.toUpperCase(), parseInt(limit));

    return res.json({
      success: true,
      data: response,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[HeroMiners Payments Error]', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v2/mining-stats/herominers/pool
 * Get pool stats
 */
router.get('/herominers/pool', async (req, res) => {
  try {
    const { coin = 'ZEPH' } = req.query;

    const api = new HeroMinersAPI();
    const response = await api.getPoolStats(coin.toUpperCase());

    return res.json({
      success: true,
      data: response,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[HeroMiners Pool Stats Error]', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v2/mining-stats/herominers/network
 * Get network stats
 */
router.get('/herominers/network', async (req, res) => {
  try {
    const { coin = 'ZEPH' } = req.query;

    const api = new HeroMinersAPI();
    const response = await api.getNetworkStats(coin.toUpperCase());

    return res.json({
      success: true,
      data: response,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[HeroMiners Network Stats Error]', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/v2/mining-stats/herominers/batch
 * Batch check multiple addresses
 */
router.post('/herominers/batch', async (req, res) => {
  try {
    const { addresses, coin: coinName = 'ZEPH' } = req.body;
    const coin = coinName.toUpperCase();

    if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
      return res.status(400).json({
        error: '`addresses` array is required in the request body.'
      });
    }

    const api = new HeroMinersAPI();
    const results = [];

    for (const address of addresses) {
      try {
        const response = await api.getMinerStats(address, coin);
        const parsed = parseHeroMinersResponse(response, address, coin); // Use original coin name for parsing
        results.push({
          address,
          success: true,
          data: parsed
        });
      } catch (error) {
        results.push({
          address,
          success: false,
          error: error.message
        });
      }
    }

    return res.json({
      success: true,
      data: results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[HeroMiners Batch Error]', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v2/mining-stats/herominers/global
 * Get global pool stats from all discovered HeroMiners pools.
 */
router.get('/herominers/global', async (req, res) => {
  try {
    const force = req.query.force === 'true';
    // btcPrice is fetched inside scrapeHeroMinersGlobal
    const result = await scrapeHeroMinersGlobal(null, force);
    res.json({
      herominers: {
        ...result,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[HeroMiners Global Error]', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v2/mining-stats/herominers/address
 * Get global stats for a specific address across all coins on HeroMiners.
 */
router.get('/herominers/address', async (req, res) => {
  try {
    const { address, coin } = req.query;
    if (!address) {
      return res.status(400).json({ success: false, error: 'Address query parameter is required.' });
    }
    if (!coin) {
      return res.status(400).json({ success: false, error: 'Coin query parameter is required.' });
    }
    
    const api = new HeroMinersAPI();
    const rawData = await api.getMinerStats(address, coin);

    if (!rawData) {
      return res.status(404).json({ success: false, error: 'No data found for this address.' });
    }

    const parsed = parseHeroMinersResponse(rawData, address, coin);
    if (!parsed) {
      return res.status(500).json({ success: false, error: 'Failed to parse API response.' });
    }

    const prices = await getCoinPricesFromDb([coin.toUpperCase()]);
    const dashboardData = buildDashboardData(parsed, prices[coin.toUpperCase()] || {});

    return res.json({
      success: true,
      data: { ...dashboardData, raw: parsed },
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    const errorMessage = error.message || 'An unknown error occurred';
    console.error('[HeroMiners Address Error]', errorMessage);

    if (errorMessage.includes('status 404') || errorMessage.includes('404')) {
      return res.status(404).json({ success: false, error: `Address not found on HeroMiners for coin ${req.query.coin}.` });
    }

    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v2/mining-stats/herominers/multi
 * Batch-monitor multiple coin/address pairs at once.
 * Query format: ?pairs=CFX:0xADDR&pairs=KASPA:kaspa:ADDR&pairs=QRL:Q...
 */
router.get('/herominers/multi', async (req, res) => {
  try {
    let pairs;
    if (req.query.pairs) {
      pairs = Array.isArray(req.query.pairs) ? req.query.pairs : [req.query.pairs];
    } else if (req.query.addresses && req.query.coins) {
      // Support parallel arrays: ?coins=CFX,KAS&addresses=addr1,addr2
      const coins = Array.isArray(req.query.coins) ? req.query.coins : [req.query.coins];
      const addrs = Array.isArray(req.query.addresses) ? req.query.addresses : [req.query.addresses];
      pairs = coins.map((c, i) => `${c}:${addrs[i] || addrs[0]}`);
    } else {
      return res.status(400).json({
        success: false,
        error: 'Provide pairs (e.g. ?pairs=CFX:0xADDR&pairs=KAS:kaspa:ADDR) or coins+addresses arrays.'
      });
    }

    const api = new HeroMinersAPI({ timeout: 15000 });
    const results = [];

    // Fetch each pair in parallel
    const fetches = pairs.map(async (pair) => {
      const [coin, ...addrParts] = pair.split(':');
      const address = addrParts.join(':');
      if (!coin || !address) return null;
      try {
        const raw = await api.getMinerStats(address, coin.trim());
        if (!raw) return { coin: coin.trim().toUpperCase(), address, success: false, error: 'No data' };
        const parsed = parseHeroMinersResponse(raw, address, coin.trim());
        if (!parsed) return { coin: coin.trim().toUpperCase(), address, success: false, error: 'Parse failed' };
        const prices = await getCoinPricesFromDb([coin.trim().toUpperCase()]);
        const dashboard = buildDashboardData(parsed, prices[coin.trim().toUpperCase()] || {});
        return { coin: coin.trim().toUpperCase(), address, success: true, ...dashboard };
      } catch (e) {
        return { coin: coin.trim().toUpperCase(), address, success: false, error: e.message };
      }
    });

    const settled = await Promise.allSettled(fetches);
    settled.forEach((s) => {
      if (s.status === 'fulfilled' && s.value) results.push(s.value);
      else if (s.status === 'rejected') results.push({ success: false, error: s.reason.message });
    });

    return res.json({ success: true, data: results, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('[HeroMiners Multi Error]', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

export function registerHeroMinersRoutes(app) {
  app.use('/api/v2/mining-stats', router);
}
