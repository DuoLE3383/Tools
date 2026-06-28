// server/index.js
import express from 'express';
import http from 'http';
import 'dotenv/config'; // Use the more standard way to load dotenv
import { registerRoutes } from './routes.js';
import { setupWebSocket } from './ws.js';

// Load environment variables

const app = express();
const server = http.createServer(app);

// ==========================
//  MIDDLEWARE
// ==========================

// JSON parser
app.use(express.json({ limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// CORS headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// ==========================
//  ROUTES
// ==========================

// Register all routes
registerRoutes(app);

// ==========================
//  WEBSOCKET SETUP
// ==========================

setupWebSocket(server);

// ==========================
//  START SERVER
// ==========================

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log('\n' + '='.repeat(60));
  console.log(`🚀 Server running on http://${HOST}:${PORT}`);
  console.log(`📡 WebSocket: ws://${HOST}:${PORT}/api/v2/mrr/fetch/ws`);
  console.log(`🔍 HeroMiners API: http://${HOST}:${PORT}/api/v2/mining-stats/herominers`);
  console.log(`💚 Health: http://${HOST}:${PORT}/api/health`);
  console.log('='.repeat(60) + '\n');
  
  // Background jobs are now started inside registerRoutes
  // to ensure they are initialized with the app.
});

// ==========================
//  GRACEFUL SHUTDOWN
// ==========================

let isShuttingDown = false;

function gracefulShutdown(signal) {
  if (isShuttingDown) {
    console.log('[Server] Already shutting down...');
    return;
  }
  
  isShuttingDown = true;
  console.log(`\n[Server] Received ${signal}, shutting down gracefully...`);

  // Close server
  server.close(() => {
    console.log('[Server] HTTP server closed');
    console.log('[Server] Goodbye! 👋');
    process.exit(0);
  });

  // Force shutdown after timeout
  setTimeout(() => {
    console.error('[Server] Force shutdown after timeout');
    process.exit(1);
  }, 10000);
}

// Handle signals
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('[Server] Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled Rejection at:', promise, 'reason:', reason);
});

export { app, server };