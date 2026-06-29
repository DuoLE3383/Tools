// server/routes.js – main entry
import { registerCoinGeckoRoutes } from "./routes/coinGecko.js";
import { registerNiceHashRoutes } from "./routes/nicehash.js";
import { registerMrrRoutes } from "./routes/mrr.js";
import { registerMiscRoutes } from "./routes/misc.js";
import { registerMiningStatsRoutes } from "./routes/miningStats.js"; // This was missing from your provided file list, but is in the fix.
import { registerHeroMinersRoutes } from "./miners/herominers-routes.js";
import { startPriceFetcherJob } from "./routes/price-fetcher.js";
import { startHeroMinersMonitor } from "./miners/herominers-monitor.js";

let servicesStarted = false;

// ==========================
//  ROUTE REGISTRATION
// ==========================

export function registerRoutes(app) {
  console.log('[Routes] Registering API routes...');

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage()
    });
  });

  // Version info
  app.get('/api/version', (req, res) => {
    res.json({
      version: process.env.npm_package_version || '1.0.0',
      node: process.version,
      env: process.env.NODE_ENV || 'development'
    });
  });

  // ==========================
  //  ROUTE GROUPS
  // ==========================

  // CoinGecko routes - cryptocurrency price data
  registerCoinGeckoRoutes(app);
  console.log('[Routes] ✅ CoinGecko routes registered');

  // NiceHash routes - marketplace data
  registerNiceHashRoutes(app);
  console.log('[Routes] ✅ NiceHash routes registered');

  // MRR routes - rental management
  registerMrrRoutes(app);
  console.log('[Routes] ✅ MRR routes registered');

  // Misc routes - utility endpoints
  registerMiscRoutes(app);
  console.log('[Routes] ✅ Misc routes registered');
  
  // Mining stats routes - general mining data
  registerMiningStatsRoutes(app);

  // HeroMiners routes - pool stats
  registerHeroMinersRoutes(app);
  console.log('[Routes] ✅ HeroMiners routes registered');

  // ==========================
  //  BACKGROUND SERVICES
  // ==========================

  if (servicesStarted) {
    console.log('[Routes] ℹ️ Background services already started, skipping initialization.');
    return;
  }

  // Start price fetcher job (CoinGecko prices)
  // This job is now started in the main index.js to prevent double initialization.
  const heroMinersAddresses = process.env.HEROMINERS_ADDRESSES;
  if (heroMinersAddresses) {
    try {
      const addresses = JSON.parse(heroMinersAddresses);
      if (addresses.length > 0) {
        startHeroMinersMonitor();
        console.log(`[Routes] ✅ HeroMiners monitor started (${addresses.length} addresses)`);
      }
    } catch (error) {
      console.error('[Routes] ❌ Failed to parse HEROMINERS_ADDRESSES:', error.message);
    }
  } else {
    console.log('[Routes] ℹ️ HeroMiners monitor skipped (no addresses configured)');
  }

  servicesStarted = true;

  // ==========================
  //  ERROR HANDLING
  // ==========================

  // 404 handler - catch all unmatched routes
  app.use((req, res) => {
    console.warn(`[Routes] 404: ${req.method} ${req.path}`);
    res.status(404).json({
      success: false,
      error: 'Not Found',
      path: req.path,
      method: req.method
    });
  });

  // Global error handler
  app.use((err, req, res, next) => {
    console.error('[Routes] Unhandled error:', err);
    
    // Determine status code
    const statusCode = err.statusCode || err.status || 500;
    const message = err.message || 'Internal Server Error';
    
    // Hide stack traces in production
    const response = {
      success: false,
      error: message,
      timestamp: new Date().toISOString()
    };

    // Add stack trace in development
    if (process.env.NODE_ENV !== 'production' && err.stack) {
      response.stack = err.stack;
    }

    res.status(statusCode).json(response);
  });

  console.log('[Routes] ✅ All routes registered');
}

// ==========================
//  EXPORT HELPER FUNCTIONS
// ==========================

/**
 * Check if a route exists
 */
export function routeExists(app, path, method = 'GET') {
  const stack = app._router?.stack || [];
  return stack.some(layer => {
    if (layer.route) {
      const routePath = layer.route.path;
      const routeMethods = Object.keys(layer.route.methods);
      return routePath === path && routeMethods.includes(method.toLowerCase());
    }
    return false;
  });
}

/**
 * Get all registered routes
 */
export function getRegisteredRoutes(app) {
  const routes = [];
  const stack = app._router?.stack || [];
  
  for (const layer of stack) {
    if (layer.route) {
      const path = layer.route.path;
      const methods = Object.keys(layer.route.methods).map(m => m.toUpperCase());
      routes.push({ path, methods });
    }
  }
  
  return routes;
}