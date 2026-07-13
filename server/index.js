// server/index.js
import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { registerRoutes } from './routes.js';
import { setupWebSocket } from './ws.js';
import { startMiningOpportunityScanner } from './miningOpportunityNotifier.js';
import { startKryptexMonitor } from './miners/kryptex-monitor.js';

dotenv.config();

export const app = express();
export const server = http.createServer(app);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Configure CORS properly
app.use(cors({
  origin: ['http://localhost:1757', 'http://localhost:3003', 'http://localhost:3000', '*'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Session-Id'],
}));

// ✅ Also handle OPTIONS preflight requests
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Session-Id');
    return res.sendStatus(204);
  }
  next();
});

// Register routes
registerRoutes(app);

// ✅ Setup WebSocket
setupWebSocket(server);

// Start mining opportunity scanner
startMiningOpportunityScanner();

// Start Kryptex monitor (periodic snapshots of configured addresses)
startKryptexMonitor();

// Start server
const PORT = process.env.PORT;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`   - API: http://localhost:${PORT}/api`);
  console.log(`   - WebSocket: ws://localhost:${PORT}/ws`);
});
