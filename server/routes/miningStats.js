// server/routes/miningStats.js
import { Router } from 'express';
import { scrapeHeroMinersGlobal, scrapeMiningDutchGlobal } from '../miningOpportunityNotifier.js';
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

export const registerMiningStatsRoutes = (app) => {
  app.use('/api/v2', router);
};