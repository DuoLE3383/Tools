import { registerCoinGeckoRoutes } from "./routes/coinGecko.js";
import { registerNiceHashRoutes } from "./routes/nicehash.js";
import { registerMrrRoutes } from "./routes/mrr.js";
import { registerMiscRoutes } from "./routes/misc.js";
import { registerMiningStatsRoutes } from "./routes/miningStats.js";
import { registerHeroMinersRoutes } from "./miners/herominers-routes.js";

export function registerRoutes(app) {
  console.log('[Routes] Registering API routes...');
  
  // Register all route groups
  registerCoinGeckoRoutes(app);
  registerNiceHashRoutes(app);
  registerMrrRoutes(app);
  registerMiscRoutes(app);
  registerMiningStatsRoutes(app);
  
  // HeroMiners routes
  try {
    registerHeroMinersRoutes(app);
  } catch (err) {
    console.warn('[Routes] HeroMiners routes not available:', err.message);
  }
  
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