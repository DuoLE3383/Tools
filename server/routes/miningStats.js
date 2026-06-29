// server/routes/miningStats.js
import express from 'express';
import { scrapeMiningDutchGlobal } from '../miners/miningDutch.js';

const router = express.Router();

/**
 * GET /api/v2/mining-stats/miningdutch
 * Get MiningDutch stats
 */
router.get('/miningdutch', async (req, res) => {
  try {
    // Note: MiningDutch API for global stats doesn't use address or coin.
    // It requires a BTC price for USD conversion, which is handled internally.
    const force = req.query.force === 'true';
    const stats = await scrapeMiningDutchGlobal(null, force);

    return res.json({
      miningdutch: {
        ...stats,
        fetchedAt: new Date().toISOString(),
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[MiningDutch API Error]', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export function registerMiningStatsRoutes(app) {
  app.use('/api/v2/mining-stats', router);
}