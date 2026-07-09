// routes.js – main entry
import { registerCoinGeckoRoutes } from "./routes/coinGecko.js";
import { registerNiceHashRoutes } from "./routes/nicehash.js";
import { registerMrrRoutes } from "./routes/mrr.js";
import { registerMiscRoutes } from "./routes/misc.js";
import { registerMiningStatsRoutes } from "./routes/miningStats.js"; // see below
import { registerMinerRoutes } from './routes/miner.js';
import { registerPriceCacheRoutes } from './routes/priceCache.js';

export function registerRoutes(app) {
  // Register all route groups
  registerCoinGeckoRoutes(app);
  registerNiceHashRoutes(app);
  registerMrrRoutes(app);
  registerMinerRoutes(app);
  registerMiscRoutes(app);
  registerMiningStatsRoutes(app);
  registerPriceCacheRoutes(app);
}
