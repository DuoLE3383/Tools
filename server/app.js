import http from 'http';
import express from 'express';
import path from 'path';
import { setupWebSocket } from './ws.js';
import { SyncManager } from '../SyncManager.js'; // Assuming SyncManager is in the root
import { db } from './db.js'; // db is now simpler
import { initNhConfigs, nhConfigs, getNiceHashApp, resolveNhClient } from './nh.js';
import { initMrrConfigs, mrrConfigs, initNonces, syncMrrClock, mrrApiCall } from './mrr.js';
import { registerRoutes } from './routes.js';
import { corsMiddleware, logRequestMiddleware } from './utils.js';
import { logger } from './logger.js';
import { runRentalMonitor } from './monitor.js';
import { startMiningOpportunityScanner } from './mining/miningOpportunityNotifier.js';
import { authMiddleware, generateToken } from './auth.js';
import authRoutes from './auth.js';

export function createApp({ distPath }) {
  const app = express();
  app.set('etag', false);
  app.use(express.json({ limit: '2mb' }));
  app.use(corsMiddleware);
  app.use(logRequestMiddleware);

  // Authentication routes
  app.use('/api/auth', authRoutes);

  registerRoutes(app);

  // Create HTTP server and attach WebSocket
  const server = http.createServer(app);
  setupWebSocket(server);
  app.server = server;

  if (distPath) {
    const originalListen = app.listen;
    app.listen = function(...args) {
      return server.listen(...args);
    };
  }

  if (distPath) {
    app.use(express.static(distPath));
    app.get(/.*/, (req, res) => {
      if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'Not Found' });
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return app;
}

export async function initializeApp(env) {
  try {
    logger.info('🚀 Initializing system...');
    initNhConfigs(env); // Initialize NiceHash configurations
    initMrrConfigs(env); // Initialize MiningRigRentals configurations

    // Validate Authentication Configuration
    const requiredAuth = ['JWT_SECRET', 'ADMIN_USER', 'ADMIN_PASS'];
    const missing = requiredAuth.filter(key => !env[key]);

    if (missing.length > 0) {
      logger.warn(`⚠️  WARNING: Missing authentication variables: ${missing.join(', ')}. Login will fail.`);
    } else {
      logger.info('✅ Auth Configuration Loaded:');
      logger.info(`   - ADMIN_USER: ${env.ADMIN_USER}`);
      logger.info(`   - JWT_SECRET: ${env.JWT_SECRET ? '******** (Set)' : 'MISSING'}`);
      logger.info(`   - ADMIN_PASS: ${env.ADMIN_PASS ? '******** (Set)' : 'MISSING'}`);
    }

    await initNonces();
    await syncMrrClock();
  } catch (error) {
    logger.error('❌ Critical Initialization Failure:', error.message);
    process.exit(1);
  }

  const syncManager = new SyncManager({ db, nhConfigs, mrrConfigs, mrrApiCall, resolveNhClient, getNiceHashApp });
  syncManager.run();

  // Start the monitor: first a force heartbeat after 15s (once DB/API are warm),
  // then recurse every 60s for routine scans (non-force)
  const startMonitor = async () => {
    try {
      await runRentalMonitor();
    } catch (err) {
      logger.error('[Monitor] Loop error:', err.message);
    } finally {
      // Schedule next run in 60s
      setTimeout(startMonitor, 60000);
    }
  };

  // Delay first heartbeat until sync/app load is complete (15s)
  setTimeout(() => {
    runRentalMonitor(true)
      .then(() => startMonitor())
      .catch((err) => {
        logger.error('[Monitor] Force heartbeat failed, starting normal loop anyway:', err.message);
        startMonitor();
      });
  }, 15000);

  // Start mining opportunity scanner for Telegram alerts
  setTimeout(() => startMiningOpportunityScanner(), 30000);

  try {
    const { client } = resolveNhClient('BT');
    if (client) {
      getNiceHashApp(client).public.getTime().then((t) => {
        logger.info('✅ Connection verified. Server Time:', new Date(t).toLocaleString());
      }).catch((e) => logger.warn('⚠️ NiceHash connectivity check failed on start:', e.message));
    }
  } catch (error) {
    logger.error('❌ Initialization Error:', error.message);
  }
}
