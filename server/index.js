// index.js
import express from 'express';
import http from 'http';
import dotenv from 'dotenv';
import cors from 'cors';
import { registerRoutes } from './routes.js';
import { setupWebSocket } from './ws.js';
import { startMiningOpportunityScanner } from './miningOpportunityNotifier.js';

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);

// Enable cross-origin requests for all routes
app.use(cors());

// Middleware
app.use(express.json());

// Register all routes
registerRoutes(app);

// Setup WebSocket (using the ws.js module)
setupWebSocket(server);

// Start the server
const PORT = process.env.PORT || 3939;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 WebSocket server at ws://localhost:${PORT}/api/v2/mrr/fetch/ws`);
  
  // Start the mining scanner after server is ready
  console.log('[Mining Scanner] Initializing...');
  startMiningOpportunityScanner();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down...');
  server.close(() => {
    console.log('[Server] Goodbye!');
    process.exit(0);
  });
});