// routes.js – main entry
import { registerCoinGeckoRoutes } from "./routes/coinGecko.js";
import { registerNiceHashRoutes } from "./routes/nicehash.js";
import { registerMrrRoutes } from "./routes/mrr.js";
import { registerMiscRoutes } from "./routes/misc.js";
import { registerMiningStatsRoutes } from "./routes/miningStats.js";

export function registerRoutes(app) {
  // Register all route groups
  registerCoinGeckoRoutes(app);
  registerNiceHashRoutes(app);
  registerMrrRoutes(app);
  registerMiscRoutes(app);
  registerMiningStatsRoutes(app);
}