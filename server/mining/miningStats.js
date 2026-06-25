// server/routes/miningStats.js
import { scrapeHeroMinersGlobal } from './heroMiners.js';
import { scrapeMiningDutchGlobal } from './miningDutch.js';
import { asyncHandler } from '../utils.js';

export function registerMiningStatsRoutes(app) {
  app.get('/api/v2/mining-stats/herominers', asyncHandler(async (req, res) => {
    const force = req.query.force === 'true';
    const data = await scrapeHeroMinersGlobal(force);
    if (data.success) {
      res.json(data);
    } else {
      res.status(500).json({ success: false, error: data.error || 'Failed to fetch from HeroMiners' });
    }
  }));

  app.get('/api/v2/mining-stats/miningdutch', asyncHandler(async (req, res) => {
    const force = req.query.force === 'true';
    const data = await scrapeMiningDutchGlobal(force);
    if (data.success) {
      res.json(data);
    } else {
      res.status(500).json({ success: false, error: data.error || 'Failed to fetch from Mining-Dutch' });
    }
  }));

  app.get('/api/v2/mining-stats/all', asyncHandler(async (req, res) => {
    const force = req.query.force === 'true';
    const [hero, dutch] = await Promise.all([
      scrapeHeroMinersGlobal(force),
      scrapeMiningDutchGlobal(force),
    ]);

    res.json({
      herominers: hero,
      miningdutch: dutch,
    });
  }));
}