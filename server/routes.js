import { registerCoinGeckoRoutes } from "./routes/coinGecko.js";
import { registerNiceHashRoutes } from "./routes/nicehash.js";
import { registerNiceHashUpdateRatesRoute } from "./routes/nicehash-update-rates.js";
import { registerMrrRoutes } from "./routes/mrr.js";
import { registerMiscRoutes } from "./routes/misc.js";
import { registerMiningStatsRoutes } from "./routes/miningStats.js";
import { registerHeroMinersRoutes } from "./miners/herominers-routes.js";
import { getHeroMinersProfitEstimates } from "./miners/herominers-profit-estimates.js";

export function registerRoutes(app) {
  console.log('[Routes] Registering API routes...');
  
  // Register all route groups
  // registerCoinGeckoRoutes(app); // NOTE: Price routes are now in nicehash.js, this may cause conflicts.
  registerNiceHashRoutes(app);
  registerMrrRoutes(app);
  registerMiscRoutes(app);
  
  // HeroMiners routes
  try {
    registerHeroMinersRoutes(app);
  } catch (err) {
    console.warn('[Routes] HeroMiners routes not available:', err.message);
  }
  registerMiningStatsRoutes(app);

  // NiceHash batch update rates route
  registerNiceHashUpdateRatesRoute(app).catch(err => {
    console.warn('[Routes] NiceHash update rates route not available:', err.message);
  });
  
  // HeroMiners Profit Estimates
  app.get('/api/v2/mining-stats/herominers/profit-estimates', async (req, res) => {
    try {
      const force = req.query.force === 'true';
      const result = await getHeroMinersProfitEstimates(force);
      res.json(result);
    } catch (error) {
      console.error('[HeroMiners Profit Estimates Error]', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ✅ FIXED: Use '/api' instead of '/api/*' for middleware
  app.use('/api', (req, res) => {
    res.status(404).json({ 
      success: false, 
      error: 'API endpoint not found',
      path: req.path 
    });
  });
  
  console.log('[Routes] ✅ All routes registered');
}
