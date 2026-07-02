import { registerNiceHashRoutes } from "./routes/nicehash.js";
import { registerMiscRoutes } from "./routes/misc.js";

export function registerRoutes(app) {
  console.log('[Routes] Registering API routes...');
  
  // Register all route groups
  registerNiceHashRoutes(app);
  registerMiscRoutes(app);
  
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