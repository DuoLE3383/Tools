import express from 'express';
import cors from 'cors';
import { SyncManager } from '../SyncManager.js'; // Assuming SyncManager is in the root
import { getDb } from './db.js'; // db is now simpler
import { initNhConfigs, nhConfigs, getNiceHashApp, resolveNhClient } from './nh.js';
import { initMrrConfigs, mrrConfigs, initNonces, syncMrrClock, mrrApiCall } from './mrr.js';
import { registerRoutes } from './routes.js';
import { logRequestMiddleware } from './utils.js';
import { runRentalMonitor } from './monitor.js';
import { startMiningOpportunityScanner } from './miningOpportunityNotifier.js'; 
import authRoutes, { validateAuthConfig } from './auth.js';
import { fetchAndSaveCoinPrices, updateCoinMetadata } from './coinGecko/coinGeckoClient.js';

export function createApp({ distPath }) {
  const app = express();
  app.set('etag', false);
  app.use(express.json({ limit: '2mb' }));

  // More robust CORS configuration based on your suggestions
  const allowedOrigins = [
    'https://huyenbao.com',
    'https://www.huyenbao.com',
    'https://api.huyenbao.com',
    'https://*.huyenbao.com',
    'http://localhost:1757', // Vite dev server from vite.config.js
    'http://localhost:3003', // Backend itself for self-requests
  ];

  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or server-to-server)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        // Block other origins
        callback(new Error('Not allowed by CORS policy.'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Session-Id'],
  }));

  app.use(logRequestMiddleware);

  // Authentication routes
  app.use('/api/auth', authRoutes);

  if (distPath) {
    app.use(express.static(distPath));
  }

  return app;
}

export async function initializeApp(env) {
  try {
    console.log('🚀 Initializing system...');
    initNhConfigs(env); // Initialize NiceHash configurations
    initMrrConfigs(env); // Initialize MiningRigRentals configurations
    try {
      validateAuthConfig(); // Centralized auth config validation
    } catch (authErr) {
      console.warn('⚠️ Auth config issue (non-fatal):', authErr.message);
    }

    await initNonces();
    await syncMrrClock();
    await updateCoinMetadata();
    // Populate the DB before the UI starts requesting prices.  A failed price
    // refresh is non-fatal: the price route can retry it on the next request.
    const priceResult = await fetchAndSaveCoinPrices();
    if (!priceResult.success) {
      console.warn('[CoinGecko] Initial price refresh failed:', priceResult.error);
    }
  } catch (error) {
    console.error('❌ Critical Initialization Failure:', error.message);
    process.exit(1);
  }

  const db = await getDb();
  const syncManager = new SyncManager({ db, nhConfigs, mrrConfigs, mrrApiCall, resolveNhClient, getNiceHashApp });
  syncManager.run();

  // Start the monitor: first a force heartbeat after 15s (once DB/API are warm),
  // then recurse every 10 min for routine scans (non-force)
  const startMonitor = async () => {
    try {
      await runRentalMonitor();
    } catch (err) {
      console.error('[Monitor] Loop error:', err.message);
    } finally {
      // Schedule next run in 10 min
      setTimeout(startMonitor, 600000);
    }
  };

  // Delay first heartbeat until sync/app load is complete (15s)
  setTimeout(() => {
    runRentalMonitor(true)
      .then(() => startMonitor())
      .catch((err) => {
        console.error('[Monitor] Force heartbeat failed, starting normal loop anyway:', err.message);
        startMonitor();
      });
  }, 15000);

  try {
    const { client } = resolveNhClient('BT');
    if (client) {
      getNiceHashApp(client).public.getTime().then((t) => {
        console.log('✅ Connection verified. Server Time:', new Date(t).toLocaleString());
      }).catch((e) => console.warn('⚠️ NiceHash connectivity check failed on start:', e.message));
    }
  } catch (error) {
    console.error('❌ Initialization Error:', error.message);
  }
}
