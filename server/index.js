// server/index.js
import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { registerRoutes } from './routes.js';
import { setupWebSocket } from './ws.js';
import { startMiningOpportunityScanner } from './miningOpportunityNotifier.js';

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
app.options('*', cors());

// Register routes
registerRoutes(app);

// ✅ Setup WebSocket
setupWebSocket(server);

// Start mining opportunity scanner
startMiningOpportunityScanner();

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`   - API: http://localhost:${PORT}/api`);
  console.log(`   - WebSocket: ws://localhost:${PORT}/ws`);
});