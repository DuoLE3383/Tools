// server/routes/miningStats.js
import { Router } from 'express';
import { scrapeHeroMinersGlobal, scrapeMiningDutchGlobal } from '../miningOpportunityNotifier.js';
import { fetch2MinersStats, fetchK1PoolStats, fetchKryptexStats, fetchAllPoolStats } from '../miningPoolProviders.js';
import { asyncHandler } from '../utils.js';
import { getBtcPrice } from '../utils/priceUtils.js';

const router = Router();

router.get('/mining-stats/herominers', async (req, res) => {
  const force = req.query.force === 'true';
  const btcPrice = await getBtcPrice();
  const result = await scrapeHeroMinersGlobal(btcPrice, force);
  res.json({ herominers: result });
});

router.get('/mining-stats/miningdutch', async (req, res) => {
  const force = req.query.force === 'true';
  const btcPrice = await getBtcPrice();
  const result = await scrapeMiningDutchGlobal(btcPrice, force);
  res.json({ miningdutch: result });
});

// ─── 2Miners Pool Stats ─────────────────────────────────────
router.get('/mining-stats/2miners', asyncHandler(async (req, res) => {
  const result = await fetch2MinersStats();
  res.json({ "2miners": result });
}));

// ─── K1Pool Stats ───────────────────────────────────────────
router.get('/mining-stats/k1pool', asyncHandler(async (req, res) => {
  const result = await fetchK1PoolStats();
  res.json({ k1pool: result });
}));

// ─── Kryptex Stats ──────────────────────────────────────────
router.get('/mining-stats/kryptex', asyncHandler(async (req, res) => {
  const result = await fetchKryptexStats();
  res.json({ kryptex: result });
}));

// ─── All Pools (unified) ────────────────────────────────────
router.get('/mining-stats/all', asyncHandler(async (req, res) => {
  const result = await fetchAllPoolStats();
  res.json(result);
}));

export const registerMiningStatsRoutes = (app) => {
  app.use('/api/v2', router);
};
