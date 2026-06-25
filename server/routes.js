// routes.js – main entry
import { registerCoinGeckoRoutes } from "./coinGecko/coinGecko.js";
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

export async function registerWebSocketRoutes(server) {
  const { setupPriceWebSocket } = await import('./routes/prices.js');
  setupPriceWebSocket(server);
}
